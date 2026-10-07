import type { Request, Response } from 'express'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { confirmAttendancePageTemplate } from '@schedly/notifications'
import { prisma, type TransactionClient } from '../lib/prisma.js'
import { recordAuditEvent } from '../lib/audit.js'
import { fail, ok } from '../lib/response.js'
import {
  buildAppointmentConfirmationData,
  buildAppointmentModifiedData,
  buildAppointmentCancelledByPatientData,
  buildNewBookingForProfessionalData,
  buildProfessionalCancellationNoticeData,
  buildProfessionalRescheduleNoticeData,
  type AppointmentWithService,
} from '../lib/notification-data.js'
import { getEmailService } from '../lib/email-service.js'
import { ensureGoogleMeetEvent, cancelGoogleMeetEventForAppointment } from '../lib/google-meet.js'
import type { Appointment, Service } from '../generated/prisma/index.js'

// P2034 = "Transaction failed due to a write conflict or a deadlock. Please retry
// your transaction" — se compara por código en vez de `instanceof` porque el tipo
// exportado por el cliente generado no siempre se resuelve bien para narrowing.
function isSerializationConflictError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code: unknown }).code === 'P2034'
}

/**
 * Corre `fn` en una transacción Serializable, reintentando si Postgres aborta
 * por conflicto de escritura (P2034) — puede pasar bajo concurrencia real
 * incluso cuando el chequeo de solapamiento dentro de la transacción no
 * detectó nada, porque otra transacción concurrente reservó el mismo
 * horario en simultáneo. Sin esto, dos reservas para el mismo horario
 * podían quedar ambas activas (ver docs/deuda-tecnica.md).
 */
async function runSerializable<T>(fn: (tx: TransactionClient) => Promise<T>, attempts = 3): Promise<T> {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await prisma.$transaction(fn, { isolationLevel: 'Serializable' })
    } catch (err) {
      const isSerializationConflict = isSerializationConflictError(err)
      if (isSerializationConflict && attempt < attempts) continue
      throw err
    }
  }
  throw new Error('unreachable')
}

const createSchema = z.object({
  serviceId: z.string().min(1),
  startDateTime: z.string().datetime({ offset: true }),
  modality: z.enum(['presential', 'online']),
  clientName: z.string().min(1),
  clientEmail: z.string().email(),
  clientPhone: z.string().min(1),
  notes: z.string().optional(),
  saveClientData: z.boolean().optional(),
  rut: z.string().optional(),
  paymentMethod: z.enum(['transfer', 'cash']).optional(),
})

const rescheduleSchema = z.object({
  newStartDateTime: z.string().datetime({ offset: true }),
})

function isSameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  )
}

function generateToken(): string {
  // Es la única credencial para cancelar/reagendar una cita sin login vía link
  // público — debe ser criptográficamente segura, no adivinable.
  return `tok_${randomUUID()}`
}

function calculateTokenExpiry(startDateTime: Date): Date {
  const expires = new Date(startDateTime)
  expires.setUTCDate(expires.getUTCDate() - 1)
  expires.setUTCHours(23, 0, 0, 0)
  return expires
}

export async function createAppointment(req: Request, res: Response): Promise<void> {
  const parsed = createSchema.safeParse(req.body)
  if (!parsed.success) {
    fail(res, parsed.error.issues[0]?.message ?? 'Invalid body', 400)
    return
  }

  const { serviceId, startDateTime, modality, clientName, clientEmail, clientPhone, notes, saveClientData, rut, paymentMethod } =
    parsed.data
  const professionalId = process.env.PROFESSIONAL_ID ?? ''

  const service = await prisma.service.findUnique({ where: { id: serviceId } })
  if (!service || service.professionalId !== professionalId || !service.isActive) {
    fail(res, 'Service not found', 404)
    return
  }

  const start = new Date(startDateTime)
  const end = new Date(start.getTime() + service.duration * 60_000)
  const now = new Date()
  const bookingFlow = isSameCalendarDay(start, now) ? 'same_day' : 'advance'
  const paymentDeadline = bookingFlow === 'same_day'
    ? end
    : new Date(now.getTime() + 24 * 60 * 60 * 1000)

  const isCash = paymentMethod === 'cash'
  const appointmentToken = generateToken()
  const tokenExpiresAt = calculateTokenExpiry(start)

  try {
    const appointment = await runSerializable(async (tx) => {
      const conflict = await tx.appointment.findFirst({
        where: {
          professionalId,
          status: { not: 'cancelled' },
          startDateTime: { lt: end },
          endDateTime: { gt: start },
        },
      })
      if (conflict) throw new Error('SLOT_TAKEN')

      if (saveClientData) {
        await tx.client.upsert({
          where: { email: clientEmail },
          create: { email: clientEmail, name: clientName, phone: clientPhone, rut, dataConsentGiven: true },
          update: { name: clientName, phone: clientPhone, rut, dataConsentGiven: true },
        })
      }

      return tx.appointment.create({
        data: {
          professionalId,
          serviceId,
          clientName,
          clientEmail,
          clientPhone,
          startDateTime: start,
          endDateTime: end,
          modality,
          notes,
          status: isCash ? 'confirmed' : 'pending',
          paymentStatus: isCash ? 'paid' : 'unpaid',
          paymentMethod: paymentMethod ?? null,
          paymentAmount: isCash ? service.price : null,
          bookingFlow,
          paymentDeadline,
          appointmentToken,
          tokenExpiresAt,
        },
      })
    })
    ok(res, appointment, 201)

    void sendNewAppointmentEmails(appointment, service)
  } catch (err) {
    if (err instanceof Error && err.message === 'SLOT_TAKEN') {
      fail(res, 'Slot is no longer available', 409)
      return
    }
    if (isSerializationConflictError(err)) {
      fail(res, 'Slot is no longer available', 409)
      return
    }
    throw err
  }
}

async function sendNewAppointmentEmails(appointment: Appointment, service: Service): Promise<void> {
  try {
    const professional = await prisma.professional.findUnique({ where: { id: appointment.professionalId } })
    if (!professional) return
    const appointmentWithMeet = await ensureGoogleMeetEvent(appointment, service, professional.name)
    const appointmentWithService = { ...appointmentWithMeet, service }
    const emailService = getEmailService()
    await Promise.allSettled([
      emailService.sendAppointmentConfirmation(
        appointment.clientEmail,
        buildAppointmentConfirmationData(appointmentWithService, professional),
      ),
      emailService.sendNewBookingToProfessional(
        professional.email,
        buildNewBookingForProfessionalData(appointmentWithService, professional),
      ),
    ])
  } catch (err) {
    console.error(`[notifications] failed to send emails for appointment ${appointment.id}`, err)
  }
}

export async function getAppointmentByToken(req: Request, res: Response): Promise<void> {
  const { token } = req.params as { token: string }
  const appointment = await prisma.appointment.findUnique({
    where: { appointmentToken: token },
    include: { service: true },
  }) as (AppointmentWithService & { tokenExpiresAt: Date | null }) | null
  if (!appointment) {
    fail(res, 'Appointment not found', 404)
    return
  }

  const isExpired = !appointment.tokenExpiresAt || appointment.tokenExpiresAt < new Date()

  ok(res, {
    id: appointment.id,
    serviceName: appointment.service.name,
    serviceId: appointment.service.id,
    duration: appointment.service.duration,
    price: appointment.service.price,
    modality: appointment.modality,
    date: appointment.startDateTime,
    time: appointment.startDateTime,
    clientName: appointment.clientName,
    status: appointment.status,
    isExpired,
  })
}

export async function cancelByToken(req: Request, res: Response): Promise<void> {
  const { token } = req.params as { token: string }
  const appointment = await prisma.appointment.findUnique({
    where: { appointmentToken: token },
    include: { service: true },
  }) as (AppointmentWithService & { tokenExpiresAt: Date | null }) | null
  if (!appointment) {
    fail(res, 'Appointment not found', 404)
    return
  }

  if (!appointment.tokenExpiresAt || appointment.tokenExpiresAt < new Date()) {
    fail(res, 'Token has expired — cancellation window has closed', 410)
    return
  }

  await prisma.appointment.update({
    where: { id: appointment.id },
    data: { status: 'cancelled' },
  })

  void cancelGoogleMeetEventForAppointment(appointment)
  void sendCancellationEmails(appointment)

  ok(res, { success: true })
}

async function sendCancellationEmails(appointment: Appointment & { service: Service }): Promise<void> {
  try {
    const professional = await prisma.professional.findUnique({ where: { id: appointment.professionalId } })
    if (!professional) return
    const emailService = getEmailService()
    await Promise.allSettled([
      emailService.sendAppointmentCancelledByPatient(
        appointment.clientEmail,
        buildAppointmentCancelledByPatientData(appointment, professional),
      ),
      emailService.sendProfessionalCancellationNotice(
        professional.email,
        buildProfessionalCancellationNoticeData(appointment, professional),
      ),
    ])
  } catch (err) {
    console.error(`[notifications] failed to send cancellation emails for appointment ${appointment.id}`, err)
  }
}

export async function rescheduleByToken(req: Request, res: Response): Promise<void> {
  const { token } = req.params as { token: string }
  const parsed = rescheduleSchema.safeParse(req.body)
  if (!parsed.success) {
    fail(res, parsed.error.issues[0]?.message ?? 'Invalid body', 400)
    return
  }

  const originalAppointment = await prisma.appointment.findUnique({
    where: { appointmentToken: token },
    include: { service: true },
  }) as (AppointmentWithService & { tokenExpiresAt: Date | null }) | null
  if (!originalAppointment) {
    fail(res, 'Appointment not found', 404)
    return
  }

  if (!originalAppointment.tokenExpiresAt || originalAppointment.tokenExpiresAt < new Date()) {
    fail(res, 'Token has expired — reschedule window has closed', 410)
    return
  }

  try {
    const newAppointment = await rescheduleAppointment(originalAppointment, {
      newStart: new Date(parsed.data.newStartDateTime),
      status: 'pending',
      rescheduledBy: 'patient',
    })
    ok(res, newAppointment)
  } catch (err) {
    if (isSlotTakenError(err)) {
      fail(res, 'Slot is no longer available', 409)
      return
    }
    throw err
  }
}

export interface RescheduleOptions {
  newStart: Date
  /** Estado de la cita nueva: la paciente reagenda → 'pending'; desde el panel se mantiene el original. */
  status: string
  rescheduledBy: 'patient' | 'admin'
  service?: Service
  modality?: string
  clientName?: string
  clientPhone?: string
  notes?: string | null
}

/** El horario elegido ya está ocupado (incluye conflictos de serialización por reservas simultáneas). */
export function isSlotTakenError(err: unknown): boolean {
  return (err instanceof Error && err.message === 'SLOT_TAKEN') || isSerializationConflictError(err)
}

/**
 * Reagenda una cita: crea la nueva y cancela la original en una sola transacción, registra el
 * reagendamiento en el historial y envía un único correo a la paciente ("cita modificada") y un
 * aviso a la profesional. La usan el enlace del correo (paciente) y el panel (US-085, US-090).
 * El pago de la original se traspasa a la nueva.
 */
export async function rescheduleAppointment(
  originalAppointment: AppointmentWithService,
  options: RescheduleOptions,
): Promise<AppointmentWithService> {
  const service = options.service ?? originalAppointment.service
  const newStart = options.newStart
  const newEnd = new Date(newStart.getTime() + service.duration * 60_000)

  const newAppointment = await runSerializable(async (tx) => {
    const conflict = await tx.appointment.findFirst({
      where: {
        id: { not: originalAppointment.id },
        professionalId: originalAppointment.professionalId,
        status: { not: 'cancelled' },
        startDateTime: { lt: newEnd },
        endDateTime: { gt: newStart },
      },
    })
    if (conflict) throw new Error('SLOT_TAKEN')

    const created = await tx.appointment.create({
      data: {
        professionalId: originalAppointment.professionalId,
        serviceId: service.id,
        clientName: options.clientName ?? originalAppointment.clientName,
        clientEmail: originalAppointment.clientEmail,
        clientPhone: options.clientPhone ?? originalAppointment.clientPhone,
        startDateTime: newStart,
        endDateTime: newEnd,
        modality: options.modality ?? originalAppointment.modality,
        notes: options.notes !== undefined ? options.notes : originalAppointment.notes,
        status: options.status,
        paymentStatus: originalAppointment.paymentStatus,
        paymentAmount: originalAppointment.paymentAmount,
        paymentMethod: originalAppointment.paymentMethod,
        bookingFlow: 'advance',
        appointmentToken: generateToken(),
        tokenExpiresAt: calculateTokenExpiry(newStart),
      },
      include: { service: true },
    })

    await tx.appointment.update({
      where: { id: originalAppointment.id },
      data: { status: 'cancelled' },
    })

    return created
  })

  await recordAuditEvent({
    action: 'rescheduled',
    entity: 'Appointment',
    entityId: originalAppointment.id,
    professionalId: originalAppointment.professionalId,
    changes: {
      from: originalAppointment.startDateTime.toISOString(),
      to: newAppointment.startDateTime.toISOString(),
      newAppointmentId: newAppointment.id,
      by: options.rescheduledBy,
    },
  })

  void sendRescheduleEmail(originalAppointment, newAppointment, options.rescheduledBy)
  return newAppointment
}

async function sendRescheduleEmail(
  originalAppointment: Appointment & { service: Service },
  newAppointment: Appointment & { service: Service },
  rescheduledBy: 'patient' | 'admin',
): Promise<void> {
  try {
    void cancelGoogleMeetEventForAppointment(originalAppointment)

    const professional = await prisma.professional.findUnique({ where: { id: newAppointment.professionalId } })
    if (!professional) return

    const newAppointmentWithMeet = await ensureGoogleMeetEvent(newAppointment, newAppointment.service, professional.name)
    const newAppointmentForEmail = { ...newAppointmentWithMeet, service: newAppointment.service }

    // Un solo correo a la paciente y un aviso a la profesional (US-085, US-090): independientes,
    // si uno falla el otro igual sale. Nunca se envían anulación ni confirmación de cita nueva.
    const emailService = getEmailService()
    const results = await Promise.allSettled([
      emailService.sendAppointmentModified(
        newAppointmentForEmail.clientEmail,
        buildAppointmentModifiedData(originalAppointment, newAppointmentForEmail, professional),
      ),
      emailService.sendProfessionalRescheduleNotice(
        professional.email,
        buildProfessionalRescheduleNoticeData(originalAppointment, newAppointmentForEmail, professional, rescheduledBy),
      ),
    ])
    for (const result of results) {
      if (result.status === 'rejected') {
        console.error(`[notifications] failed to send reschedule email for appointment ${newAppointment.id}`, result.reason)
      }
    }
  } catch (err) {
    console.error(`[notifications] failed to send reschedule email for appointment ${newAppointment.id}`, err)
  }
}

/** Endpoint público (sin autenticación) enlazado desde emails de confirmación y recordatorio. */
// Por token (no por ID): el ID no es una credencial. No se valida tokenExpiresAt porque la
// confirmación ocurre justo antes de la cita, cuando la ventana de cancelación ya cerró.
export async function confirmAttendance(req: Request, res: Response): Promise<void> {
  const { token } = req.params as { token: string }
  const appointment = await prisma.appointment.findUnique({ where: { appointmentToken: token } })
  if (!appointment) {
    res.status(404).type('html').send(confirmAttendancePageTemplate({ status: 'not-found' }))
    return
  }

  const professional = await prisma.professional.findUnique({ where: { id: appointment.professionalId } })

  if (appointment.attendanceConfirmed) {
    res.type('html').send(confirmAttendancePageTemplate({ status: 'already-confirmed', professionalName: professional?.name }))
    return
  }

  await prisma.appointment.update({
    where: { id: appointment.id },
    data: { attendanceConfirmed: true, attendanceConfirmedAt: new Date() },
  })

  res.type('html').send(confirmAttendancePageTemplate({ status: 'confirmed', professionalName: professional?.name }))
}



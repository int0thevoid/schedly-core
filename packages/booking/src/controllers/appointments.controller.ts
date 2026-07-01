import type { Request, Response } from 'express'
import { z } from 'zod'
import { confirmAttendancePageTemplate } from '@schedly/notifications'
import { prisma } from '../lib/prisma.js'
import { fail, ok } from '../lib/response.js'
import {
  buildAppointmentConfirmationData,
  buildAppointmentModifiedData,
  buildAppointmentCancelledByPatientData,
  buildNewBookingForProfessionalData,
  buildProfessionalCancellationNoticeData,
  type AppointmentWithService,
} from '../lib/notification-data.js'
import { getEmailService } from '../lib/email-service.js'
import type { Appointment, Service } from '../generated/prisma/index.js'

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

const cancelSchema = z.object({
  reason: z.string().optional(),
})

function isSameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  )
}

function generateToken(): string {
  return `tok_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`
}

function calculateTokenExpiry(startDateTime: Date): Date {
  const expires = new Date(startDateTime)
  expires.setUTCDate(expires.getUTCDate() - 1)
  expires.setUTCHours(23, 0, 0, 0)
  return expires
}

const CANCEL_WINDOW_MS = 24 * 60 * 60 * 1000

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
    const appointment = await prisma.$transaction(async (tx) => {
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
    throw err
  }
}

async function sendNewAppointmentEmails(appointment: Appointment, service: Service): Promise<void> {
  try {
    const professional = await prisma.professional.findUnique({ where: { id: appointment.professionalId } })
    if (!professional) return
    const appointmentWithService = { ...appointment, service }
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

export async function getAppointment(req: Request, res: Response): Promise<void> {
  const { id } = req.params
  const appointment = await prisma.appointment.findUnique({
    where: { id },
    include: { service: true },
  })
  if (!appointment) {
    fail(res, 'Appointment not found', 404)
    return
  }
  ok(res, appointment)
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

  const newStart = new Date(parsed.data.newStartDateTime)
  const newEnd = new Date(newStart.getTime() + originalAppointment.service.duration * 60_000)
  const newToken = generateToken()
  const newTokenExpiresAt = calculateTokenExpiry(newStart)

  try {
    const newAppointment = await prisma.$transaction(async (tx) => {
      const conflict = await tx.appointment.findFirst({
        where: {
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
          serviceId: originalAppointment.serviceId,
          clientName: originalAppointment.clientName,
          clientEmail: originalAppointment.clientEmail,
          clientPhone: originalAppointment.clientPhone,
          startDateTime: newStart,
          endDateTime: newEnd,
          modality: originalAppointment.modality,
          notes: originalAppointment.notes,
          status: 'pending',
          paymentStatus: 'unpaid',
          paymentMethod: originalAppointment.paymentMethod,
          bookingFlow: 'advance',
          appointmentToken: newToken,
          tokenExpiresAt: newTokenExpiresAt,
        },
        include: { service: true },
      })

      await tx.appointment.update({
        where: { id: originalAppointment.id },
        data: { status: 'cancelled' },
      })

      return created
    })

    ok(res, newAppointment)

    void sendRescheduleEmail(originalAppointment, newAppointment)
  } catch (err) {
    if (err instanceof Error && err.message === 'SLOT_TAKEN') {
      fail(res, 'Slot is no longer available', 409)
      return
    }
    throw err
  }
}

async function sendRescheduleEmail(
  originalAppointment: Appointment & { service: Service },
  newAppointment: Appointment & { service: Service },
): Promise<void> {
  try {
    const professional = await prisma.professional.findUnique({ where: { id: newAppointment.professionalId } })
    if (!professional) return
    await getEmailService().sendAppointmentModified(
      newAppointment.clientEmail,
      buildAppointmentModifiedData(originalAppointment, newAppointment, professional),
    )
  } catch (err) {
    console.error(`[notifications] failed to send reschedule email for appointment ${newAppointment.id}`, err)
  }
}

/** Endpoint público (sin autenticación) enlazado desde emails de confirmación y recordatorio. */
export async function confirmAttendance(req: Request, res: Response): Promise<void> {
  const { id } = req.params
  const appointment = await prisma.appointment.findUnique({ where: { id } })
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
    where: { id },
    data: { attendanceConfirmed: true, attendanceConfirmedAt: new Date() },
  })

  res.type('html').send(confirmAttendancePageTemplate({ status: 'confirmed', professionalName: professional?.name }))
}

export async function cancelAppointment(req: Request, res: Response): Promise<void> {
  const parsed = cancelSchema.safeParse(req.body)
  if (!parsed.success) {
    fail(res, parsed.error.issues[0]?.message ?? 'Invalid body', 400)
    return
  }

  const { id } = req.params
  const appointment = await prisma.appointment.findUnique({ where: { id } })

  if (!appointment) {
    fail(res, 'Appointment not found', 404)
    return
  }
  if (!['pending', 'confirmed'].includes(appointment.status)) {
    fail(res, 'Cannot cancel appointment in current status', 400)
    return
  }
  if (appointment.startDateTime.getTime() - Date.now() < CANCEL_WINDOW_MS) {
    fail(res, 'Cancellation window has passed (24h minimum)', 400)
    return
  }

  const updated = await prisma.appointment.update({
    where: { id },
    data: { status: 'cancelled' },
  })
  ok(res, updated)
}


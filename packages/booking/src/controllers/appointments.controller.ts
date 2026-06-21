import type { Request, Response } from 'express'
import { z } from 'zod'
import { confirmAttendancePageTemplate } from '@schedly/notifications'
import { prisma } from '../lib/prisma.js'
import { fail, ok } from '../lib/response.js'
import { buildAppointmentConfirmationData } from '../lib/notification-data.js'
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

function isSameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  )
}

const cancelSchema = z.object({
  reason: z.string().optional(),
})

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
        },
      })
    })
    ok(res, appointment, 201)

    void sendConfirmationEmail(appointment, service)
  } catch (err) {
    if (err instanceof Error && err.message === 'SLOT_TAKEN') {
      fail(res, 'Slot is no longer available', 409)
      return
    }
    throw err
  }
}

/** Envía la confirmación por correo al cliente. Best-effort: un fallo se registra pero no afecta la cita ya creada. */
async function sendConfirmationEmail(appointment: Appointment, service: Service): Promise<void> {
  try {
    const professional = await prisma.professional.findUnique({ where: { id: appointment.professionalId } })
    if (!professional) return

    const data = buildAppointmentConfirmationData({ ...appointment, service }, professional)
    await getEmailService().sendAppointmentConfirmation(appointment.clientEmail, data)
  } catch (err) {
    console.error(`[notifications] failed to send confirmation email for appointment ${appointment.id}`, err)
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

/** Endpoint público (sin autenticación) enlazado desde los emails de confirmación y recordatorio. */
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

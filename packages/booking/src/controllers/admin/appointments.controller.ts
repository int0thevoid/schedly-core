import type { Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma.js'
import { fail, ok } from '../../lib/response.js'
import { getEmailService } from '../../lib/email-service.js'
import {
  buildAppointmentCancelledByPatientData,
  buildAppointmentConfirmationData,
  type AppointmentWithService,
} from '../../lib/notification-data.js'
import { addDaysToDateStr, dateKeyInTZ, dayRangeInTZ, todayInTZ } from '../../lib/date.js'

const TZ = 'America/Santiago'

const weeklySchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'startDate must be YYYY-MM-DD'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'endDate must be YYYY-MM-DD'),
})

const monthlySchema = z.object({
  year: z.string().regex(/^\d{4}$/, 'year must be 4-digit'),
  month: z.string().regex(/^([1-9]|1[0-2])$/, 'month must be 1-12'),
})

const listSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  status: z.enum(['pending', 'confirmed', 'cancelled', 'completed']).optional(),
  week: z.string().regex(/^\d{4}-\d{2}$/).optional(),
})

const statusSchema = z.object({
  status: z.enum(['confirmed', 'completed', 'cancelled']),
})

const paymentSchema = z.union([
  z.object({
    paymentStatus: z.literal('paid'),
    paymentAmount: z.number().int().positive(),
    paymentMethod: z.enum(['transfer', 'cash', 'gift']).optional(),
  }),
  z.object({
    paymentStatus: z.literal('unpaid'),
  }),
])

const attendanceSchema = z.object({
  attended: z.boolean(),
})

const outcomeSchema = z.object({
  outcome: z.enum(['attended', 'no_show']).nullable(),
})

export async function listWeeklyAppointments(req: Request, res: Response): Promise<void> {
  const parsed = weeklySchema.safeParse(req.query)
  if (!parsed.success) {
    fail(res, parsed.error.issues[0]?.message ?? 'Invalid params', 400)
    return
  }

  const { startDate, endDate } = parsed.data
  const professionalId = process.env.PROFESSIONAL_ID ?? ''

  const appointments = await prisma.appointment.findMany({
    where: {
      professionalId,
      startDateTime: {
        gte: dayRangeInTZ(startDate, TZ).gte,
        lte: dayRangeInTZ(endDate, TZ).lte,
      },
    },
    include: { service: true },
    orderBy: { startDateTime: 'asc' },
  })

  const grouped: Record<string, typeof appointments> = {}
  let cursor = startDate
  while (cursor <= endDate) {
    grouped[cursor] = []
    cursor = addDaysToDateStr(cursor, 1)
  }
  for (const apt of appointments) {
    const key = dateKeyInTZ(apt.startDateTime, TZ)
    if (key in grouped) grouped[key].push(apt)
  }

  ok(res, grouped)
}

export async function listMonthlyAppointments(req: Request, res: Response): Promise<void> {
  const parsed = monthlySchema.safeParse(req.query)
  if (!parsed.success) {
    fail(res, parsed.error.issues[0]?.message ?? 'Invalid params', 400)
    return
  }

  const year = Number(parsed.data.year)
  const month = Number(parsed.data.month)
  const professionalId = process.env.PROFESSIONAL_ID ?? ''

  const firstDayStr = `${year}-${String(month).padStart(2, '0')}-01`
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const lastDayStr = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`

  const appointments = await prisma.appointment.findMany({
    where: {
      professionalId,
      startDateTime: {
        gte: dayRangeInTZ(firstDayStr, TZ).gte,
        lte: dayRangeInTZ(lastDayStr, TZ).lte,
      },
    },
    include: { service: true },
    orderBy: { startDateTime: 'asc' },
  })

  const grouped: Record<string, typeof appointments> = {}
  let cursor = firstDayStr
  while (cursor <= lastDayStr) {
    grouped[cursor] = []
    cursor = addDaysToDateStr(cursor, 1)
  }
  for (const apt of appointments) {
    const key = dateKeyInTZ(apt.startDateTime, TZ)
    if (key in grouped) grouped[key].push(apt)
  }

  ok(res, grouped)
}

export async function listAdminAppointments(req: Request, res: Response): Promise<void> {
  const parsed = listSchema.safeParse(req.query)
  if (!parsed.success) {
    fail(res, parsed.error.issues[0]?.message ?? 'Invalid params', 400)
    return
  }

  const { date, status, week } = parsed.data
  const professionalId = process.env.PROFESSIONAL_ID ?? ''
  const where: Record<string, unknown> = { professionalId }

  if (status) where['status'] = status

  if (week) {
    const [year, weekNum] = week.split('-').map(Number)
    const jan4 = new Date(Date.UTC(year, 0, 4))
    const startOfWeek1 = new Date(jan4.getTime() - (jan4.getUTCDay() || 7) * 86_400_000 + 86_400_000)
    const weekStart = new Date(startOfWeek1.getTime() + (weekNum - 1) * 7 * 86_400_000)
    const weekEnd = new Date(weekStart.getTime() + 7 * 86_400_000)
    where['startDateTime'] = { gte: weekStart, lt: weekEnd }
  } else {
    const target = date ?? todayInTZ(TZ)
    const { gte, lte } = dayRangeInTZ(target, TZ)
    where['startDateTime'] = { gte, lte }
  }

  const appointments = await prisma.appointment.findMany({
    where: where as Parameters<typeof prisma.appointment.findMany>[0]['where'],
    include: { service: true },
    orderBy: { startDateTime: 'asc' },
  })
  ok(res, appointments)
}

export async function updateAppointmentStatus(req: Request, res: Response): Promise<void> {
  const parsed = statusSchema.safeParse(req.body)
  if (!parsed.success) {
    fail(res, parsed.error.issues[0]?.message ?? 'Invalid body', 400)
    return
  }
  const { id } = req.params
  const appointment = await prisma.appointment.findUnique({ where: { id }, include: { service: true } })
  if (!appointment) {
    fail(res, 'Appointment not found', 404)
    return
  }
  const updated = await prisma.appointment.update({
    where: { id },
    data: { status: parsed.data.status },
  })
  ok(res, updated)

  if (parsed.data.status === 'cancelled') {
    void sendCancellationEmail(appointment as AppointmentWithService)
  }
}

async function sendCancellationEmail(appointment: AppointmentWithService): Promise<void> {
  try {
    const professional = await prisma.professional.findUnique({ where: { id: appointment.professionalId } })
    if (!professional) return
    const data = buildAppointmentCancelledByPatientData(appointment, professional)
    await getEmailService().sendAppointmentCancelledByPatient(appointment.clientEmail, data)
  } catch (err) {
    console.error(`[notifications] failed to send cancellation email for appointment ${appointment.id}`, err)
  }
}

export async function updateAppointmentPayment(req: Request, res: Response): Promise<void> {
  const parsed = paymentSchema.safeParse(req.body)
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

  const data =
    parsed.data.paymentStatus === 'paid'
      ? {
          paymentStatus: 'paid',
          paymentAmount: parsed.data.paymentAmount,
          paymentMethod: parsed.data.paymentMethod ?? null,
        }
      : { paymentStatus: 'unpaid', paymentAmount: null, paymentMethod: null }

  const updated = await prisma.appointment.update({ where: { id }, data })
  ok(res, updated)
}

export async function updateAppointmentAttendance(req: Request, res: Response): Promise<void> {
  const parsed = attendanceSchema.safeParse(req.body)
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
  const updated = await prisma.appointment.update({
    where: { id },
    data: { attended: parsed.data.attended },
  })
  ok(res, updated)
}

export async function updateAppointmentOutcome(req: Request, res: Response): Promise<void> {
  const parsed = outcomeSchema.safeParse(req.body)
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
  const updated = await prisma.appointment.update({
    where: { id },
    data: { outcome: parsed.data.outcome },
  })
  ok(res, updated)
}

/** Reenvía el correo de confirmación de cita (incluye el botón "Confirmar asistencia"). */
export async function notifyAppointmentConfirmation(req: Request, res: Response): Promise<void> {
  const { id } = req.params
  const appointment = await prisma.appointment.findUnique({ where: { id } })
  if (!appointment) {
    fail(res, 'Appointment not found', 404)
    return
  }

  const service = await prisma.service.findUnique({ where: { id: appointment.serviceId } })
  if (!service) {
    fail(res, 'Service not found', 404)
    return
  }

  const professional = await prisma.professional.findUnique({ where: { id: appointment.professionalId } })
  if (!professional) {
    fail(res, 'Professional not found', 404)
    return
  }

  const data = buildAppointmentConfirmationData({ ...appointment, service }, professional)
  try {
    await getEmailService().sendAppointmentConfirmation(appointment.clientEmail, data)
  } catch (err) {
    console.error(`[notifications] failed to send confirmation email for appointment ${id}`, err)
    fail(res, 'Failed to send email', 502)
    return
  }
  ok(res, { sent: true })
}


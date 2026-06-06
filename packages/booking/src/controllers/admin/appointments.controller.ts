import type { Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma.js'
import { fail, ok } from '../../lib/response.js'

const TZ = 'America/Santiago'

function todayInTZ(tz: string): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: tz })
}

function dayRangeInTZ(dateStr: string, tz: string): { gte: Date; lte: Date } {
  // Use noon as reference to avoid DST edge cases when computing the UTC offset
  const ref = new Date(`${dateStr}T12:00:00Z`)
  const localNoon = new Date(
    ref.toLocaleString('en-US', {
      timeZone: tz,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }),
  )
  const offsetMs = ref.getTime() - localNoon.getTime()
  return {
    gte: new Date(new Date(`${dateStr}T00:00:00Z`).getTime() + offsetMs),
    lte: new Date(new Date(`${dateStr}T23:59:59.999Z`).getTime() + offsetMs),
  }
}

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
        gte: new Date(`${startDate}T00:00:00.000Z`),
        lte: new Date(`${endDate}T23:59:59.999Z`),
      },
    },
    include: { service: true },
    orderBy: { startDateTime: 'asc' },
  })

  const grouped: Record<string, typeof appointments> = {}
  const cursor = new Date(`${startDate}T00:00:00.000Z`)
  const rangeEnd = new Date(`${endDate}T00:00:00.000Z`)
  while (cursor <= rangeEnd) {
    grouped[cursor.toISOString().slice(0, 10)] = []
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  for (const apt of appointments) {
    const key = apt.startDateTime.toISOString().slice(0, 10)
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

  const firstDay = new Date(Date.UTC(year, month - 1, 1))
  const lastDay = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999))

  const appointments = await prisma.appointment.findMany({
    where: {
      professionalId,
      startDateTime: { gte: firstDay, lte: lastDay },
    },
    include: { service: true },
    orderBy: { startDateTime: 'asc' },
  })

  const grouped: Record<string, typeof appointments> = {}
  const cursor = new Date(firstDay)
  while (cursor <= lastDay) {
    grouped[cursor.toISOString().slice(0, 10)] = []
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  for (const apt of appointments) {
    const key = apt.startDateTime.toISOString().slice(0, 10)
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
  const appointment = await prisma.appointment.findUnique({ where: { id } })
  if (!appointment) {
    fail(res, 'Appointment not found', 404)
    return
  }
  const updated = await prisma.appointment.update({
    where: { id },
    data: { status: parsed.data.status },
  })
  ok(res, updated)
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

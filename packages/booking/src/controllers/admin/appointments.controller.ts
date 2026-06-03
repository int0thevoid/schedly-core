import type { Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma.js'
import { fail, ok } from '../../lib/response.js'

const listSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  status: z.enum(['pending', 'confirmed', 'cancelled', 'completed']).optional(),
  week: z.string().regex(/^\d{4}-\d{2}$/).optional(),
})

const statusSchema = z.object({
  status: z.enum(['confirmed', 'completed', 'cancelled']),
})

const paymentSchema = z.object({
  paymentStatus: z.literal('paid'),
  paymentAmount: z.number().int().positive(),
})

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
    const target = date ?? new Date().toISOString().slice(0, 10)
    where['startDateTime'] = {
      gte: new Date(`${target}T00:00:00.000Z`),
      lte: new Date(`${target}T23:59:59.999Z`),
    }
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
  const updated = await prisma.appointment.update({
    where: { id },
    data: { paymentStatus: parsed.data.paymentStatus, paymentAmount: parsed.data.paymentAmount },
  })
  ok(res, updated)
}

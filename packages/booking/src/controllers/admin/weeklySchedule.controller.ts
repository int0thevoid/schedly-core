import type { Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma.js'
import { fail, ok } from '../../lib/response.js'

const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/

const createSchema = z.object({
  dayOfWeek: z.number().int().min(1).max(6),
  startTime: z.string().regex(timeRegex, 'startTime must be HH:MM'),
  endTime: z.string().regex(timeRegex, 'endTime must be HH:MM'),
})

const updateSchema = z.object({
  startTime: z.string().regex(timeRegex, 'startTime must be HH:MM'),
  endTime: z.string().regex(timeRegex, 'endTime must be HH:MM'),
})

export async function listWeeklySchedules(req: Request, res: Response): Promise<void> {
  const professionalId = process.env.PROFESSIONAL_ID ?? ''
  const schedules = await prisma.weeklySchedule.findMany({
    where: { professionalId },
    orderBy: { dayOfWeek: 'asc' },
  })
  ok(res, schedules)
}

export async function createWeeklySchedule(req: Request, res: Response): Promise<void> {
  const parsed = createSchema.safeParse(req.body)
  if (!parsed.success) {
    fail(res, parsed.error.issues[0]?.message ?? 'Invalid body', 400)
    return
  }
  const { dayOfWeek, startTime, endTime } = parsed.data
  if (endTime <= startTime) {
    fail(res, 'endTime must be after startTime', 400)
    return
  }
  const professionalId = process.env.PROFESSIONAL_ID ?? ''
  const schedule = await prisma.weeklySchedule.create({
    data: { professionalId, dayOfWeek, startTime, endTime, serviceIds: [] },
  })
  ok(res, schedule, 201)
}

export async function updateWeeklySchedule(req: Request, res: Response): Promise<void> {
  const parsed = updateSchema.safeParse(req.body)
  if (!parsed.success) {
    fail(res, parsed.error.issues[0]?.message ?? 'Invalid body', 400)
    return
  }
  const { id } = req.params
  const existing = await prisma.weeklySchedule.findUnique({ where: { id } })
  if (!existing) {
    fail(res, 'Schedule not found', 404)
    return
  }
  const schedule = await prisma.weeklySchedule.update({
    where: { id },
    data: { startTime: parsed.data.startTime, endTime: parsed.data.endTime },
  })
  ok(res, schedule)
}

export async function deleteWeeklySchedule(req: Request, res: Response): Promise<void> {
  const { id } = req.params
  const existing = await prisma.weeklySchedule.findUnique({ where: { id } })
  if (!existing) {
    fail(res, 'Schedule not found', 404)
    return
  }
  await prisma.weeklySchedule.delete({ where: { id } })
  ok(res, { id })
}

import type { Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma.js'
import { fail, ok } from '../../lib/response.js'

const updateSchema = z.object({
  bookingWindowWeeks: z.number().int().min(1).max(52).optional(),
  minAdvanceBusinessDays: z.number().int().min(0).max(30).optional(),
  defaultBufferMinutes: z.number().int().min(0).max(120).optional(),
  timezone: z.string().min(1).optional(),
})

export async function getConfig(req: Request, res: Response): Promise<void> {
  const professionalId = process.env.PROFESSIONAL_ID ?? ''
  const professional = await prisma.professional.findUnique({ where: { id: professionalId } })
  if (!professional) {
    fail(res, 'Professional not found', 404)
    return
  }
  ok(res, {
    bookingWindowWeeks: professional.bookingWindowWeeks,
    minAdvanceBusinessDays: professional.minAdvanceBusinessDays,
    defaultBufferMinutes: professional.defaultBufferMinutes,
    timezone: professional.timezone,
  })
}

export async function updateConfig(req: Request, res: Response): Promise<void> {
  const parsed = updateSchema.safeParse(req.body)
  if (!parsed.success) {
    fail(res, parsed.error.issues[0]?.message ?? 'Invalid body', 400)
    return
  }
  if (Object.keys(parsed.data).length === 0) {
    fail(res, 'No fields to update', 400)
    return
  }

  const professionalId = process.env.PROFESSIONAL_ID ?? ''
  const professional = await prisma.professional.findUnique({ where: { id: professionalId } })
  if (!professional) {
    fail(res, 'Professional not found', 404)
    return
  }

  const updated = await prisma.professional.update({
    where: { id: professionalId },
    data: parsed.data,
  })
  ok(res, {
    bookingWindowWeeks: updated.bookingWindowWeeks,
    minAdvanceBusinessDays: updated.minAdvanceBusinessDays,
    defaultBufferMinutes: updated.defaultBufferMinutes,
    timezone: updated.timezone,
  })
}

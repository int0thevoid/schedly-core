import type { Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma.js'
import { fail, ok } from '../../lib/response.js'

const updateSchema = z.object({
  bookingWindowWeeks: z.number().int().min(1).max(52).optional(),
  minAdvanceBusinessDays: z.number().int().min(0).max(168).optional(),
  minAdvanceUnit: z.enum(['hours', 'business_days']).optional(),
  defaultBufferMinutes: z.number().int().min(0).max(120).optional(),
  timezone: z.string().min(1).optional(),
  patientSearchField: z.enum(['name', 'email', 'rut', 'phone']).optional(),
  treatmentTypes: z.array(z.string().min(1)).optional(),
  dailyDigestTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'dailyDigestTime must be HH:MM').optional(),
})

function serializeConfig(p: {
  bookingWindowWeeks: number
  minAdvanceBusinessDays: number
  minAdvanceUnit: string
  defaultBufferMinutes: number
  timezone: string
  patientSearchField?: string
  treatmentTypes?: string[]
  dailyDigestTime?: string
}) {
  return {
    bookingWindowWeeks: p.bookingWindowWeeks,
    minAdvanceBusinessDays: p.minAdvanceBusinessDays,
    minAdvanceUnit: p.minAdvanceUnit as 'hours' | 'business_days',
    defaultBufferMinutes: p.defaultBufferMinutes,
    timezone: p.timezone,
    patientSearchField: (p.patientSearchField ?? 'name') as 'name' | 'email' | 'rut' | 'phone',
    treatmentTypes: p.treatmentTypes ?? [],
    dailyDigestTime: p.dailyDigestTime ?? '16:00',
  }
}

export async function getPublicConfig(_req: Request, res: Response): Promise<void> {
  const professionalId = process.env.PROFESSIONAL_ID ?? ''
  const professional = await prisma.professional.findUnique({ where: { id: professionalId } })
  if (!professional) {
    fail(res, 'Professional not found', 404)
    return
  }
  ok(res, serializeConfig(professional))
}

export async function getConfig(req: Request, res: Response): Promise<void> {
  const professionalId = process.env.PROFESSIONAL_ID ?? ''
  const professional = await prisma.professional.findUnique({ where: { id: professionalId } })
  if (!professional) {
    fail(res, 'Professional not found', 404)
    return
  }
  ok(res, serializeConfig(professional))
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
  ok(res, serializeConfig(updated))
}

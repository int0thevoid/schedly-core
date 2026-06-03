import type { Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { fail, ok } from '../lib/response.js'

const querySchema = z.object({
  modality: z.enum(['presential', 'online', 'both']).optional(),
})

export async function listServices(req: Request, res: Response): Promise<void> {
  const parsed = querySchema.safeParse(req.query)
  if (!parsed.success) {
    fail(res, parsed.error.issues[0]?.message ?? 'Invalid params', 400)
    return
  }
  const professionalId = process.env.PROFESSIONAL_ID ?? ''
  const services = await prisma.service.findMany({
    where: {
      professionalId,
      isActive: true,
      ...(parsed.data.modality ? { modality: parsed.data.modality } : {}),
    },
    orderBy: { name: 'asc' },
  })
  ok(res, services)
}

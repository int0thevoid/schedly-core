import type { Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma.js'
import { fail, ok } from '../../lib/response.js'

const createBlockSchema = z.object({
  title: z.string().min(1),
  startDateTime: z.string().datetime({ offset: true }),
  endDateTime: z.string().datetime({ offset: true }),
  recurrenceType: z.enum(['daily', 'weekdays', 'weekly', 'monthly']).optional(),
  recurrenceEnd: z.string().datetime({ offset: true }).optional(),
})

export async function listBlocks(req: Request, res: Response): Promise<void> {
  const professionalId = req.professionalId ?? ''
  const blocks = await prisma.scheduleBlock.findMany({
    where: { professionalId },
    orderBy: { startDateTime: 'asc' },
  })
  ok(res, blocks)
}

export async function createBlock(req: Request, res: Response): Promise<void> {
  const parsed = createBlockSchema.safeParse(req.body)
  if (!parsed.success) {
    fail(res, parsed.error.issues[0]?.message ?? 'Invalid body', 400)
    return
  }

  const { title, startDateTime, endDateTime, recurrenceType, recurrenceEnd } = parsed.data
  const professionalId = req.professionalId ?? ''

  const start = new Date(startDateTime)
  const end = new Date(endDateTime)
  if (end <= start) {
    fail(res, 'endDateTime must be after startDateTime', 400)
    return
  }

  const conflicts = await prisma.appointment.findMany({
    where: {
      professionalId,
      status: { not: 'cancelled' },
      startDateTime: { lt: end },
      endDateTime: { gt: start },
    },
    select: { clientName: true, startDateTime: true, endDateTime: true },
  })

  if (conflicts.length > 0) {
    res.status(409).json({
      success: false,
      error: 'Hay citas agendadas en este horario',
      conflicts: conflicts.map((c) => ({
        clientName: c.clientName,
        startDateTime: c.startDateTime.toISOString(),
        endDateTime: c.endDateTime.toISOString(),
      })),
    })
    return
  }

  const block = await prisma.scheduleBlock.create({
    data: {
      professionalId,
      title,
      startDateTime: start,
      endDateTime: end,
      recurrenceType: recurrenceType ?? null,
      recurrenceEnd: recurrenceEnd ? new Date(recurrenceEnd) : null,
    },
  })
  ok(res, block, 201)
}

export async function deleteBlock(req: Request, res: Response): Promise<void> {
  const { id } = req.params
  const block = await prisma.scheduleBlock.findFirst({ where: { id, professionalId: req.professionalId ?? '' } })
  if (!block) {
    fail(res, 'Block not found', 404)
    return
  }
  await prisma.scheduleBlock.delete({ where: { id } })
  ok(res, { id })
}

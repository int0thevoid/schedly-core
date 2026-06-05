import type { Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma.js'
import { fail, ok } from '../../lib/response.js'

const serviceBodySchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  duration: z.number().int().positive(),
  price: z.number().int().positive(),
  modality: z.enum(['presential', 'online', 'both']),
  bufferMinutes: z.number().int().nonnegative().optional(),
  isActive: z.boolean().optional(),
})

const updateBodySchema = serviceBodySchema.partial()

const toggleSchema = z.object({
  isActive: z.boolean(),
})

export async function listAdminServices(req: Request, res: Response): Promise<void> {
  const professionalId = process.env.PROFESSIONAL_ID ?? ''
  const services = await prisma.service.findMany({
    where: { professionalId },
    orderBy: { name: 'asc' },
  })
  ok(res, services)
}

export async function createService(req: Request, res: Response): Promise<void> {
  const parsed = serviceBodySchema.safeParse(req.body)
  if (!parsed.success) {
    fail(res, parsed.error.issues[0]?.message ?? 'Invalid body', 400)
    return
  }
  const professionalId = process.env.PROFESSIONAL_ID ?? ''
  const service = await prisma.service.create({
    data: {
      professionalId,
      ...parsed.data,
      isActive: parsed.data.isActive ?? true,
    },
  })
  ok(res, service, 201)
}

export async function updateService(req: Request, res: Response): Promise<void> {
  const parsed = updateBodySchema.safeParse(req.body)
  if (!parsed.success) {
    fail(res, parsed.error.issues[0]?.message ?? 'Invalid body', 400)
    return
  }
  const { id } = req.params
  const existing = await prisma.service.findUnique({ where: { id } })
  if (!existing) {
    fail(res, 'Service not found', 404)
    return
  }
  const service = await prisma.service.update({
    where: { id },
    data: parsed.data,
  })
  ok(res, service)
}

export async function toggleService(req: Request, res: Response): Promise<void> {
  const parsed = toggleSchema.safeParse(req.body)
  if (!parsed.success) {
    fail(res, 'isActive (boolean) is required', 400)
    return
  }
  const { id } = req.params
  const existing = await prisma.service.findUnique({ where: { id } })
  if (!existing) {
    fail(res, 'Service not found', 404)
    return
  }
  const service = await prisma.service.update({
    where: { id },
    data: { isActive: parsed.data.isActive },
  })
  ok(res, service)
}

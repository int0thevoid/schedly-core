import type { Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma.js'
import { fail, ok } from '../../lib/response.js'

const bodySchema = z.object({
  name: z.string().trim().min(1).max(60),
  description: z.string().trim().max(300).optional(),
  position: z.number().int().min(0).optional(),
})

export async function listAdminServiceCategories(req: Request, res: Response): Promise<void> {
  const categories = await prisma.serviceCategory.findMany({
    where: { professionalId: req.professionalId ?? '' },
    orderBy: [{ position: 'asc' }, { name: 'asc' }],
    include: { _count: { select: { services: true } } },
  })
  ok(res, categories.map(({ _count, ...c }) => ({ ...c, serviceCount: _count.services })))
}

export async function createServiceCategory(req: Request, res: Response): Promise<void> {
  const parsed = bodySchema.safeParse(req.body)
  if (!parsed.success) {
    fail(res, parsed.error.issues[0]?.message ?? 'Invalid body', 400)
    return
  }
  const professionalId = req.professionalId ?? ''
  // New categories go last unless a position is given
  const position = parsed.data.position ?? (await prisma.serviceCategory.count({ where: { professionalId } }))
  const category = await prisma.serviceCategory.create({
    data: { professionalId, name: parsed.data.name, description: parsed.data.description ?? '', position },
  })
  ok(res, category, 201)
}

export async function updateServiceCategory(req: Request, res: Response): Promise<void> {
  const parsed = bodySchema.partial().safeParse(req.body)
  if (!parsed.success) {
    fail(res, parsed.error.issues[0]?.message ?? 'Invalid body', 400)
    return
  }
  const id = String(req.params.id)
  const existing = await prisma.serviceCategory.findFirst({ where: { id, professionalId: req.professionalId ?? '' } })
  if (!existing) {
    fail(res, 'Category not found', 404)
    return
  }
  ok(res, await prisma.serviceCategory.update({ where: { id }, data: parsed.data }))
}

// Services in a deleted category stay, without category (FK is ON DELETE SET NULL).
export async function deleteServiceCategory(req: Request, res: Response): Promise<void> {
  const id = String(req.params.id)
  const existing = await prisma.serviceCategory.findFirst({ where: { id, professionalId: req.professionalId ?? '' } })
  if (!existing) {
    fail(res, 'Category not found', 404)
    return
  }
  await prisma.serviceCategory.delete({ where: { id } })
  ok(res, { id })
}

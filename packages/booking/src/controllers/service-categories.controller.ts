import type { Request, Response } from 'express'
import { prisma } from '../lib/prisma.js'
import { ok } from '../lib/response.js'

export async function listPublicServiceCategories(_req: Request, res: Response): Promise<void> {
  const professionalId = process.env.PROFESSIONAL_ID ?? ''
  const categories = await prisma.serviceCategory.findMany({
    where: { professionalId },
    orderBy: [{ position: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true, description: true, position: true },
  })
  ok(res, categories)
}

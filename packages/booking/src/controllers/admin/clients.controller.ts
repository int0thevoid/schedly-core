import type { Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma.js'
import { fail, ok } from '../../lib/response.js'

const querySchema = z.object({
  q: z.string().min(1).optional(),
  field: z.enum(['name', 'email', 'rut', 'phone']).optional(),
  email: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
})

export async function listClients(req: Request, res: Response): Promise<void> {
  const parsed = querySchema.safeParse(req.query)
  if (!parsed.success) {
    res.status(400).json({ success: false, error: 'Parámetros inválidos' })
    return
  }

  const { q, field, email, name } = parsed.data

  let where: Record<string, unknown> = {}

  if (q) {
    const searchField = field ?? 'name'
    where = { [searchField]: { contains: q, mode: 'insensitive' } }
  } else {
    if (email) where = { ...where, email: { contains: email, mode: 'insensitive' } }
    if (name) where = { ...where, name: { contains: name, mode: 'insensitive' } }
  }

  const clients = await prisma.client.findMany({
    where,
    select: { id: true, name: true, email: true, phone: true, rut: true },
    orderBy: { name: 'asc' },
    take: 20,
  })

  res.json({ success: true, data: clients })
}

export async function getClient(req: Request, res: Response): Promise<void> {
  const { id } = req.params

  const client = await prisma.client.findUnique({
    where: { id },
    select: { id: true, name: true, email: true, phone: true, rut: true, createdAt: true },
  })

  if (!client) {
    fail(res, 'Cliente no encontrado', 404)
    return
  }

  ok(res, client)
}

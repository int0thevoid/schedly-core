import type { Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma.js'

const querySchema = z.object({
  email: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
})

export async function listClients(req: Request, res: Response): Promise<void> {
  const parsed = querySchema.safeParse(req.query)
  if (!parsed.success) {
    res.status(400).json({ success: false, error: 'Parámetros inválidos' })
    return
  }

  const { email, name } = parsed.data

  const clients = await prisma.client.findMany({
    where: {
      ...(email ? { email: { contains: email, mode: 'insensitive' } } : {}),
      ...(name ? { name: { contains: name, mode: 'insensitive' } } : {}),
    },
    select: { id: true, name: true, email: true, phone: true },
    orderBy: { name: 'asc' },
    take: 20,
  })

  res.json({ success: true, data: clients })
}

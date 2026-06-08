import type { Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { fail, ok } from '../lib/response.js'

const lookupSchema = z
  .object({
    email: z.string().email().optional(),
    rut: z.string().min(1).optional(),
  })
  .refine((data) => data.email ?? data.rut, { message: 'Debes indicar email o rut' })

export async function lookupClient(req: Request, res: Response): Promise<void> {
  const parsed = lookupSchema.safeParse(req.query)
  if (!parsed.success) {
    fail(res, parsed.error.issues[0]?.message ?? 'Parámetros inválidos', 400)
    return
  }

  const { email, rut } = parsed.data
  const where = email ? { email } : { rut: rut as string }

  const client = await prisma.client.findFirst({
    where,
    select: { name: true, phone: true, dataConsentGiven: true },
  })

  ok(res, client)
}

import type { Request, Response } from 'express'
import bcrypt from 'bcrypt'
import { z } from 'zod'
import { prisma } from '../../lib/prisma.js'
import { fail, ok } from '../../lib/response.js'

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().optional(),
})

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
})

export async function updateProfessional(req: Request, res: Response): Promise<void> {
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
  ok(res, { id: updated.id, name: updated.name, email: updated.email, phone: updated.phone })
}

export async function changePassword(req: Request, res: Response): Promise<void> {
  const parsed = changePasswordSchema.safeParse(req.body)
  if (!parsed.success) {
    fail(res, parsed.error.issues[0]?.message ?? 'Invalid body', 400)
    return
  }

  const professionalId = process.env.PROFESSIONAL_ID ?? ''
  const professional = await prisma.professional.findUnique({ where: { id: professionalId } })
  if (!professional) {
    fail(res, 'Professional not found', 404)
    return
  }

  if (!professional.passwordHash || !(await bcrypt.compare(parsed.data.currentPassword, professional.passwordHash))) {
    fail(res, 'Contraseña actual incorrecta', 401)
    return
  }

  const newHash = await bcrypt.hash(parsed.data.newPassword, 10)
  await prisma.professional.update({
    where: { id: professionalId },
    data: { passwordHash: newHash },
  })
  ok(res, { message: 'Contraseña actualizada' })
}

import type { Request, Response } from 'express'
import bcrypt from 'bcrypt'
import { z } from 'zod'
import { prisma } from '../../lib/prisma.js'
import { fail, ok } from '../../lib/response.js'

// Data URL (data:image/...;base64,...) — se valida el formato y un tamaño máximo razonable
// para la foto de perfil, guardada directo en la fila (ver comentario en schema.prisma).
const MAX_PHOTO_DATA_URL_LENGTH = 4_500_000 // ~3.3MB de imagen original en base64
const PHOTO_DATA_URL_PATTERN = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().optional(),
  photoUrl: z
    .union([
      z
        .string()
        .regex(PHOTO_DATA_URL_PATTERN, 'photoUrl debe ser una imagen jpeg/png/webp en base64')
        .max(MAX_PHOTO_DATA_URL_LENGTH, 'La imagen es demasiado grande (máx. ~3MB)'),
      z.null(),
    ])
    .optional(),
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

  const professionalId = req.professionalId ?? ''
  const professional = await prisma.professional.findUnique({ where: { id: professionalId } })
  if (!professional) {
    fail(res, 'Professional not found', 404)
    return
  }

  const updated = await prisma.professional.update({
    where: { id: professionalId },
    data: parsed.data,
  })
  ok(res, { id: updated.id, name: updated.name, email: updated.email, phone: updated.phone, photoUrl: updated.photoUrl })
}

export async function changePassword(req: Request, res: Response): Promise<void> {
  const parsed = changePasswordSchema.safeParse(req.body)
  if (!parsed.success) {
    fail(res, parsed.error.issues[0]?.message ?? 'Invalid body', 400)
    return
  }

  const professionalId = req.professionalId ?? ''
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

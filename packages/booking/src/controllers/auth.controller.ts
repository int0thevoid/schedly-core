import type { CookieOptions, Request, Response } from 'express'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { fail, ok } from '../lib/response.js'
import { AUTH_COOKIE_NAME } from '../middleware/auth.js'

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

const SESSION_MS = 8 * 60 * 60 * 1000

function authCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  }
}

export async function login(req: Request, res: Response): Promise<void> {
  const parsed = loginSchema.safeParse(req.body)
  if (!parsed.success) {
    fail(res, parsed.error.issues[0]?.message ?? 'Invalid body', 400)
    return
  }

  const { email, password } = parsed.data
  const professional = await prisma.professional.findUnique({ where: { email } })

  // Same error message for missing user and wrong password — prevents user enumeration
  if (!professional?.passwordHash || !(await bcrypt.compare(password, professional.passwordHash))) {
    fail(res, 'Credenciales incorrectas', 401)
    return
  }

  const secret = process.env.JWT_SECRET ?? 'dev-secret'
  const token = jwt.sign(
    { professionalId: professional.id, role: 'admin' },
    secret,
    { expiresIn: '8h' },
  )

  res.cookie(AUTH_COOKIE_NAME, token, { ...authCookieOptions(), maxAge: SESSION_MS })
  ok(res, { success: true })
}

export function logout(_req: Request, res: Response): void {
  res.clearCookie(AUTH_COOKIE_NAME, authCookieOptions())
  res.status(200).json({ success: true })
}

export async function me(req: Request, res: Response): Promise<void> {
  const professionalId = process.env.PROFESSIONAL_ID ?? ''
  const professional = await prisma.professional.findUnique({ where: { id: professionalId } })

  if (!professional) {
    fail(res, 'Professional not found', 404)
    return
  }

  ok(res, {
    id: professional.id,
    name: professional.name,
    email: professional.email,
    phone: professional.phone,
  })
}

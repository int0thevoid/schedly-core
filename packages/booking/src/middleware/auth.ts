import type { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import { fail } from '../lib/response.js'

export const AUTH_COOKIE_NAME = 'auth_token'

interface AdminJwtPayload {
  professionalId: string
  role: string
}

function isAdminJwtPayload(payload: unknown): payload is AdminJwtPayload {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    typeof (payload as AdminJwtPayload).professionalId === 'string' &&
    (payload as AdminJwtPayload).role === 'admin'
  )
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = req.cookies?.[AUTH_COOKIE_NAME] as string | undefined
  if (!token) {
    fail(res, 'Unauthorized', 401)
    return
  }
  try {
    const secret = process.env.JWT_SECRET ?? 'dev-secret'
    const payload = jwt.verify(token, secret)
    if (!isAdminJwtPayload(payload)) {
      fail(res, 'Invalid token', 401)
      return
    }
    req.professionalId = payload.professionalId
    next()
  } catch {
    fail(res, 'Invalid token', 401)
  }
}

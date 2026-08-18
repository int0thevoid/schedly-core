import type { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import { fail } from '../lib/response.js'

export const AUTH_COOKIE_NAME = 'auth_token'

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = req.cookies?.[AUTH_COOKIE_NAME] as string | undefined
  if (!token) {
    fail(res, 'Unauthorized', 401)
    return
  }
  try {
    const secret = process.env.JWT_SECRET ?? 'dev-secret'
    req.app.locals.admin = jwt.verify(token, secret)
    next()
  } catch {
    fail(res, 'Invalid token', 401)
  }
}

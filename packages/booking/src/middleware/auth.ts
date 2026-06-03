import type { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import { fail } from '../lib/response.js'

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    fail(res, 'Unauthorized', 401)
    return
  }
  try {
    const token = header.slice(7)
    const secret = process.env.JWT_SECRET ?? 'dev-secret'
    req.app.locals.admin = jwt.verify(token, secret)
    next()
  } catch {
    fail(res, 'Invalid token', 401)
  }
}

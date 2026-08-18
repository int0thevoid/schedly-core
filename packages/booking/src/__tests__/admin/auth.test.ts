import { beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcrypt'

vi.mock('../../lib/prisma.js', () => ({ prisma: prismaMock }))

import { prismaMock, resetMocks } from '../helpers/prisma-mock.js'
import app from '../../app.js'

const PASSWORD = 'stefany2024'
const PASSWORD_HASH = bcrypt.hashSync(PASSWORD, 10)

const PROFESSIONAL = {
  id: 'pro1',
  name: 'Ps. Stefany Osorio Alfaro',
  email: 'stefanyosorioalfaro@gmail.com',
  phone: '+56966898588',
  passwordHash: PASSWORD_HASH,
  timezone: 'America/Santiago',
  bookingWindowWeeks: 4,
  minAdvanceBusinessDays: 2,
  defaultBufferMinutes: 15,
  transferRut: null,
  transferBank: null,
  transferAccountType: null,
  transferAccountNumber: null,
  transferEmail: null,
  createdAt: new Date(),
  updatedAt: new Date(),
}

function authToken() {
  return jwt.sign({ professionalId: 'pro1', role: 'admin' }, 'dev-secret')
}

beforeEach(() => {
  resetMocks()
  process.env.PROFESSIONAL_ID = 'pro1'
})

describe('POST /api/auth/login', () => {
  it('returns 200 and sets an httpOnly auth cookie on valid credentials (never the token in the body)', async () => {
    prismaMock.professional.findUnique.mockResolvedValue(PROFESSIONAL)
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'stefanyosorioalfaro@gmail.com', password: PASSWORD })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.token).toBeUndefined()

    const setCookie = res.headers['set-cookie'] as unknown as string[]
    const authCookie = setCookie?.find((c) => c.startsWith('auth_token='))
    expect(authCookie).toBeDefined()
    expect(authCookie).toContain('HttpOnly')

    const tokenValue = authCookie!.split(';')[0].split('=')[1]
    const decoded = jwt.verify(tokenValue, 'dev-secret') as { professionalId: string; role: string }
    expect(decoded.professionalId).toBe('pro1')
    expect(decoded.role).toBe('admin')
  })

  it('returns 401 on wrong password', async () => {
    prismaMock.professional.findUnique.mockResolvedValue(PROFESSIONAL)
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'stefanyosorioalfaro@gmail.com', password: 'wrongpassword' })
    expect(res.status).toBe(401)
    expect(res.body.success).toBe(false)
    expect(res.body.error).toBe('Credenciales incorrectas')
  })

  it('returns 401 on non-existent email (same message — no user enumeration)', async () => {
    prismaMock.professional.findUnique.mockResolvedValue(null)
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'noexiste@test.com', password: PASSWORD })
    expect(res.status).toBe(401)
    expect(res.body.error).toBe('Credenciales incorrectas')
  })

  it('returns 401 when professional has no passwordHash', async () => {
    prismaMock.professional.findUnique.mockResolvedValue({ ...PROFESSIONAL, passwordHash: null })
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'stefanyosorioalfaro@gmail.com', password: PASSWORD })
    expect(res.status).toBe(401)
    expect(res.body.error).toBe('Credenciales incorrectas')
  })

  it('returns 400 on missing email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ password: PASSWORD })
    expect(res.status).toBe(400)
  })

  it('returns 400 on missing password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'stefanyosorioalfaro@gmail.com' })
    expect(res.status).toBe(400)
  })

  it('rate-limits repeated login attempts (brute-force protection)', async () => {
    prismaMock.professional.findUnique.mockResolvedValue(PROFESSIONAL)
    const statuses: number[] = []
    // Ya se hicieron varios intentos en los tests anteriores de este archivo;
    // disparar de sobra garantiza cruzar el límite sin depender del conteo exacto previo.
    for (let i = 0; i < 15; i++) {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'stefanyosorioalfaro@gmail.com', password: 'wrongpassword' })
      statuses.push(res.status)
    }
    expect(statuses).toContain(429)
  })
})

describe('POST /api/auth/logout', () => {
  it('returns 200 with success true and clears the auth cookie', async () => {
    const res = await request(app).post('/api/auth/logout')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: true })
    const setCookie = res.headers['set-cookie'] as unknown as string[]
    const authCookie = setCookie?.find((c) => c.startsWith('auth_token='))
    expect(authCookie).toBeDefined()
    expect(authCookie).toMatch(/auth_token=;/)
  })
})

describe('GET /api/auth/me', () => {
  it('returns professional data when authenticated', async () => {
    prismaMock.professional.findUnique.mockResolvedValue(PROFESSIONAL)
    const res = await request(app)
      .get('/api/auth/me')
      .set('Cookie', `auth_token=${authToken()}`)
    expect(res.status).toBe(200)
    expect(res.body.data).toMatchObject({
      id: 'pro1',
      name: 'Ps. Stefany Osorio Alfaro',
      email: 'stefanyosorioalfaro@gmail.com',
      phone: '+56966898588',
    })
    expect(res.body.data.passwordHash).toBeUndefined()
  })

  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/auth/me')
    expect(res.status).toBe(401)
  })

  it('returns 401 with invalid token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Cookie', 'auth_token=invalidtoken')
    expect(res.status).toBe(401)
  })

  it('returns 404 when professional not found in DB', async () => {
    prismaMock.professional.findUnique.mockResolvedValue(null)
    const res = await request(app)
      .get('/api/auth/me')
      .set('Cookie', `auth_token=${authToken()}`)
    expect(res.status).toBe(404)
  })
})

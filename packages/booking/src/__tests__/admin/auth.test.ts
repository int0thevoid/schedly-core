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
  return `Bearer ${jwt.sign({ professionalId: 'pro1', role: 'admin' }, 'dev-secret')}`
}

beforeEach(() => {
  resetMocks()
  process.env.PROFESSIONAL_ID = 'pro1'
})

describe('POST /api/auth/login', () => {
  it('returns 200 and a JWT token on valid credentials', async () => {
    prismaMock.professional.findUnique.mockResolvedValue(PROFESSIONAL)
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'stefanyosorioalfaro@gmail.com', password: PASSWORD })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.token).toBeDefined()
    const decoded = jwt.verify(res.body.data.token, 'dev-secret') as { professionalId: string; role: string }
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
})

describe('POST /api/auth/logout', () => {
  it('returns 200 with success true', async () => {
    const res = await request(app).post('/api/auth/logout')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: true })
  })
})

describe('GET /api/auth/me', () => {
  it('returns professional data when authenticated', async () => {
    prismaMock.professional.findUnique.mockResolvedValue(PROFESSIONAL)
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', authToken())
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
      .set('Authorization', 'Bearer invalidtoken')
    expect(res.status).toBe(401)
  })

  it('returns 404 when professional not found in DB', async () => {
    prismaMock.professional.findUnique.mockResolvedValue(null)
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', authToken())
    expect(res.status).toBe(404)
  })
})

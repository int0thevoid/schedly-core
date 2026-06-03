import { beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'

vi.mock('../../lib/prisma.js', () => ({ prisma: prismaMock }))

import { prismaMock, resetMocks } from '../helpers/prisma-mock.js'
import app from '../../app.js'

function token() {
  return `Bearer ${jwt.sign({ role: 'admin' }, 'dev-secret')}`
}

const PROFESSIONAL = {
  id: 'pro1', name: 'Stefany', email: 'stefany@test.com', phone: null,
  timezone: 'America/Santiago', bookingWindowWeeks: 4,
  minAdvanceBusinessDays: 2, defaultBufferMinutes: 0,
  createdAt: new Date(), updatedAt: new Date(),
}

beforeEach(() => {
  resetMocks()
  process.env.PROFESSIONAL_ID = 'pro1'
})

describe('GET /api/admin/config', () => {
  it('returns professional config', async () => {
    prismaMock.professional.findUnique.mockResolvedValue(PROFESSIONAL)
    const res = await request(app).get('/api/admin/config').set('Authorization', token())
    expect(res.status).toBe(200)
    expect(res.body.data).toMatchObject({
      bookingWindowWeeks: 4,
      minAdvanceBusinessDays: 2,
      defaultBufferMinutes: 0,
      timezone: 'America/Santiago',
    })
  })

  it('returns 404 when professional not found', async () => {
    prismaMock.professional.findUnique.mockResolvedValue(null)
    const res = await request(app).get('/api/admin/config').set('Authorization', token())
    expect(res.status).toBe(404)
  })
})

describe('PATCH /api/admin/config', () => {
  it('updates config fields', async () => {
    prismaMock.professional.findUnique.mockResolvedValue(PROFESSIONAL)
    prismaMock.professional.update.mockResolvedValue({ ...PROFESSIONAL, bookingWindowWeeks: 8 })
    const res = await request(app)
      .patch('/api/admin/config')
      .set('Authorization', token())
      .send({ bookingWindowWeeks: 8 })
    expect(res.status).toBe(200)
    expect(res.body.data.bookingWindowWeeks).toBe(8)
  })

  it('returns 400 when no fields provided', async () => {
    const res = await request(app)
      .patch('/api/admin/config')
      .set('Authorization', token())
      .send({})
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid values', async () => {
    const res = await request(app)
      .patch('/api/admin/config')
      .set('Authorization', token())
      .send({ bookingWindowWeeks: 100 })
    expect(res.status).toBe(400)
  })
})

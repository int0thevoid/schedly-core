import { beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'

vi.mock('../../lib/prisma.js', () => ({ prisma: prismaMock }))

import { prismaMock, resetMocks } from '../helpers/prisma-mock.js'
import app from '../../app.js'

function token() {
  return `Bearer ${jwt.sign({ role: 'admin' }, 'dev-secret')}`
}

const APT = {
  id: 'a1', professionalId: 'pro1', serviceId: 's1',
  clientName: 'Ana', clientEmail: 'a@test.com', clientPhone: '123',
  startDateTime: new Date('2026-06-03T14:00:00Z'),
  endDateTime: new Date('2026-06-03T14:50:00Z'),
  modality: 'online', status: 'pending', paymentStatus: 'unpaid',
  paymentAmount: null, notes: null, createdAt: new Date(), updatedAt: new Date(),
  service: { id: 's1', name: 'Sesión' },
}

beforeEach(() => {
  resetMocks()
  process.env.PROFESSIONAL_ID = 'pro1'
})

describe('GET /api/admin/appointments', () => {
  it('returns appointments for today by default', async () => {
    prismaMock.appointment.findMany.mockResolvedValue([APT])
    const res = await request(app).get('/api/admin/appointments').set('Authorization', token())
    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(1)
  })

  it('filters by date', async () => {
    prismaMock.appointment.findMany.mockResolvedValue([APT])
    const res = await request(app).get('/api/admin/appointments?date=2026-06-03').set('Authorization', token())
    expect(res.status).toBe(200)
    expect(prismaMock.appointment.findMany).toHaveBeenCalled()
  })

  it('filters by status', async () => {
    prismaMock.appointment.findMany.mockResolvedValue([])
    const res = await request(app).get('/api/admin/appointments?status=confirmed').set('Authorization', token())
    expect(res.status).toBe(200)
  })

  it('rejects invalid status', async () => {
    const res = await request(app).get('/api/admin/appointments?status=unknown').set('Authorization', token())
    expect(res.status).toBe(400)
  })
})

describe('PATCH /api/admin/appointments/:id/status', () => {
  it('updates status to confirmed', async () => {
    prismaMock.appointment.findUnique.mockResolvedValue(APT)
    prismaMock.appointment.update.mockResolvedValue({ ...APT, status: 'confirmed' })
    const res = await request(app)
      .patch('/api/admin/appointments/a1/status')
      .set('Authorization', token())
      .send({ status: 'confirmed' })
    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe('confirmed')
  })

  it('returns 400 for invalid status', async () => {
    const res = await request(app)
      .patch('/api/admin/appointments/a1/status')
      .set('Authorization', token())
      .send({ status: 'invalid' })
    expect(res.status).toBe(400)
  })

  it('returns 404 when not found', async () => {
    prismaMock.appointment.findUnique.mockResolvedValue(null)
    const res = await request(app)
      .patch('/api/admin/appointments/bad/status')
      .set('Authorization', token())
      .send({ status: 'confirmed' })
    expect(res.status).toBe(404)
  })
})

describe('PATCH /api/admin/appointments/:id/payment', () => {
  it('marks as paid', async () => {
    prismaMock.appointment.findUnique.mockResolvedValue(APT)
    prismaMock.appointment.update.mockResolvedValue({ ...APT, paymentStatus: 'paid', paymentAmount: 30000 })
    const res = await request(app)
      .patch('/api/admin/appointments/a1/payment')
      .set('Authorization', token())
      .send({ paymentStatus: 'paid', paymentAmount: 30000 })
    expect(res.status).toBe(200)
    expect(res.body.data.paymentStatus).toBe('paid')
  })

  it('returns 400 for missing amount', async () => {
    const res = await request(app)
      .patch('/api/admin/appointments/a1/payment')
      .set('Authorization', token())
      .send({ paymentStatus: 'paid' })
    expect(res.status).toBe(400)
  })
})

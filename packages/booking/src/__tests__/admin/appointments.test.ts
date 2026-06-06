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

describe('GET /api/admin/appointments/weekly', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/admin/appointments/weekly?startDate=2026-06-01&endDate=2026-06-07')
    expect(res.status).toBe(401)
  })

  it('returns 400 when startDate is missing', async () => {
    const res = await request(app)
      .get('/api/admin/appointments/weekly?endDate=2026-06-07')
      .set('Authorization', token())
    expect(res.status).toBe(400)
  })

  it('returns 400 when endDate is missing', async () => {
    const res = await request(app)
      .get('/api/admin/appointments/weekly?startDate=2026-06-01')
      .set('Authorization', token())
    expect(res.status).toBe(400)
  })

  it('returns 400 when date format is invalid', async () => {
    const res = await request(app)
      .get('/api/admin/appointments/weekly?startDate=01-06-2026&endDate=2026-06-07')
      .set('Authorization', token())
    expect(res.status).toBe(400)
  })

  it('returns all dates in range as keys with empty arrays when no appointments', async () => {
    prismaMock.appointment.findMany.mockResolvedValue([])
    const res = await request(app)
      .get('/api/admin/appointments/weekly?startDate=2026-06-01&endDate=2026-06-03')
      .set('Authorization', token())
    expect(res.status).toBe(200)
    expect(res.body.data).toMatchObject({
      '2026-06-01': [],
      '2026-06-02': [],
      '2026-06-03': [],
    })
    expect(Object.keys(res.body.data)).toHaveLength(3)
  })

  it('groups appointments by date', async () => {
    const apt1 = { ...APT, id: 'a1', startDateTime: new Date('2026-06-01T09:00:00Z') }
    const apt2 = { ...APT, id: 'a2', startDateTime: new Date('2026-06-03T14:00:00Z') }
    prismaMock.appointment.findMany.mockResolvedValue([apt1, apt2])
    const res = await request(app)
      .get('/api/admin/appointments/weekly?startDate=2026-06-01&endDate=2026-06-03')
      .set('Authorization', token())
    expect(res.status).toBe(200)
    expect(res.body.data['2026-06-01']).toHaveLength(1)
    expect(res.body.data['2026-06-02']).toHaveLength(0)
    expect(res.body.data['2026-06-03']).toHaveLength(1)
  })

  it('includes cancelled appointments', async () => {
    const cancelled = { ...APT, id: 'a3', status: 'cancelled', startDateTime: new Date('2026-06-01T10:00:00Z') }
    prismaMock.appointment.findMany.mockResolvedValue([cancelled])
    const res = await request(app)
      .get('/api/admin/appointments/weekly?startDate=2026-06-01&endDate=2026-06-01')
      .set('Authorization', token())
    expect(res.status).toBe(200)
    expect(res.body.data['2026-06-01'][0].status).toBe('cancelled')
  })

  it('queries with correct date range', async () => {
    prismaMock.appointment.findMany.mockResolvedValue([])
    await request(app)
      .get('/api/admin/appointments/weekly?startDate=2026-06-01&endDate=2026-06-07')
      .set('Authorization', token())
    const call = prismaMock.appointment.findMany.mock.calls[0][0]
    expect(call.where.startDateTime.gte).toEqual(new Date('2026-06-01T00:00:00.000Z'))
    expect(call.where.startDateTime.lte).toEqual(new Date('2026-06-07T23:59:59.999Z'))
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

  it('saves paymentMethod when provided', async () => {
    prismaMock.appointment.findUnique.mockResolvedValue(APT)
    prismaMock.appointment.update.mockResolvedValue({ ...APT, paymentStatus: 'paid', paymentAmount: 30000, paymentMethod: 'cash' })
    const res = await request(app)
      .patch('/api/admin/appointments/a1/payment')
      .set('Authorization', token())
      .send({ paymentStatus: 'paid', paymentAmount: 30000, paymentMethod: 'cash' })
    expect(res.status).toBe(200)
    expect(res.body.data.paymentMethod).toBe('cash')
  })

  it('reverts to unpaid', async () => {
    const paid = { ...APT, paymentStatus: 'paid', paymentAmount: 30000, paymentMethod: 'transfer' }
    prismaMock.appointment.findUnique.mockResolvedValue(paid)
    prismaMock.appointment.update.mockResolvedValue({ ...paid, paymentStatus: 'unpaid', paymentAmount: null, paymentMethod: null })
    const res = await request(app)
      .patch('/api/admin/appointments/a1/payment')
      .set('Authorization', token())
      .send({ paymentStatus: 'unpaid' })
    expect(res.status).toBe(200)
    expect(res.body.data.paymentStatus).toBe('unpaid')
  })
})

describe('GET /api/admin/appointments/monthly', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/admin/appointments/monthly?year=2026&month=6')
    expect(res.status).toBe(401)
  })

  it('returns 400 when year or month is missing', async () => {
    const res = await request(app)
      .get('/api/admin/appointments/monthly?year=2026')
      .set('Authorization', token())
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid year format', async () => {
    const res = await request(app)
      .get('/api/admin/appointments/monthly?year=26&month=6')
      .set('Authorization', token())
    expect(res.status).toBe(400)
  })

  it('returns all days of month as keys with empty arrays when no appointments', async () => {
    prismaMock.appointment.findMany.mockResolvedValue([])
    const res = await request(app)
      .get('/api/admin/appointments/monthly?year=2026&month=2')
      .set('Authorization', token())
    expect(res.status).toBe(200)
    expect(Object.keys(res.body.data)).toHaveLength(28)
    expect(res.body.data['2026-02-01']).toEqual([])
    expect(res.body.data['2026-02-28']).toEqual([])
  })

  it('groups appointments by day', async () => {
    const apt1 = { ...APT, id: 'a1', startDateTime: new Date('2026-06-03T14:00:00Z') }
    const apt2 = { ...APT, id: 'a2', startDateTime: new Date('2026-06-03T16:00:00Z') }
    const apt3 = { ...APT, id: 'a3', startDateTime: new Date('2026-06-15T10:00:00Z') }
    prismaMock.appointment.findMany.mockResolvedValue([apt1, apt2, apt3])
    const res = await request(app)
      .get('/api/admin/appointments/monthly?year=2026&month=6')
      .set('Authorization', token())
    expect(res.status).toBe(200)
    expect(res.body.data['2026-06-03']).toHaveLength(2)
    expect(res.body.data['2026-06-15']).toHaveLength(1)
    expect(res.body.data['2026-06-01']).toEqual([])
  })

  it('queries correct month range', async () => {
    prismaMock.appointment.findMany.mockResolvedValue([])
    await request(app)
      .get('/api/admin/appointments/monthly?year=2026&month=6')
      .set('Authorization', token())
    const call = prismaMock.appointment.findMany.mock.calls[0][0]
    expect(call.where.startDateTime.gte).toEqual(new Date('2026-06-01T00:00:00.000Z'))
    expect(call.where.startDateTime.lte).toEqual(new Date('2026-06-30T23:59:59.999Z'))
  })
})

describe('PATCH /api/admin/appointments/:id/attendance', () => {
  it('marks as attended', async () => {
    prismaMock.appointment.findUnique.mockResolvedValue(APT)
    prismaMock.appointment.update.mockResolvedValue({ ...APT, attended: true })
    const res = await request(app)
      .patch('/api/admin/appointments/a1/attendance')
      .set('Authorization', token())
      .send({ attended: true })
    expect(res.status).toBe(200)
    expect(res.body.data.attended).toBe(true)
  })

  it('marks as not attended', async () => {
    prismaMock.appointment.findUnique.mockResolvedValue({ ...APT, attended: true })
    prismaMock.appointment.update.mockResolvedValue({ ...APT, attended: false })
    const res = await request(app)
      .patch('/api/admin/appointments/a1/attendance')
      .set('Authorization', token())
      .send({ attended: false })
    expect(res.status).toBe(200)
    expect(res.body.data.attended).toBe(false)
  })

  it('returns 400 for invalid body', async () => {
    const res = await request(app)
      .patch('/api/admin/appointments/a1/attendance')
      .set('Authorization', token())
      .send({ attended: 'yes' })
    expect(res.status).toBe(400)
  })

  it('returns 404 when not found', async () => {
    prismaMock.appointment.findUnique.mockResolvedValue(null)
    const res = await request(app)
      .patch('/api/admin/appointments/bad/attendance')
      .set('Authorization', token())
      .send({ attended: true })
    expect(res.status).toBe(404)
  })
})

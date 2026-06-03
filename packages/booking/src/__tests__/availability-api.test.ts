import { beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'

vi.mock('../lib/prisma.js', () => ({ prisma: prismaMock }))

import { prismaMock, resetMocks } from './helpers/prisma-mock.js'
import app from '../app.js'

const SERVICE = {
  id: 's1', name: 'Sesión', professionalId: 'pro1', isActive: true,
  modality: 'online', duration: 50, price: 30000, description: '',
  bufferMinutes: null, createdAt: new Date(), updatedAt: new Date(),
}

const PROFESSIONAL = {
  id: 'pro1', name: 'Stefany', email: 'test@test.com', phone: null,
  timezone: 'America/Santiago', bookingWindowWeeks: 4, minAdvanceBusinessDays: 0,
  defaultBufferMinutes: 0, createdAt: new Date(), updatedAt: new Date(),
}

beforeEach(() => {
  resetMocks()
  process.env.PROFESSIONAL_ID = 'pro1'
  prismaMock.weeklySchedule.findMany.mockResolvedValue([])
  prismaMock.scheduleBlock.findMany.mockResolvedValue([])
  prismaMock.appointment.findMany.mockResolvedValue([])
})

describe('GET /api/availability', () => {
  it('returns slots for a day', async () => {
    prismaMock.service.findUnique.mockResolvedValue(SERVICE)
    prismaMock.professional.findUnique.mockResolvedValue(PROFESSIONAL)
    prismaMock.weeklySchedule.findMany.mockResolvedValue([
      { id: 'ws1', professionalId: 'pro1', dayOfWeek: 1, startTime: '09:00', endTime: '10:00', serviceIds: [], createdAt: new Date(), updatedAt: new Date() },
    ])

    const res = await request(app).get('/api/availability?serviceId=s1&date=2026-06-08')
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(Array.isArray(res.body.data)).toBe(true)
  })

  it('returns 400 when date is missing', async () => {
    const res = await request(app).get('/api/availability?serviceId=s1')
    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
  })

  it('returns 400 when date format is invalid', async () => {
    const res = await request(app).get('/api/availability?serviceId=s1&date=01-01-2026')
    expect(res.status).toBe(400)
  })

  it('returns 404 when service does not exist', async () => {
    prismaMock.service.findUnique.mockResolvedValue(null)
    const res = await request(app).get('/api/availability?serviceId=bad&date=2026-06-08')
    expect(res.status).toBe(404)
  })
})

describe('GET /api/availability/range', () => {
  it('returns slots map for a range', async () => {
    prismaMock.service.findUnique.mockResolvedValue(SERVICE)
    prismaMock.professional.findUnique.mockResolvedValue(PROFESSIONAL)

    const res = await request(app).get('/api/availability/range?serviceId=s1&startDate=2026-06-08&endDate=2026-06-10')
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(typeof res.body.data).toBe('object')
    expect(Object.keys(res.body.data)).toHaveLength(3)
  })

  it('rejects ranges larger than 7 days', async () => {
    prismaMock.service.findUnique.mockResolvedValue(SERVICE)
    prismaMock.professional.findUnique.mockResolvedValue(PROFESSIONAL)

    const res = await request(app).get('/api/availability/range?serviceId=s1&startDate=2026-06-01&endDate=2026-06-10')
    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
  })
})

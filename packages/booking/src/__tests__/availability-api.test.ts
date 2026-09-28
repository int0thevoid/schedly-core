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

describe('GET /api/availability — descanso propio de cada cita existente', () => {
  it('ofrece una individual (45+15) a las 15:00 después de una pareja (50+10) de 14:00', async () => {
    prismaMock.service.findUnique.mockResolvedValue({ ...SERVICE, duration: 45, bufferMinutes: 15 })
    prismaMock.professional.findUnique.mockResolvedValue({ ...PROFESSIONAL, defaultBufferMinutes: 15 })
    prismaMock.weeklySchedule.findMany.mockResolvedValue([
      { id: 'ws1', professionalId: 'pro1', dayOfWeek: 1, startTime: '14:00', endTime: '16:00', serviceIds: [], isActive: true, createdAt: new Date(), updatedAt: new Date() },
    ])
    // Lunes 05-10-2026 en Chile es UTC-3: 14:00 local = 17:00Z
    prismaMock.appointment.findMany.mockResolvedValue([
      {
        id: 'couple', professionalId: 'pro1', serviceId: 's-couple', clientName: 'Pareja', clientEmail: 'p@test.cl',
        clientPhone: '+56900000000', startDateTime: new Date('2026-10-05T17:00:00Z'), endDateTime: new Date('2026-10-05T17:50:00Z'),
        modality: 'presential', status: 'confirmed', paymentStatus: 'paid', paymentAmount: null, notes: null,
        createdAt: new Date(), service: { bufferMinutes: 10 },
      },
    ])

    const res = await request(app).get('/api/availability?serviceId=s1&date=2026-10-05')

    expect(res.status).toBe(200)
    expect(res.body.data.map((s: { startDateTime: string }) => s.startDateTime)).toEqual(['2026-10-05T18:00:00.000Z'])
    expect(prismaMock.appointment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ include: { service: { select: { bufferMinutes: true } } } }),
    )
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

import { beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'

vi.mock('../../lib/prisma.js', () => ({ prisma: prismaMock }))

import { prismaMock, resetMocks } from '../helpers/prisma-mock.js'
import app from '../../app.js'

const PROFESSIONAL = {
  id: 'pro1', name: 'Stefany', email: 'stefany@test.com', phone: null,
  timezone: 'America/Santiago', bookingWindowWeeks: 4,
  minAdvanceBusinessDays: 1, minAdvanceUnit: 'hours', defaultBufferMinutes: 15,
  photoUrl: null as string | null,
  createdAt: new Date(), updatedAt: new Date(),
}

beforeEach(() => {
  resetMocks()
  process.env.PROFESSIONAL_ID = 'pro1'
})

describe('GET /api/config (public)', () => {
  it('returns config without authentication', async () => {
    prismaMock.professional.findUnique.mockResolvedValue(PROFESSIONAL)
    const res = await request(app).get('/api/config')
    expect(res.status).toBe(200)
    expect(res.body.data).toMatchObject({
      bookingWindowWeeks: 4,
      minAdvanceBusinessDays: 1,
      minAdvanceUnit: 'hours',
      defaultBufferMinutes: 15,
      timezone: 'America/Santiago',
    })
  })

  it('returns 404 when professional not found', async () => {
    prismaMock.professional.findUnique.mockResolvedValue(null)
    const res = await request(app).get('/api/config')
    expect(res.status).toBe(404)
  })

  it('includes photoUrl when the professional has one set', async () => {
    const photoUrl = 'data:image/jpeg;base64,/9j/4AAQSkZJRg=='
    prismaMock.professional.findUnique.mockResolvedValue({ ...PROFESSIONAL, photoUrl })
    const res = await request(app).get('/api/config')
    expect(res.status).toBe(200)
    expect(res.body.data.photoUrl).toBe(photoUrl)
  })

  it('returns photoUrl null when the professional has none set', async () => {
    prismaMock.professional.findUnique.mockResolvedValue(PROFESSIONAL)
    const res = await request(app).get('/api/config')
    expect(res.status).toBe(200)
    expect(res.body.data.photoUrl).toBeNull()
  })
})

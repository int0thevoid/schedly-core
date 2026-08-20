import { beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'

vi.mock('../../lib/prisma.js', () => ({ prisma: prismaMock }))

import { prismaMock, resetMocks } from '../helpers/prisma-mock.js'
import app from '../../app.js'

function token() {
  return jwt.sign({ professionalId: 'pro1', role: 'admin' }, 'dev-secret')
}

const PROFESSIONAL = {
  id: 'pro1', name: 'Stefany', email: 'stefany@test.com', phone: null,
  timezone: 'America/Santiago', bookingWindowWeeks: 4,
  minAdvanceBusinessDays: 2, defaultBufferMinutes: 0,
  patientSearchField: 'name',
  treatmentTypes: ['Ansiedad', 'Terapia de pareja'],
  createdAt: new Date(), updatedAt: new Date(),
}

beforeEach(() => {
  resetMocks()
  process.env.PROFESSIONAL_ID = 'pro1'
})

describe('GET /api/admin/config', () => {
  it('returns professional config including patientSearchField', async () => {
    prismaMock.professional.findUnique.mockResolvedValue(PROFESSIONAL)
    const res = await request(app).get('/api/admin/config').set('Cookie', `auth_token=${token()}`)
    expect(res.status).toBe(200)
    expect(res.body.data).toMatchObject({
      bookingWindowWeeks: 4,
      minAdvanceBusinessDays: 2,
      defaultBufferMinutes: 0,
      timezone: 'America/Santiago',
      patientSearchField: 'name',
    })
  })

  it('returns treatmentTypes', async () => {
    prismaMock.professional.findUnique.mockResolvedValue(PROFESSIONAL)
    const res = await request(app).get('/api/admin/config').set('Cookie', `auth_token=${token()}`)
    expect(res.status).toBe(200)
    expect(res.body.data.treatmentTypes).toEqual(['Ansiedad', 'Terapia de pareja'])
  })

  it('returns an empty array when treatmentTypes is not set', async () => {
    prismaMock.professional.findUnique.mockResolvedValue({ ...PROFESSIONAL, treatmentTypes: undefined })
    const res = await request(app).get('/api/admin/config').set('Cookie', `auth_token=${token()}`)
    expect(res.status).toBe(200)
    expect(res.body.data.treatmentTypes).toEqual([])
  })

  it('returns dailyDigestTime', async () => {
    prismaMock.professional.findUnique.mockResolvedValue({ ...PROFESSIONAL, dailyDigestTime: '17:30' })
    const res = await request(app).get('/api/admin/config').set('Cookie', `auth_token=${token()}`)
    expect(res.status).toBe(200)
    expect(res.body.data.dailyDigestTime).toBe('17:30')
  })

  it('defaults dailyDigestTime to 16:00 when not set', async () => {
    prismaMock.professional.findUnique.mockResolvedValue({ ...PROFESSIONAL, dailyDigestTime: undefined })
    const res = await request(app).get('/api/admin/config').set('Cookie', `auth_token=${token()}`)
    expect(res.status).toBe(200)
    expect(res.body.data.dailyDigestTime).toBe('16:00')
  })

  it('returns 404 when professional not found', async () => {
    prismaMock.professional.findUnique.mockResolvedValue(null)
    const res = await request(app).get('/api/admin/config').set('Cookie', `auth_token=${token()}`)
    expect(res.status).toBe(404)
  })
})

describe('PATCH /api/admin/config', () => {
  it('updates config fields', async () => {
    prismaMock.professional.findUnique.mockResolvedValue(PROFESSIONAL)
    prismaMock.professional.update.mockResolvedValue({ ...PROFESSIONAL, bookingWindowWeeks: 8 })
    const res = await request(app)
      .patch('/api/admin/config')
      .set('Cookie', `auth_token=${token()}`)
      .send({ bookingWindowWeeks: 8 })
    expect(res.status).toBe(200)
    expect(res.body.data.bookingWindowWeeks).toBe(8)
  })

  it('updates patientSearchField', async () => {
    prismaMock.professional.findUnique.mockResolvedValue(PROFESSIONAL)
    prismaMock.professional.update.mockResolvedValue({ ...PROFESSIONAL, patientSearchField: 'email' })
    const res = await request(app)
      .patch('/api/admin/config')
      .set('Cookie', `auth_token=${token()}`)
      .send({ patientSearchField: 'email' })
    expect(res.status).toBe(200)
    expect(res.body.data.patientSearchField).toBe('email')
  })

  it('returns 400 for invalid patientSearchField value', async () => {
    const res = await request(app)
      .patch('/api/admin/config')
      .set('Cookie', `auth_token=${token()}`)
      .send({ patientSearchField: 'invalid' })
    expect(res.status).toBe(400)
  })

  it('updates treatmentTypes', async () => {
    prismaMock.professional.findUnique.mockResolvedValue(PROFESSIONAL)
    prismaMock.professional.update.mockResolvedValue({ ...PROFESSIONAL, treatmentTypes: ['TCA'] })
    const res = await request(app)
      .patch('/api/admin/config')
      .set('Cookie', `auth_token=${token()}`)
      .send({ treatmentTypes: ['TCA'] })
    expect(res.status).toBe(200)
    expect(res.body.data.treatmentTypes).toEqual(['TCA'])
    expect(prismaMock.professional.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { treatmentTypes: ['TCA'] } }),
    )
  })

  it('updates dailyDigestTime', async () => {
    prismaMock.professional.findUnique.mockResolvedValue(PROFESSIONAL)
    prismaMock.professional.update.mockResolvedValue({ ...PROFESSIONAL, dailyDigestTime: '18:00' })
    const res = await request(app)
      .patch('/api/admin/config')
      .set('Cookie', `auth_token=${token()}`)
      .send({ dailyDigestTime: '18:00' })
    expect(res.status).toBe(200)
    expect(res.body.data.dailyDigestTime).toBe('18:00')
    expect(prismaMock.professional.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { dailyDigestTime: '18:00' } }),
    )
  })

  it('returns 400 for invalid dailyDigestTime format', async () => {
    const res = await request(app)
      .patch('/api/admin/config')
      .set('Cookie', `auth_token=${token()}`)
      .send({ dailyDigestTime: '25:00' })
    expect(res.status).toBe(400)
  })

  it('returns 400 when treatmentTypes contains an empty string', async () => {
    const res = await request(app)
      .patch('/api/admin/config')
      .set('Cookie', `auth_token=${token()}`)
      .send({ treatmentTypes: ['Ansiedad', ''] })
    expect(res.status).toBe(400)
  })

  it('returns 400 when no fields provided', async () => {
    const res = await request(app)
      .patch('/api/admin/config')
      .set('Cookie', `auth_token=${token()}`)
      .send({})
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid values', async () => {
    const res = await request(app)
      .patch('/api/admin/config')
      .set('Cookie', `auth_token=${token()}`)
      .send({ bookingWindowWeeks: 100 })
    expect(res.status).toBe(400)
  })
})

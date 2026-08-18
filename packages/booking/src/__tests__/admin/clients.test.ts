import { beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'

vi.mock('../../lib/prisma.js', () => ({ prisma: prismaMock }))

import { prismaMock, resetMocks } from '../helpers/prisma-mock.js'
import app from '../../app.js'

function token() {
  return jwt.sign({ role: 'admin' }, 'dev-secret')
}

const CLIENT = {
  id: 'c1',
  name: 'Ana García',
  email: 'ana@example.com',
  phone: '+56912345678',
  rut: null,
  treatmentType: null,
  dataConsentGiven: false,
}

beforeEach(() => {
  resetMocks()
})

describe('GET /api/admin/clients', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/admin/clients')
    expect(res.status).toBe(401)
  })

  it('returns list of clients matching email query (legacy param)', async () => {
    prismaMock.client.findMany.mockResolvedValue([CLIENT])
    const res = await request(app)
      .get('/api/admin/clients?email=ana')
      .set('Cookie', `auth_token=${token()}`)
    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(1)
    expect(res.body.data[0]).toMatchObject({
      id: 'c1',
      name: 'Ana García',
      email: 'ana@example.com',
    })
  })

  it('searches by q=text with default field name', async () => {
    prismaMock.client.findMany.mockResolvedValue([CLIENT])
    const res = await request(app)
      .get('/api/admin/clients?q=ana')
      .set('Cookie', `auth_token=${token()}`)
    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(1)
    const call = prismaMock.client.findMany.mock.calls[0][0]
    expect(call.where).toMatchObject({ name: { contains: 'ana', mode: 'insensitive' } })
  })

  it('searches by q=text with field=email', async () => {
    prismaMock.client.findMany.mockResolvedValue([CLIENT])
    const res = await request(app)
      .get('/api/admin/clients?q=ana@example.com&field=email')
      .set('Cookie', `auth_token=${token()}`)
    expect(res.status).toBe(200)
    const call = prismaMock.client.findMany.mock.calls[0][0]
    expect(call.where).toMatchObject({ email: { contains: 'ana@example.com', mode: 'insensitive' } })
  })

  it('searches by q=text with field=rut', async () => {
    prismaMock.client.findMany.mockResolvedValue([{ ...CLIENT, rut: '12345678-9' }])
    const res = await request(app)
      .get('/api/admin/clients?q=12345678&field=rut')
      .set('Cookie', `auth_token=${token()}`)
    expect(res.status).toBe(200)
    const call = prismaMock.client.findMany.mock.calls[0][0]
    expect(call.where).toMatchObject({ rut: { contains: '12345678', mode: 'insensitive' } })
  })

  it('searches by q=text with field=phone', async () => {
    prismaMock.client.findMany.mockResolvedValue([CLIENT])
    const res = await request(app)
      .get('/api/admin/clients?q=569&field=phone')
      .set('Cookie', `auth_token=${token()}`)
    expect(res.status).toBe(200)
    const call = prismaMock.client.findMany.mock.calls[0][0]
    expect(call.where).toMatchObject({ phone: { contains: '569', mode: 'insensitive' } })
  })

  it('returns 400 for invalid field value', async () => {
    const res = await request(app)
      .get('/api/admin/clients?q=test&field=invalid')
      .set('Cookie', `auth_token=${token()}`)
    expect(res.status).toBe(400)
  })

  it('returns empty array with no query params', async () => {
    prismaMock.client.findMany.mockResolvedValue([])
    const res = await request(app)
      .get('/api/admin/clients')
      .set('Cookie', `auth_token=${token()}`)
    expect(res.status).toBe(200)
    expect(res.body.data).toEqual([])
  })

  it('includes rut in response', async () => {
    prismaMock.client.findMany.mockResolvedValue([{ ...CLIENT, rut: '12345678-9' }])
    const res = await request(app)
      .get('/api/admin/clients?q=ana')
      .set('Cookie', `auth_token=${token()}`)
    expect(res.status).toBe(200)
    expect(res.body.data[0].rut).toBe('12345678-9')
  })
})

describe('GET /api/admin/clients/:id', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/admin/clients/c1')
    expect(res.status).toBe(401)
  })

  it('returns the client when it exists', async () => {
    prismaMock.client.findUnique.mockResolvedValue({ ...CLIENT, createdAt: new Date('2026-01-01T00:00:00Z') })
    const res = await request(app)
      .get('/api/admin/clients/c1')
      .set('Cookie', `auth_token=${token()}`)
    expect(res.status).toBe(200)
    expect(res.body.data).toMatchObject({
      id: 'c1',
      name: 'Ana García',
      email: 'ana@example.com',
      phone: '+56912345678',
      rut: null,
    })
    expect(res.body.data.createdAt).toBeDefined()
  })

  it('returns 404 when the client does not exist', async () => {
    prismaMock.client.findUnique.mockResolvedValue(null)
    const res = await request(app)
      .get('/api/admin/clients/does-not-exist')
      .set('Cookie', `auth_token=${token()}`)
    expect(res.status).toBe(404)
  })

  it('includes treatmentType and dataConsentGiven in response', async () => {
    prismaMock.client.findUnique.mockResolvedValue({
      ...CLIENT,
      treatmentType: 'Ansiedad',
      dataConsentGiven: true,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    })
    const res = await request(app)
      .get('/api/admin/clients/c1')
      .set('Cookie', `auth_token=${token()}`)
    expect(res.status).toBe(200)
    expect(res.body.data.treatmentType).toBe('Ansiedad')
    expect(res.body.data.dataConsentGiven).toBe(true)
  })
})

describe('PATCH /api/admin/clients/:id', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).patch('/api/admin/clients/c1').send({ treatmentType: 'Ansiedad' })
    expect(res.status).toBe(401)
  })

  it('updates treatmentType and returns the updated client', async () => {
    prismaMock.client.findUnique.mockResolvedValue(CLIENT)
    prismaMock.client.update.mockResolvedValue({ ...CLIENT, treatmentType: 'Ansiedad' })
    const res = await request(app)
      .patch('/api/admin/clients/c1')
      .set('Cookie', `auth_token=${token()}`)
      .send({ treatmentType: 'Ansiedad' })
    expect(res.status).toBe(200)
    expect(res.body.data.treatmentType).toBe('Ansiedad')
    expect(prismaMock.client.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'c1' },
        data: { treatmentType: 'Ansiedad' },
      }),
    )
  })

  it('allows clearing treatmentType with null', async () => {
    prismaMock.client.findUnique.mockResolvedValue({ ...CLIENT, treatmentType: 'Ansiedad' })
    prismaMock.client.update.mockResolvedValue({ ...CLIENT, treatmentType: null })
    const res = await request(app)
      .patch('/api/admin/clients/c1')
      .set('Cookie', `auth_token=${token()}`)
      .send({ treatmentType: null })
    expect(res.status).toBe(200)
    expect(res.body.data.treatmentType).toBeNull()
  })

  it('returns 404 when the client does not exist', async () => {
    prismaMock.client.findUnique.mockResolvedValue(null)
    const res = await request(app)
      .patch('/api/admin/clients/does-not-exist')
      .set('Cookie', `auth_token=${token()}`)
      .send({ treatmentType: 'Ansiedad' })
    expect(res.status).toBe(404)
  })

  it('returns 400 when treatmentType is missing from body', async () => {
    const res = await request(app)
      .patch('/api/admin/clients/c1')
      .set('Cookie', `auth_token=${token()}`)
      .send({})
    expect(res.status).toBe(400)
  })
})

describe('GET /api/admin/clients/:id/stats', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/admin/clients/c1/stats')
    expect(res.status).toBe(401)
  })

  it('returns 404 when client not found', async () => {
    prismaMock.client.findUnique.mockResolvedValue(null)
    const res = await request(app)
      .get('/api/admin/clients/does-not-exist/stats')
      .set('Cookie', `auth_token=${token()}`)
    expect(res.status).toBe(404)
  })

  it('returns zeros when client has no appointments', async () => {
    prismaMock.client.findUnique.mockResolvedValue({ ...CLIENT, createdAt: new Date('2026-01-01T00:00:00Z') })
    prismaMock.appointment.findMany.mockResolvedValue([])
    const res = await request(app)
      .get('/api/admin/clients/c1/stats')
      .set('Cookie', `auth_token=${token()}`)
    expect(res.status).toBe(200)
    expect(res.body.data).toMatchObject({
      lastAppointment: null,
      totalCompleted: 0,
      totalCancelled: 0,
      servicesUsed: [],
    })
  })

  it('returns correct stats when appointments exist', async () => {
    prismaMock.client.findUnique.mockResolvedValue({ ...CLIENT, createdAt: new Date('2026-01-01T00:00:00Z') })
    prismaMock.appointment.findMany.mockResolvedValue([
      {
        id: 'a1',
        startDateTime: new Date('2026-06-15T10:00:00Z'),
        status: 'confirmed',
        outcome: 'attended',
        service: { name: 'Primera visita' },
      },
      {
        id: 'a2',
        startDateTime: new Date('2026-05-10T10:00:00Z'),
        status: 'cancelled',
        outcome: null,
        service: { name: 'Terapia individual' },
      },
      {
        id: 'a3',
        startDateTime: new Date('2026-04-01T10:00:00Z'),
        status: 'confirmed',
        outcome: 'attended',
        service: { name: 'Primera visita' },
      },
    ])
    const res = await request(app)
      .get('/api/admin/clients/c1/stats')
      .set('Cookie', `auth_token=${token()}`)
    expect(res.status).toBe(200)
    expect(res.body.data).toMatchObject({
      lastAppointment: '2026-06-15T10:00:00.000Z',
      totalCompleted: 2,
      totalCancelled: 1,
    })
    expect(res.body.data.servicesUsed).toEqual(expect.arrayContaining(['Primera visita', 'Terapia individual']))
    expect(res.body.data.servicesUsed).toHaveLength(2)
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'

vi.mock('../../lib/prisma.js', () => ({ prisma: prismaMock }))

import { prismaMock, resetMocks } from '../helpers/prisma-mock.js'
import app from '../../app.js'

function token() {
  return `Bearer ${jwt.sign({ role: 'admin' }, 'dev-secret')}`
}

const SERVICE = {
  id: 's1',
  professionalId: 'pro1',
  name: 'Terapia individual',
  description: 'Sesión individual',
  duration: 50,
  price: 30000,
  modality: 'online',
  bufferMinutes: 15,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
}

beforeEach(() => {
  resetMocks()
  process.env.PROFESSIONAL_ID = 'pro1'
})

describe('GET /api/admin/services', () => {
  it('returns all services including inactive', async () => {
    const inactive = { ...SERVICE, id: 's2', isActive: false }
    prismaMock.service.findMany.mockResolvedValue([SERVICE, inactive])
    const res = await request(app).get('/api/admin/services').set('Authorization', token())
    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(2)
    expect(prismaMock.service.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { professionalId: 'pro1' } }),
    )
  })

  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/admin/services')
    expect(res.status).toBe(401)
  })
})

describe('POST /api/admin/services', () => {
  it('creates a service with required fields', async () => {
    prismaMock.service.create.mockResolvedValue(SERVICE)
    const body = {
      name: 'Terapia individual',
      description: 'Sesión individual',
      duration: 50,
      price: 30000,
      modality: 'online',
    }
    const res = await request(app)
      .post('/api/admin/services')
      .set('Authorization', token())
      .send(body)
    expect(res.status).toBe(201)
    expect(res.body.data.name).toBe('Terapia individual')
    expect(prismaMock.service.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: 'Terapia individual', professionalId: 'pro1' }),
      }),
    )
  })

  it('returns 400 for missing name', async () => {
    const res = await request(app)
      .post('/api/admin/services')
      .set('Authorization', token())
      .send({ description: 'X', duration: 50, price: 30000, modality: 'online' })
    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
  })

  it('returns 400 for invalid modality', async () => {
    const res = await request(app)
      .post('/api/admin/services')
      .set('Authorization', token())
      .send({ name: 'X', description: 'X', duration: 50, price: 30000, modality: 'unknown' })
    expect(res.status).toBe(400)
  })

  it('returns 400 for zero duration', async () => {
    const res = await request(app)
      .post('/api/admin/services')
      .set('Authorization', token())
      .send({ name: 'X', description: 'X', duration: 0, price: 30000, modality: 'online' })
    expect(res.status).toBe(400)
  })
})

describe('PATCH /api/admin/services/:id', () => {
  it('updates service fields', async () => {
    prismaMock.service.findUnique.mockResolvedValue(SERVICE)
    prismaMock.service.update.mockResolvedValue({ ...SERVICE, price: 35000 })
    const res = await request(app)
      .patch('/api/admin/services/s1')
      .set('Authorization', token())
      .send({ price: 35000 })
    expect(res.status).toBe(200)
    expect(res.body.data.price).toBe(35000)
    expect(prismaMock.service.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 's1' } }),
    )
  })

  it('returns 404 when service not found', async () => {
    prismaMock.service.findUnique.mockResolvedValue(null)
    const res = await request(app)
      .patch('/api/admin/services/bad')
      .set('Authorization', token())
      .send({ price: 35000 })
    expect(res.status).toBe(404)
  })
})

describe('PATCH /api/admin/services/:id/toggle', () => {
  it('toggles isActive to false', async () => {
    prismaMock.service.findUnique.mockResolvedValue(SERVICE)
    prismaMock.service.update.mockResolvedValue({ ...SERVICE, isActive: false })
    const res = await request(app)
      .patch('/api/admin/services/s1/toggle')
      .set('Authorization', token())
      .send({ isActive: false })
    expect(res.status).toBe(200)
    expect(res.body.data.isActive).toBe(false)
    expect(prismaMock.service.update).toHaveBeenCalledWith({
      where: { id: 's1' },
      data: { isActive: false },
    })
  })

  it('returns 400 for missing isActive field', async () => {
    const res = await request(app)
      .patch('/api/admin/services/s1/toggle')
      .set('Authorization', token())
      .send({})
    expect(res.status).toBe(400)
  })

  it('returns 404 when service not found', async () => {
    prismaMock.service.findUnique.mockResolvedValue(null)
    const res = await request(app)
      .patch('/api/admin/services/bad/toggle')
      .set('Authorization', token())
      .send({ isActive: false })
    expect(res.status).toBe(404)
  })
})

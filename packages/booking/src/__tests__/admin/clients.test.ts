import { beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'

vi.mock('../../lib/prisma.js', () => ({ prisma: prismaMock }))

import { prismaMock, resetMocks } from '../helpers/prisma-mock.js'
import app from '../../app.js'

function token() {
  return `Bearer ${jwt.sign({ role: 'admin' }, 'dev-secret')}`
}

const CLIENT = {
  id: 'c1',
  name: 'Ana García',
  email: 'ana@example.com',
  phone: '+56912345678',
  rut: null,
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
      .set('Authorization', token())
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
      .set('Authorization', token())
    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(1)
    const call = prismaMock.client.findMany.mock.calls[0][0]
    expect(call.where).toMatchObject({ name: { contains: 'ana', mode: 'insensitive' } })
  })

  it('searches by q=text with field=email', async () => {
    prismaMock.client.findMany.mockResolvedValue([CLIENT])
    const res = await request(app)
      .get('/api/admin/clients?q=ana@example.com&field=email')
      .set('Authorization', token())
    expect(res.status).toBe(200)
    const call = prismaMock.client.findMany.mock.calls[0][0]
    expect(call.where).toMatchObject({ email: { contains: 'ana@example.com', mode: 'insensitive' } })
  })

  it('searches by q=text with field=rut', async () => {
    prismaMock.client.findMany.mockResolvedValue([{ ...CLIENT, rut: '12345678-9' }])
    const res = await request(app)
      .get('/api/admin/clients?q=12345678&field=rut')
      .set('Authorization', token())
    expect(res.status).toBe(200)
    const call = prismaMock.client.findMany.mock.calls[0][0]
    expect(call.where).toMatchObject({ rut: { contains: '12345678', mode: 'insensitive' } })
  })

  it('searches by q=text with field=phone', async () => {
    prismaMock.client.findMany.mockResolvedValue([CLIENT])
    const res = await request(app)
      .get('/api/admin/clients?q=569&field=phone')
      .set('Authorization', token())
    expect(res.status).toBe(200)
    const call = prismaMock.client.findMany.mock.calls[0][0]
    expect(call.where).toMatchObject({ phone: { contains: '569', mode: 'insensitive' } })
  })

  it('returns 400 for invalid field value', async () => {
    const res = await request(app)
      .get('/api/admin/clients?q=test&field=invalid')
      .set('Authorization', token())
    expect(res.status).toBe(400)
  })

  it('returns empty array with no query params', async () => {
    prismaMock.client.findMany.mockResolvedValue([])
    const res = await request(app)
      .get('/api/admin/clients')
      .set('Authorization', token())
    expect(res.status).toBe(200)
    expect(res.body.data).toEqual([])
  })

  it('includes rut in response', async () => {
    prismaMock.client.findMany.mockResolvedValue([{ ...CLIENT, rut: '12345678-9' }])
    const res = await request(app)
      .get('/api/admin/clients?q=ana')
      .set('Authorization', token())
    expect(res.status).toBe(200)
    expect(res.body.data[0].rut).toBe('12345678-9')
  })
})

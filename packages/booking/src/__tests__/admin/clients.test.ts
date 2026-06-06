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
}

beforeEach(() => {
  resetMocks()
})

describe('GET /api/admin/clients', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/admin/clients')
    expect(res.status).toBe(401)
  })

  it('returns list of clients matching email query', async () => {
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

  it('returns empty array when no clients match', async () => {
    prismaMock.client.findMany.mockResolvedValue([])
    const res = await request(app)
      .get('/api/admin/clients?email=notfound@test.com')
      .set('Authorization', token())
    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(0)
  })

  it('returns empty array with no query params', async () => {
    prismaMock.client.findMany.mockResolvedValue([])
    const res = await request(app)
      .get('/api/admin/clients')
      .set('Authorization', token())
    expect(res.status).toBe(200)
    expect(res.body.data).toEqual([])
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'

vi.mock('../lib/prisma.js', () => ({ prisma: prismaMock }))

import { prismaMock, resetMocks } from './helpers/prisma-mock.js'
import app from '../app.js'

beforeEach(() => {
  resetMocks()
})

describe('GET /api/clients/lookup', () => {
  it('returns 400 when neither email nor rut is provided', async () => {
    const res = await request(app).get('/api/clients/lookup')
    expect(res.status).toBe(400)
  })

  it('returns 400 for an invalid email', async () => {
    const res = await request(app).get('/api/clients/lookup?email=not-an-email')
    expect(res.status).toBe(400)
  })

  it('returns name, phone and dataConsentGiven when the client exists by email', async () => {
    prismaMock.client.findFirst.mockResolvedValue({
      name: 'Ana García',
      phone: '+56912345678',
      dataConsentGiven: true,
    })
    const res = await request(app).get('/api/clients/lookup?email=ana@example.com')
    expect(res.status).toBe(200)
    expect(res.body.data).toEqual({ name: 'Ana García', phone: '+56912345678', dataConsentGiven: true })
    expect(prismaMock.client.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: 'ana@example.com' } }),
    )
  })

  it('looks up by rut when provided', async () => {
    prismaMock.client.findFirst.mockResolvedValue({ name: 'Ana García', phone: null, dataConsentGiven: false })
    const res = await request(app).get('/api/clients/lookup?rut=12345678-9')
    expect(res.status).toBe(200)
    expect(prismaMock.client.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { rut: '12345678-9' } }),
    )
  })

  it('returns null data when no client matches', async () => {
    prismaMock.client.findFirst.mockResolvedValue(null)
    const res = await request(app).get('/api/clients/lookup?email=desconocido@example.com')
    expect(res.status).toBe(200)
    expect(res.body.data).toBeNull()
  })

  it('never exposes treatmentType or other sensitive fields', async () => {
    prismaMock.client.findFirst.mockResolvedValue({ name: 'Ana García', phone: null, dataConsentGiven: true })
    const res = await request(app).get('/api/clients/lookup?email=ana@example.com')
    expect(res.body.data).not.toHaveProperty('treatmentType')
    expect(res.body.data).not.toHaveProperty('rut')
    expect(res.body.data).not.toHaveProperty('email')
  })
})

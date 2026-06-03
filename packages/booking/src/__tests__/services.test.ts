import { beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'

vi.mock('../lib/prisma.js', () => ({ prisma: prismaMock }))

import { prismaMock, resetMocks } from './helpers/prisma-mock.js'
import app from '../app.js'

const SERVICES = [
  { id: 's1', name: 'Terapia individual', professionalId: 'pro1', isActive: true, modality: 'online', duration: 50, price: 30000, description: '', bufferMinutes: null, createdAt: new Date(), updatedAt: new Date() },
  { id: 's2', name: 'Terapia de pareja', professionalId: 'pro1', isActive: true, modality: 'presential', duration: 60, price: 42000, description: '', bufferMinutes: null, createdAt: new Date(), updatedAt: new Date() },
]

beforeEach(() => {
  resetMocks()
  process.env.PROFESSIONAL_ID = 'pro1'
})

describe('GET /api/services', () => {
  it('returns active services', async () => {
    prismaMock.service.findMany.mockResolvedValue(SERVICES)
    const res = await request(app).get('/api/services')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: true, data: JSON.parse(JSON.stringify(SERVICES)) })
    expect(prismaMock.service.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ isActive: true, professionalId: 'pro1' }) }),
    )
  })

  it('filters by modality', async () => {
    prismaMock.service.findMany.mockResolvedValue([SERVICES[0]])
    const res = await request(app).get('/api/services?modality=online')
    expect(res.status).toBe(200)
    expect(prismaMock.service.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ modality: 'online' }) }),
    )
  })

  it('rejects invalid modality', async () => {
    const res = await request(app).get('/api/services?modality=unknown')
    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
  })
})

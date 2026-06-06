import { beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'

vi.mock('../../lib/prisma.js', () => ({ prisma: prismaMock }))

import { prismaMock, resetMocks } from '../helpers/prisma-mock.js'
import app from '../../app.js'

function token() {
  return `Bearer ${jwt.sign({ role: 'admin' }, 'dev-secret')}`
}

const BLOCK = {
  id: 'blk1', professionalId: 'pro1', title: 'Vacaciones',
  startDateTime: new Date('2026-07-01T00:00:00Z'),
  endDateTime: new Date('2026-07-07T23:59:59Z'),
  recurrenceType: null, recurrenceEnd: null,
  createdAt: new Date(), updatedAt: new Date(),
}

beforeEach(() => {
  resetMocks()
  process.env.PROFESSIONAL_ID = 'pro1'
})

describe('GET /api/admin/schedule/blocks', () => {
  it('returns all blocks', async () => {
    prismaMock.scheduleBlock.findMany.mockResolvedValue([BLOCK])
    const res = await request(app).get('/api/admin/schedule/blocks').set('Authorization', token())
    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(1)
  })
})

describe('POST /api/admin/schedule/blocks', () => {
  it('creates a block when no conflicting appointments', async () => {
    prismaMock.appointment.findMany.mockResolvedValue([])
    prismaMock.scheduleBlock.create.mockResolvedValue(BLOCK)
    const res = await request(app)
      .post('/api/admin/schedule/blocks')
      .set('Authorization', token())
      .send({ title: 'Vacaciones', startDateTime: '2026-07-01T00:00:00Z', endDateTime: '2026-07-07T23:59:59Z' })
    expect(res.status).toBe(201)
    expect(res.body.data.title).toBe('Vacaciones')
  })

  it('returns 409 when conflicting appointment exists', async () => {
    prismaMock.appointment.findMany.mockResolvedValue([{
      clientName: 'Ana García',
      startDateTime: new Date('2026-07-02T10:00:00Z'),
      endDateTime: new Date('2026-07-02T11:00:00Z'),
    }])
    const res = await request(app)
      .post('/api/admin/schedule/blocks')
      .set('Authorization', token())
      .send({ title: 'Bloq', startDateTime: '2026-07-01T00:00:00Z', endDateTime: '2026-07-07T23:59:59Z' })
    expect(res.status).toBe(409)
    expect(res.body.error).toBe('Hay citas agendadas en este horario')
    expect(res.body.conflicts[0].clientName).toBe('Ana García')
  })

  it('returns 400 for missing title', async () => {
    const res = await request(app)
      .post('/api/admin/schedule/blocks')
      .set('Authorization', token())
      .send({ startDateTime: '2026-07-01T00:00:00Z', endDateTime: '2026-07-07T23:59:59Z' })
    expect(res.status).toBe(400)
  })

  it('returns 400 when end is before start', async () => {
    const res = await request(app)
      .post('/api/admin/schedule/blocks')
      .set('Authorization', token())
      .send({ title: 'X', startDateTime: '2026-07-07T00:00:00Z', endDateTime: '2026-07-01T00:00:00Z' })
    expect(res.status).toBe(400)
  })
})

describe('DELETE /api/admin/schedule/blocks/:id', () => {
  it('deletes an existing block', async () => {
    prismaMock.scheduleBlock.findUnique.mockResolvedValue(BLOCK)
    prismaMock.scheduleBlock.delete.mockResolvedValue(BLOCK)
    const res = await request(app).delete('/api/admin/schedule/blocks/blk1').set('Authorization', token())
    expect(res.status).toBe(200)
    expect(res.body.data.id).toBe('blk1')
  })

  it('returns 404 when block not found', async () => {
    prismaMock.scheduleBlock.findUnique.mockResolvedValue(null)
    const res = await request(app).delete('/api/admin/schedule/blocks/bad').set('Authorization', token())
    expect(res.status).toBe(404)
  })
})

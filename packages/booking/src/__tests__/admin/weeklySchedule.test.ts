import { beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'

vi.mock('../../lib/prisma.js', () => ({ prisma: prismaMock }))

import { prismaMock, resetMocks } from '../helpers/prisma-mock.js'
import app from '../../app.js'

function token() {
  return jwt.sign({ professionalId: 'pro1', role: 'admin' }, 'dev-secret')
}

const WS_MON = {
  id: 'ws1',
  professionalId: 'pro1',
  dayOfWeek: 1,
  startTime: '09:00',
  endTime: '18:00',
  serviceIds: [],
  createdAt: new Date(),
  updatedAt: new Date(),
}

beforeEach(() => {
  resetMocks()
  process.env.PROFESSIONAL_ID = 'pro1'
})

describe('GET /api/admin/schedule/weekly', () => {
  it('returns weekly schedules for the professional', async () => {
    prismaMock.weeklySchedule.findMany.mockResolvedValue([WS_MON])
    const res = await request(app)
      .get('/api/admin/schedule/weekly')
      .set('Cookie', `auth_token=${token()}`)
    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(1)
    expect(res.body.data[0].dayOfWeek).toBe(1)
    expect(prismaMock.weeklySchedule.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { professionalId: 'pro1' } }),
    )
  })

  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/admin/schedule/weekly')
    expect(res.status).toBe(401)
  })
})

describe('POST /api/admin/schedule/weekly', () => {
  it('creates a day schedule', async () => {
    prismaMock.weeklySchedule.create.mockResolvedValue(WS_MON)
    const res = await request(app)
      .post('/api/admin/schedule/weekly')
      .set('Cookie', `auth_token=${token()}`)
      .send({ dayOfWeek: 1, startTime: '09:00', endTime: '18:00' })
    expect(res.status).toBe(201)
    expect(res.body.data.dayOfWeek).toBe(1)
    expect(prismaMock.weeklySchedule.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ dayOfWeek: 1, startTime: '09:00', endTime: '18:00', professionalId: 'pro1' }),
      }),
    )
  })

  it('returns 400 for missing dayOfWeek', async () => {
    const res = await request(app)
      .post('/api/admin/schedule/weekly')
      .set('Cookie', `auth_token=${token()}`)
      .send({ startTime: '09:00', endTime: '18:00' })
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid dayOfWeek (0=Sunday not allowed)', async () => {
    const res = await request(app)
      .post('/api/admin/schedule/weekly')
      .set('Cookie', `auth_token=${token()}`)
      .send({ dayOfWeek: 0, startTime: '09:00', endTime: '18:00' })
    expect(res.status).toBe(400)
  })

  it('returns 400 when end is not after start', async () => {
    const res = await request(app)
      .post('/api/admin/schedule/weekly')
      .set('Cookie', `auth_token=${token()}`)
      .send({ dayOfWeek: 1, startTime: '18:00', endTime: '09:00' })
    expect(res.status).toBe(400)
  })
})

describe('PATCH /api/admin/schedule/weekly/:id', () => {
  it('updates startTime and endTime', async () => {
    prismaMock.weeklySchedule.findFirst.mockResolvedValue(WS_MON)
    prismaMock.weeklySchedule.update.mockResolvedValue({ ...WS_MON, startTime: '10:00', endTime: '19:00' })
    const res = await request(app)
      .patch('/api/admin/schedule/weekly/ws1')
      .set('Cookie', `auth_token=${token()}`)
      .send({ startTime: '10:00', endTime: '19:00' })
    expect(res.status).toBe(200)
    expect(res.body.data.startTime).toBe('10:00')
    expect(prismaMock.weeklySchedule.update).toHaveBeenCalledWith({
      where: { id: 'ws1' },
      data: { startTime: '10:00', endTime: '19:00' },
    })
  })

  it('returns 404 when schedule not found', async () => {
    prismaMock.weeklySchedule.findFirst.mockResolvedValue(null)
    const res = await request(app)
      .patch('/api/admin/schedule/weekly/bad')
      .set('Cookie', `auth_token=${token()}`)
      .send({ startTime: '10:00', endTime: '19:00' })
    expect(res.status).toBe(404)
  })

  it('returns 404 for a schedule belonging to another professional (no cross-tenant access)', async () => {
    prismaMock.weeklySchedule.findFirst.mockResolvedValue(null)
    const otherToken = jwt.sign({ professionalId: 'pro2', role: 'admin' }, 'dev-secret')
    const res = await request(app)
      .patch('/api/admin/schedule/weekly/ws1')
      .set('Cookie', `auth_token=${otherToken}`)
      .send({ startTime: '10:00', endTime: '19:00' })
    expect(res.status).toBe(404)
    expect(prismaMock.weeklySchedule.findFirst).toHaveBeenCalledWith({ where: { id: 'ws1', professionalId: 'pro2' } })
  })

  it('returns 400 for invalid time format', async () => {
    const res = await request(app)
      .patch('/api/admin/schedule/weekly/ws1')
      .set('Cookie', `auth_token=${token()}`)
      .send({ startTime: 'bad-time', endTime: '19:00' })
    expect(res.status).toBe(400)
  })
})

describe('DELETE /api/admin/schedule/weekly/:id', () => {
  it('deletes an existing day schedule', async () => {
    prismaMock.weeklySchedule.findFirst.mockResolvedValue(WS_MON)
    prismaMock.weeklySchedule.delete.mockResolvedValue(WS_MON)
    const res = await request(app)
      .delete('/api/admin/schedule/weekly/ws1')
      .set('Cookie', `auth_token=${token()}`)
    expect(res.status).toBe(200)
    expect(res.body.data.id).toBe('ws1')
  })

  it('returns 404 when schedule not found', async () => {
    prismaMock.weeklySchedule.findFirst.mockResolvedValue(null)
    const res = await request(app)
      .delete('/api/admin/schedule/weekly/bad')
      .set('Cookie', `auth_token=${token()}`)
    expect(res.status).toBe(404)
  })
})

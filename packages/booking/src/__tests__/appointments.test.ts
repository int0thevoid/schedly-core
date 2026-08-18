import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'

vi.mock('../lib/prisma.js', () => ({ prisma: prismaMock }))

import { prismaMock, resetMocks } from './helpers/prisma-mock.js'
import app from '../app.js'

const SERVICE = {
  id: 's1', name: 'Sesión', professionalId: 'pro1', isActive: true,
  modality: 'online', duration: 50, price: 30000, description: '',
  bufferMinutes: null, createdAt: new Date(), updatedAt: new Date(),
}

const APPOINTMENT = {
  id: 'apt1', professionalId: 'pro1', serviceId: 's1',
  clientName: 'Ana', clientEmail: 'ana@test.com', clientPhone: '+56912345678',
  startDateTime: new Date('2026-12-15T14:00:00Z'),
  endDateTime: new Date('2026-12-15T14:50:00Z'),
  modality: 'online', status: 'pending', paymentStatus: 'unpaid',
  paymentAmount: null, paymentMethod: null, notes: null,
  bookingFlow: 'advance', paymentDeadline: new Date(Date.now() + 24 * 60 * 60 * 1000),
  autoCancelledAt: null, attendanceConfirmed: false, attendanceConfirmedAt: null,
  appointmentToken: 'tok_abc123',
  tokenExpiresAt: new Date('2026-12-14T23:00:00Z'),
  createdAt: new Date(), updatedAt: new Date(),
}

const VALID_BODY = {
  serviceId: 's1',
  startDateTime: '2026-12-15T14:00:00Z',
  modality: 'online',
  clientName: 'Ana',
  clientEmail: 'ana@test.com',
  clientPhone: '+56912345678',
}

beforeEach(() => {
  resetMocks()
  process.env.PROFESSIONAL_ID = 'pro1'
  vi.useRealTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('POST /api/appointments', () => {
  it('creates appointment when slot is free', async () => {
    prismaMock.service.findUnique.mockResolvedValue(SERVICE)
    prismaMock.$transaction.mockImplementation(async (fn: (tx: typeof prismaMock) => Promise<unknown>) => fn(prismaMock))
    prismaMock.appointment.findFirst.mockResolvedValue(null)
    prismaMock.appointment.create.mockResolvedValue(APPOINTMENT)

    const res = await request(app).post('/api/appointments').send(VALID_BODY)
    expect(res.status).toBe(201)
    expect(res.body.success).toBe(true)
  })

  it('returns 409 when slot is taken', async () => {
    prismaMock.service.findUnique.mockResolvedValue(SERVICE)
    prismaMock.$transaction.mockRejectedValue(new Error('SLOT_TAKEN'))

    const res = await request(app).post('/api/appointments').send(VALID_BODY)
    expect(res.status).toBe(409)
  })

  it('runs the booking transaction with Serializable isolation', async () => {
    prismaMock.service.findUnique.mockResolvedValue(SERVICE)
    prismaMock.$transaction.mockImplementation(async (fn: (tx: typeof prismaMock) => Promise<unknown>) => fn(prismaMock))
    prismaMock.appointment.findFirst.mockResolvedValue(null)
    prismaMock.appointment.create.mockResolvedValue(APPOINTMENT)

    await request(app).post('/api/appointments').send(VALID_BODY)

    expect(prismaMock.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      { isolationLevel: 'Serializable' },
    )
  })

  it('retries once on a Serializable write conflict (P2034) and still succeeds', async () => {
    prismaMock.service.findUnique.mockResolvedValue(SERVICE)
    prismaMock.appointment.findFirst.mockResolvedValue(null)
    prismaMock.appointment.create.mockResolvedValue(APPOINTMENT)

    let calls = 0
    prismaMock.$transaction.mockImplementation(async (fn: (tx: typeof prismaMock) => Promise<unknown>) => {
      calls++
      if (calls === 1) throw { code: 'P2034', message: 'write conflict' }
      return fn(prismaMock)
    })

    const res = await request(app).post('/api/appointments').send(VALID_BODY)
    expect(res.status).toBe(201)
    expect(calls).toBe(2)
  })

  it('gives up and returns 409 after repeated Serializable write conflicts', async () => {
    prismaMock.service.findUnique.mockResolvedValue(SERVICE)
    prismaMock.$transaction.mockRejectedValue({ code: 'P2034', message: 'write conflict' })

    const res = await request(app).post('/api/appointments').send(VALID_BODY)
    expect(res.status).toBe(409)
  })

  it('returns 400 for invalid email', async () => {
    const res = await request(app).post('/api/appointments').send({ ...VALID_BODY, clientEmail: 'not-an-email' })
    expect(res.status).toBe(400)
  })

  it('returns 404 when service not found', async () => {
    prismaMock.service.findUnique.mockResolvedValue(null)
    const res = await request(app).post('/api/appointments').send(VALID_BODY)
    expect(res.status).toBe(404)
  })

  it('upserts client when saveClientData=true', async () => {
    prismaMock.service.findUnique.mockResolvedValue(SERVICE)
    prismaMock.$transaction.mockImplementation(async (fn: (tx: typeof prismaMock) => Promise<unknown>) => fn(prismaMock))
    prismaMock.appointment.findFirst.mockResolvedValue(null)
    prismaMock.client.upsert.mockResolvedValue({ id: 'c1', name: 'Ana', email: 'ana@test.com', phone: '+56912345678', rut: null })
    prismaMock.appointment.create.mockResolvedValue(APPOINTMENT)

    const res = await request(app).post('/api/appointments').send({ ...VALID_BODY, saveClientData: true })
    expect(res.status).toBe(201)
    expect(prismaMock.client.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { email: 'ana@test.com' },
    }))
  })

  it('persists dataConsentGiven=true on the client when saveClientData=true', async () => {
    prismaMock.service.findUnique.mockResolvedValue(SERVICE)
    prismaMock.$transaction.mockImplementation(async (fn: (tx: typeof prismaMock) => Promise<unknown>) => fn(prismaMock))
    prismaMock.appointment.findFirst.mockResolvedValue(null)
    prismaMock.client.upsert.mockResolvedValue({ id: 'c1', name: 'Ana', email: 'ana@test.com', phone: '+56912345678', rut: null })
    prismaMock.appointment.create.mockResolvedValue(APPOINTMENT)

    const res = await request(app).post('/api/appointments').send({ ...VALID_BODY, saveClientData: true })
    expect(res.status).toBe(201)
    expect(prismaMock.client.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { email: 'ana@test.com' },
      create: expect.objectContaining({ dataConsentGiven: true }),
      update: expect.objectContaining({ dataConsentGiven: true }),
    }))
  })

  it('does not upsert client when saveClientData=false', async () => {
    prismaMock.service.findUnique.mockResolvedValue(SERVICE)
    prismaMock.$transaction.mockImplementation(async (fn: (tx: typeof prismaMock) => Promise<unknown>) => fn(prismaMock))
    prismaMock.appointment.findFirst.mockResolvedValue(null)
    prismaMock.appointment.create.mockResolvedValue(APPOINTMENT)

    const res = await request(app).post('/api/appointments').send({ ...VALID_BODY, saveClientData: false })
    expect(res.status).toBe(201)
    expect(prismaMock.client.upsert).not.toHaveBeenCalled()
  })

  it('persists the rut on the client when saveClientData=true and rut is provided', async () => {
    prismaMock.service.findUnique.mockResolvedValue(SERVICE)
    prismaMock.$transaction.mockImplementation(async (fn: (tx: typeof prismaMock) => Promise<unknown>) => fn(prismaMock))
    prismaMock.appointment.findFirst.mockResolvedValue(null)
    prismaMock.client.upsert.mockResolvedValue({ id: 'c1', name: 'Ana', email: 'ana@test.com', phone: '+56912345678', rut: '12345678-5' })
    prismaMock.appointment.create.mockResolvedValue(APPOINTMENT)

    const res = await request(app).post('/api/appointments').send({ ...VALID_BODY, saveClientData: true, rut: '12345678-5' })
    expect(res.status).toBe(201)
    expect(prismaMock.client.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { email: 'ana@test.com' },
      create: expect.objectContaining({ rut: '12345678-5' }),
      update: expect.objectContaining({ rut: '12345678-5' }),
    }))
  })

  it('auto-confirms and marks as paid when paymentMethod is cash', async () => {
    prismaMock.service.findUnique.mockResolvedValue(SERVICE)
    prismaMock.$transaction.mockImplementation(async (fn: (tx: typeof prismaMock) => Promise<unknown>) => fn(prismaMock))
    prismaMock.appointment.findFirst.mockResolvedValue(null)
    prismaMock.appointment.create.mockResolvedValue(APPOINTMENT)

    await request(app).post('/api/appointments').send({ ...VALID_BODY, paymentMethod: 'cash' })

    expect(prismaMock.appointment.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: 'confirmed',
        paymentStatus: 'paid',
        paymentMethod: 'cash',
        paymentAmount: SERVICE.price,
      }),
    }))
  })

  it('returns 400 for invalid paymentMethod', async () => {
    const res = await request(app).post('/api/appointments').send({ ...VALID_BODY, paymentMethod: 'bitcoin' })
    expect(res.status).toBe(400)
  })

  it('stores bookingFlow=advance and paymentDeadline≈24h ahead for a future appointment', async () => {
    prismaMock.service.findUnique.mockResolvedValue(SERVICE)
    prismaMock.$transaction.mockImplementation(async (fn: (tx: typeof prismaMock) => Promise<unknown>) => fn(prismaMock))
    prismaMock.appointment.findFirst.mockResolvedValue(null)
    prismaMock.appointment.create.mockResolvedValue(APPOINTMENT)

    await request(app).post('/api/appointments').send(VALID_BODY)

    const createCall = prismaMock.appointment.create.mock.calls[0][0]
    expect(createCall.data.bookingFlow).toBe('advance')
    const deadline = createCall.data.paymentDeadline as Date
    const expected = new Date(Date.now() + 24 * 60 * 60 * 1000)
    expect(Math.abs(deadline.getTime() - expected.getTime())).toBeLessThan(5000)
  })

  it('stores bookingFlow=same_day and paymentDeadline=endDateTime for same-day appointments', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-12-15T08:00:00Z'))

    prismaMock.service.findUnique.mockResolvedValue(SERVICE)
    prismaMock.$transaction.mockImplementation(async (fn: (tx: typeof prismaMock) => Promise<unknown>) => fn(prismaMock))
    prismaMock.appointment.findFirst.mockResolvedValue(null)
    prismaMock.appointment.create.mockResolvedValue(APPOINTMENT)

    await request(app).post('/api/appointments').send(VALID_BODY)

    const createCall = prismaMock.appointment.create.mock.calls[0][0]
    expect(createCall.data.bookingFlow).toBe('same_day')
    const start = new Date('2026-12-15T14:00:00Z')
    const expectedDeadline = new Date(start.getTime() + SERVICE.duration * 60_000)
    expect(createCall.data.paymentDeadline).toEqual(expectedDeadline)
  })
})

describe('GET /api/appointments/:id', () => {
  it('returns appointment with service', async () => {
    prismaMock.appointment.findUnique.mockResolvedValue({ ...APPOINTMENT, service: SERVICE })
    const res = await request(app).get('/api/appointments/apt1')
    expect(res.status).toBe(200)
    expect(res.body.data.id).toBe('apt1')
  })

  it('returns 404 when not found', async () => {
    prismaMock.appointment.findUnique.mockResolvedValue(null)
    const res = await request(app).get('/api/appointments/bad')
    expect(res.status).toBe(404)
  })
})

describe('GET /api/appointments/:id/confirm-attendance', () => {
  const PROFESSIONAL = { id: 'pro1', name: 'Ps. Stefany Osorio' }

  it('marks attendance as confirmed and returns a thank-you page', async () => {
    prismaMock.appointment.findUnique.mockResolvedValue({ ...APPOINTMENT, attendanceConfirmed: false })
    prismaMock.professional.findUnique.mockResolvedValue(PROFESSIONAL)
    prismaMock.appointment.update.mockResolvedValue({ ...APPOINTMENT, attendanceConfirmed: true })

    const res = await request(app).get('/api/appointments/apt1/confirm-attendance')

    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toContain('text/html')
    expect(res.text).toContain('¡Gracias por confirmar!')
    expect(prismaMock.appointment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'apt1' },
        data: expect.objectContaining({ attendanceConfirmed: true, attendanceConfirmedAt: expect.any(Date) }),
      }),
    )
  })

  it('returns a not-found page when the appointment does not exist', async () => {
    prismaMock.appointment.findUnique.mockResolvedValue(null)

    const res = await request(app).get('/api/appointments/bad/confirm-attendance')

    expect(res.status).toBe(404)
    expect(res.text).toContain('Cita no encontrada')
    expect(prismaMock.appointment.update).not.toHaveBeenCalled()
  })

  it('is idempotent: shows "already confirmed" without updating again', async () => {
    prismaMock.appointment.findUnique.mockResolvedValue({ ...APPOINTMENT, attendanceConfirmed: true })
    prismaMock.professional.findUnique.mockResolvedValue(PROFESSIONAL)

    const res = await request(app).get('/api/appointments/apt1/confirm-attendance')

    expect(res.status).toBe(200)
    expect(res.text).toContain('Ya habías confirmado')
    expect(prismaMock.appointment.update).not.toHaveBeenCalled()
  })
})

describe('PATCH /api/appointments/:id/cancel', () => {
  it('cancels a pending appointment within window', async () => {
    const future = new Date(Date.now() + 48 * 60 * 60 * 1000)
    const apt = { ...APPOINTMENT, startDateTime: future, endDateTime: new Date(future.getTime() + 50 * 60_000) }
    prismaMock.appointment.findUnique.mockResolvedValue(apt)
    prismaMock.appointment.update.mockResolvedValue({ ...apt, status: 'cancelled' })

    const res = await request(app).patch('/api/appointments/apt1/cancel').send({})
    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe('cancelled')
  })

  it('rejects if within 24h', async () => {
    const soon = new Date(Date.now() + 60 * 60 * 1000)
    prismaMock.appointment.findUnique.mockResolvedValue({ ...APPOINTMENT, startDateTime: soon })
    const res = await request(app).patch('/api/appointments/apt1/cancel').send({})
    expect(res.status).toBe(400)
  })

  it('rejects if already cancelled', async () => {
    prismaMock.appointment.findUnique.mockResolvedValue({ ...APPOINTMENT, status: 'cancelled' })
    const res = await request(app).patch('/api/appointments/apt1/cancel').send({})
    expect(res.status).toBe(400)
  })
})

describe('GET /api/appointments/token/:token', () => {
  it('returns appointment data for a valid non-expired token', async () => {
    const future = new Date(Date.now() + 2 * 60 * 60 * 1000)
    const apt = {
      ...APPOINTMENT,
      status: 'pending',
      appointmentToken: 'tok_valid',
      tokenExpiresAt: future,
      service: { id: 's1', name: 'Sesión', duration: 45, price: 30000 },
    }
    prismaMock.appointment.findUnique.mockResolvedValue(apt)

    const res = await request(app).get('/api/appointments/token/tok_valid')
    expect(res.status).toBe(200)
    expect(res.body.data.isExpired).toBe(false)
    expect(res.body.data.clientName).toBe('Ana')
    expect(res.body.data.serviceId).toBe('s1')
    expect(res.body.data.duration).toBe(45)
    expect(res.body.data.price).toBe(30000)
    expect(res.body.data.modality).toBe('online')
  })

  it('returns isExpired=true when tokenExpiresAt is in the past', async () => {
    const past = new Date(Date.now() - 1000)
    const apt = {
      ...APPOINTMENT,
      appointmentToken: 'tok_expired',
      tokenExpiresAt: past,
      service: { id: 's1', name: 'Sesión', duration: 45, price: 30000 },
    }
    prismaMock.appointment.findUnique.mockResolvedValue(apt)

    const res = await request(app).get('/api/appointments/token/tok_expired')
    expect(res.status).toBe(200)
    expect(res.body.data.isExpired).toBe(true)
  })

  it('returns 404 for an invalid token', async () => {
    prismaMock.appointment.findUnique.mockResolvedValue(null)
    const res = await request(app).get('/api/appointments/token/tok_nonexistent')
    expect(res.status).toBe(404)
  })
})

describe('PATCH /api/appointments/token/:token/cancel', () => {
  it('cancels the appointment when token is valid and not expired', async () => {
    const future = new Date(Date.now() + 2 * 60 * 60 * 1000)
    const apt = {
      ...APPOINTMENT,
      status: 'pending',
      appointmentToken: 'tok_valid',
      tokenExpiresAt: future,
      service: { name: 'Sesión' },
    }
    prismaMock.appointment.findUnique.mockResolvedValue(apt)
    prismaMock.appointment.update.mockResolvedValue({ ...apt, status: 'cancelled' })
    prismaMock.professional.findUnique.mockResolvedValue({ id: 'pro1', name: 'Ps. Stefany', email: 'stefany@test.com', phone: '+56966898588', timezone: 'UTC' })

    const res = await request(app).patch('/api/appointments/token/tok_valid/cancel')
    expect(res.status).toBe(200)
    expect(res.body.data.success).toBe(true)
    expect(prismaMock.appointment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'cancelled' }) }),
    )
  })

  it('returns 410 when token is expired', async () => {
    const past = new Date(Date.now() - 1000)
    const apt = { ...APPOINTMENT, appointmentToken: 'tok_expired', tokenExpiresAt: past, service: { name: 'Sesión' } }
    prismaMock.appointment.findUnique.mockResolvedValue(apt)

    const res = await request(app).patch('/api/appointments/token/tok_expired/cancel')
    expect(res.status).toBe(410)
  })

  it('returns 404 for an invalid token', async () => {
    prismaMock.appointment.findUnique.mockResolvedValue(null)
    const res = await request(app).patch('/api/appointments/token/tok_bad/cancel')
    expect(res.status).toBe(404)
  })
})

describe('PATCH /api/appointments/token/:token/reschedule', () => {
  it('creates new appointment and cancels original when token is valid', async () => {
    const future = new Date(Date.now() + 2 * 60 * 60 * 1000)
    const apt = {
      ...APPOINTMENT,
      status: 'pending',
      appointmentToken: 'tok_valid',
      tokenExpiresAt: future,
      service: SERVICE,
    }
    prismaMock.appointment.findUnique.mockResolvedValue(apt)
    prismaMock.$transaction.mockImplementation(async (fn: (tx: typeof prismaMock) => Promise<unknown>) => fn(prismaMock))
    prismaMock.appointment.findFirst.mockResolvedValue(null)
    const newApt = { ...APPOINTMENT, id: 'apt2', appointmentToken: 'tok_new', startDateTime: new Date('2026-12-20T14:00:00Z') }
    prismaMock.appointment.create.mockResolvedValue(newApt)
    prismaMock.appointment.update.mockResolvedValue({ ...apt, status: 'cancelled' })
    prismaMock.professional.findUnique.mockResolvedValue({ id: 'pro1', name: 'Ps. Stefany', email: 'stefany@test.com', phone: '+56966898588', timezone: 'UTC' })

    const res = await request(app).patch('/api/appointments/token/tok_valid/reschedule').send({
      newStartDateTime: '2026-12-20T14:00:00Z',
    })
    expect(res.status).toBe(200)
    expect(prismaMock.appointment.create).toHaveBeenCalled()
    expect(prismaMock.appointment.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'apt1' }, data: expect.objectContaining({ status: 'cancelled' }) }),
    )
  })

  it('returns 410 when token is expired', async () => {
    const past = new Date(Date.now() - 1000)
    const apt = { ...APPOINTMENT, appointmentToken: 'tok_expired', tokenExpiresAt: past, service: SERVICE }
    prismaMock.appointment.findUnique.mockResolvedValue(apt)

    const res = await request(app).patch('/api/appointments/token/tok_expired/reschedule').send({
      newStartDateTime: '2026-12-20T14:00:00Z',
    })
    expect(res.status).toBe(410)
  })

  it('returns 409 when new slot is taken', async () => {
    const future = new Date(Date.now() + 2 * 60 * 60 * 1000)
    const apt = { ...APPOINTMENT, appointmentToken: 'tok_valid', tokenExpiresAt: future, service: SERVICE }
    prismaMock.appointment.findUnique.mockResolvedValue(apt)
    prismaMock.$transaction.mockRejectedValue(new Error('SLOT_TAKEN'))

    const res = await request(app).patch('/api/appointments/token/tok_valid/reschedule').send({
      newStartDateTime: '2026-12-20T14:00:00Z',
    })
    expect(res.status).toBe(409)
  })
})

describe('POST /api/appointments — token generation', () => {
  it('stores appointmentToken and tokenExpiresAt at 23:00 the day before', async () => {
    prismaMock.service.findUnique.mockResolvedValue(SERVICE)
    prismaMock.$transaction.mockImplementation(async (fn: (tx: typeof prismaMock) => Promise<unknown>) => fn(prismaMock))
    prismaMock.appointment.findFirst.mockResolvedValue(null)
    prismaMock.appointment.create.mockResolvedValue(APPOINTMENT)

    await request(app).post('/api/appointments').send(VALID_BODY)

    const createCall = prismaMock.appointment.create.mock.calls[0][0]
    expect(createCall.data.appointmentToken).toBeDefined()
    const expires = createCall.data.tokenExpiresAt as Date
    const start = new Date('2026-12-15T14:00:00Z')
    const dayBefore = new Date(start)
    dayBefore.setUTCDate(dayBefore.getUTCDate() - 1)
    expect(expires.getUTCDate()).toBe(dayBefore.getUTCDate())
    expect(expires.getUTCHours()).toBe(23)
    expect(expires.getUTCMinutes()).toBe(0)
  })
})

function adminToken() {
  return jwt.sign({ role: 'admin' }, process.env.JWT_SECRET ?? 'dev-secret')
}

describe('Admin routes — auth guard', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/admin/appointments')
    expect(res.status).toBe(401)
  })

  it('returns 401 with invalid token', async () => {
    const res = await request(app).get('/api/admin/appointments').set('Authorization', 'Bearer bad.token')
    expect(res.status).toBe(401)
  })

  it('passes with valid token', async () => {
    prismaMock.appointment.findMany.mockResolvedValue([])
    const res = await request(app)
      .get('/api/admin/appointments')
      .set('Authorization', `Bearer ${adminToken()}`)
    expect(res.status).toBe(200)
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'

vi.mock('../../lib/prisma.js', () => ({ prisma: prismaMock }))

const sendAppointmentConfirmationMock = vi.fn()
const sendAppointmentCancelledByPatientMock = vi.fn()

vi.mock('@schedly/notifications', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@schedly/notifications')>()
  return {
    ...actual,
    EmailService: class {
      sendAppointmentConfirmation = sendAppointmentConfirmationMock
      sendAppointmentCancelledByPatient = sendAppointmentCancelledByPatientMock
    },
  }
})

import { prismaMock, resetMocks } from '../helpers/prisma-mock.js'
import app from '../../app.js'

function token() {
  return `Bearer ${jwt.sign({ role: 'admin' }, 'dev-secret')}`
}

const APT = {
  id: 'a1', professionalId: 'pro1', serviceId: 's1',
  clientName: 'Ana', clientEmail: 'a@test.com', clientPhone: '123',
  startDateTime: new Date('2026-06-03T14:00:00Z'),
  endDateTime: new Date('2026-06-03T14:50:00Z'),
  modality: 'online', status: 'pending', paymentStatus: 'unpaid',
  paymentAmount: null, notes: null, createdAt: new Date(), updatedAt: new Date(),
  appointmentToken: 'tok_admin_test', tokenExpiresAt: new Date('2026-06-02T23:00:00Z'),
  service: { id: 's1', name: 'Sesión', price: 30000 },
}

const PROFESSIONAL = {
  id: 'pro1', name: 'Ps. Stefany Osorio', phone: '+56966898588', timezone: 'America/Santiago',
  transferRut: '12.345.678-9', transferBank: 'banco_chile', transferAccountType: 'vista',
  transferAccountNumber: '123456789', transferEmail: 'pagos@example.com',
}

beforeEach(() => {
  resetMocks()
  sendAppointmentConfirmationMock.mockReset()
  sendAppointmentCancelledByPatientMock.mockReset()
  process.env.PROFESSIONAL_ID = 'pro1'
})

describe('GET /api/admin/appointments', () => {
  it('returns appointments for today by default', async () => {
    prismaMock.appointment.findMany.mockResolvedValue([APT])
    const res = await request(app).get('/api/admin/appointments').set('Authorization', token())
    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(1)
  })

  it('filters by date', async () => {
    prismaMock.appointment.findMany.mockResolvedValue([APT])
    const res = await request(app).get('/api/admin/appointments?date=2026-06-03').set('Authorization', token())
    expect(res.status).toBe(200)
    expect(prismaMock.appointment.findMany).toHaveBeenCalled()
  })

  it('filters by status', async () => {
    prismaMock.appointment.findMany.mockResolvedValue([])
    const res = await request(app).get('/api/admin/appointments?status=confirmed').set('Authorization', token())
    expect(res.status).toBe(200)
  })

  it('rejects invalid status', async () => {
    const res = await request(app).get('/api/admin/appointments?status=unknown').set('Authorization', token())
    expect(res.status).toBe(400)
  })

  it('uses America/Santiago timezone when computing today', async () => {
    // 2026-06-06T03:00:00Z = 2026-06-05T23:00 Santiago (UTC-4) → still June 5 in Santiago
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-06T03:00:00Z'))
    prismaMock.appointment.findMany.mockResolvedValue([])
    await request(app).get('/api/admin/appointments').set('Authorization', token())

    const { where } = prismaMock.appointment.findMany.mock.calls[0][0] as { where: { startDateTime: { gte: Date } } }
    // gte should be start of June 5 in Santiago, not June 6 UTC
    expect(where.startDateTime.gte.toISOString()).toMatch(/^2026-06-05/)
    vi.useRealTimers()
  })
})

describe('GET /api/admin/appointments/weekly', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/admin/appointments/weekly?startDate=2026-06-01&endDate=2026-06-07')
    expect(res.status).toBe(401)
  })

  it('returns 400 when startDate is missing', async () => {
    const res = await request(app)
      .get('/api/admin/appointments/weekly?endDate=2026-06-07')
      .set('Authorization', token())
    expect(res.status).toBe(400)
  })

  it('returns 400 when endDate is missing', async () => {
    const res = await request(app)
      .get('/api/admin/appointments/weekly?startDate=2026-06-01')
      .set('Authorization', token())
    expect(res.status).toBe(400)
  })

  it('returns 400 when date format is invalid', async () => {
    const res = await request(app)
      .get('/api/admin/appointments/weekly?startDate=01-06-2026&endDate=2026-06-07')
      .set('Authorization', token())
    expect(res.status).toBe(400)
  })

  it('returns all dates in range as keys with empty arrays when no appointments', async () => {
    prismaMock.appointment.findMany.mockResolvedValue([])
    const res = await request(app)
      .get('/api/admin/appointments/weekly?startDate=2026-06-01&endDate=2026-06-03')
      .set('Authorization', token())
    expect(res.status).toBe(200)
    expect(res.body.data).toMatchObject({
      '2026-06-01': [],
      '2026-06-02': [],
      '2026-06-03': [],
    })
    expect(Object.keys(res.body.data)).toHaveLength(3)
  })

  it('groups appointments by date', async () => {
    const apt1 = { ...APT, id: 'a1', startDateTime: new Date('2026-06-01T09:00:00Z') }
    const apt2 = { ...APT, id: 'a2', startDateTime: new Date('2026-06-03T14:00:00Z') }
    prismaMock.appointment.findMany.mockResolvedValue([apt1, apt2])
    const res = await request(app)
      .get('/api/admin/appointments/weekly?startDate=2026-06-01&endDate=2026-06-03')
      .set('Authorization', token())
    expect(res.status).toBe(200)
    expect(res.body.data['2026-06-01']).toHaveLength(1)
    expect(res.body.data['2026-06-02']).toHaveLength(0)
    expect(res.body.data['2026-06-03']).toHaveLength(1)
  })

  it('includes cancelled appointments', async () => {
    const cancelled = { ...APT, id: 'a3', status: 'cancelled', startDateTime: new Date('2026-06-01T10:00:00Z') }
    prismaMock.appointment.findMany.mockResolvedValue([cancelled])
    const res = await request(app)
      .get('/api/admin/appointments/weekly?startDate=2026-06-01&endDate=2026-06-01')
      .set('Authorization', token())
    expect(res.status).toBe(200)
    expect(res.body.data['2026-06-01'][0].status).toBe('cancelled')
  })

  it('queries with correct date range', async () => {
    prismaMock.appointment.findMany.mockResolvedValue([])
    await request(app)
      .get('/api/admin/appointments/weekly?startDate=2026-06-01&endDate=2026-06-07')
      .set('Authorization', token())
    const call = prismaMock.appointment.findMany.mock.calls[0][0]
    expect(call.where.startDateTime.gte).toEqual(new Date('2026-06-01T00:00:00.000Z'))
    expect(call.where.startDateTime.lte).toEqual(new Date('2026-06-07T23:59:59.999Z'))
  })
})

describe('PATCH /api/admin/appointments/:id/status', () => {
  it('updates status to confirmed', async () => {
    prismaMock.appointment.findUnique.mockResolvedValue(APT)
    prismaMock.appointment.update.mockResolvedValue({ ...APT, status: 'confirmed' })
    const res = await request(app)
      .patch('/api/admin/appointments/a1/status')
      .set('Authorization', token())
      .send({ status: 'confirmed' })
    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe('confirmed')
  })

  it('returns 400 for invalid status', async () => {
    const res = await request(app)
      .patch('/api/admin/appointments/a1/status')
      .set('Authorization', token())
      .send({ status: 'invalid' })
    expect(res.status).toBe(400)
  })

  it('returns 404 when not found', async () => {
    prismaMock.appointment.findUnique.mockResolvedValue(null)
    const res = await request(app)
      .patch('/api/admin/appointments/bad/status')
      .set('Authorization', token())
      .send({ status: 'confirmed' })
    expect(res.status).toBe(404)
  })

  it('sends a cancellation email to the patient when status is set to cancelled', async () => {
    prismaMock.appointment.findUnique.mockResolvedValue(APT)
    prismaMock.appointment.update.mockResolvedValue({ ...APT, status: 'cancelled' })
    prismaMock.professional.findUnique.mockResolvedValue(PROFESSIONAL)
    sendAppointmentCancelledByPatientMock.mockResolvedValue(undefined)

    const res = await request(app)
      .patch('/api/admin/appointments/a1/status')
      .set('Authorization', token())
      .send({ status: 'cancelled' })

    expect(res.status).toBe(200)
    await vi.waitFor(() => expect(sendAppointmentCancelledByPatientMock).toHaveBeenCalledWith(
      APT.clientEmail,
      expect.objectContaining({ clientName: APT.clientName, serviceName: APT.service.name }),
    ))
  })

  it('does not send a cancellation email when status is set to confirmed', async () => {
    prismaMock.appointment.findUnique.mockResolvedValue(APT)
    prismaMock.appointment.update.mockResolvedValue({ ...APT, status: 'confirmed' })

    const res = await request(app)
      .patch('/api/admin/appointments/a1/status')
      .set('Authorization', token())
      .send({ status: 'confirmed' })

    expect(res.status).toBe(200)
    expect(sendAppointmentCancelledByPatientMock).not.toHaveBeenCalled()
  })

  it('does not fail the request when the cancellation email fails to send', async () => {
    prismaMock.appointment.findUnique.mockResolvedValue(APT)
    prismaMock.appointment.update.mockResolvedValue({ ...APT, status: 'cancelled' })
    prismaMock.professional.findUnique.mockResolvedValue(PROFESSIONAL)
    sendAppointmentCancelledByPatientMock.mockRejectedValue(new Error('Resend error'))

    const res = await request(app)
      .patch('/api/admin/appointments/a1/status')
      .set('Authorization', token())
      .send({ status: 'cancelled' })

    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe('cancelled')
  })
})

describe('PATCH /api/admin/appointments/:id/payment', () => {
  it('marks as paid', async () => {
    prismaMock.appointment.findUnique.mockResolvedValue(APT)
    prismaMock.appointment.update.mockResolvedValue({ ...APT, paymentStatus: 'paid', paymentAmount: 30000 })
    const res = await request(app)
      .patch('/api/admin/appointments/a1/payment')
      .set('Authorization', token())
      .send({ paymentStatus: 'paid', paymentAmount: 30000 })
    expect(res.status).toBe(200)
    expect(res.body.data.paymentStatus).toBe('paid')
  })

  it('returns 400 for missing amount', async () => {
    const res = await request(app)
      .patch('/api/admin/appointments/a1/payment')
      .set('Authorization', token())
      .send({ paymentStatus: 'paid' })
    expect(res.status).toBe(400)
  })

  it('saves paymentMethod when provided', async () => {
    prismaMock.appointment.findUnique.mockResolvedValue(APT)
    prismaMock.appointment.update.mockResolvedValue({ ...APT, paymentStatus: 'paid', paymentAmount: 30000, paymentMethod: 'cash' })
    const res = await request(app)
      .patch('/api/admin/appointments/a1/payment')
      .set('Authorization', token())
      .send({ paymentStatus: 'paid', paymentAmount: 30000, paymentMethod: 'cash' })
    expect(res.status).toBe(200)
    expect(res.body.data.paymentMethod).toBe('cash')
  })

  it('reverts to unpaid', async () => {
    const paid = { ...APT, paymentStatus: 'paid', paymentAmount: 30000, paymentMethod: 'transfer' }
    prismaMock.appointment.findUnique.mockResolvedValue(paid)
    prismaMock.appointment.update.mockResolvedValue({ ...paid, paymentStatus: 'unpaid', paymentAmount: null, paymentMethod: null })
    const res = await request(app)
      .patch('/api/admin/appointments/a1/payment')
      .set('Authorization', token())
      .send({ paymentStatus: 'unpaid' })
    expect(res.status).toBe(200)
    expect(res.body.data.paymentStatus).toBe('unpaid')
  })
})

describe('GET /api/admin/appointments/monthly', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/admin/appointments/monthly?year=2026&month=6')
    expect(res.status).toBe(401)
  })

  it('returns 400 when year or month is missing', async () => {
    const res = await request(app)
      .get('/api/admin/appointments/monthly?year=2026')
      .set('Authorization', token())
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid year format', async () => {
    const res = await request(app)
      .get('/api/admin/appointments/monthly?year=26&month=6')
      .set('Authorization', token())
    expect(res.status).toBe(400)
  })

  it('returns all days of month as keys with empty arrays when no appointments', async () => {
    prismaMock.appointment.findMany.mockResolvedValue([])
    const res = await request(app)
      .get('/api/admin/appointments/monthly?year=2026&month=2')
      .set('Authorization', token())
    expect(res.status).toBe(200)
    expect(Object.keys(res.body.data)).toHaveLength(28)
    expect(res.body.data['2026-02-01']).toEqual([])
    expect(res.body.data['2026-02-28']).toEqual([])
  })

  it('groups appointments by day', async () => {
    const apt1 = { ...APT, id: 'a1', startDateTime: new Date('2026-06-03T14:00:00Z') }
    const apt2 = { ...APT, id: 'a2', startDateTime: new Date('2026-06-03T16:00:00Z') }
    const apt3 = { ...APT, id: 'a3', startDateTime: new Date('2026-06-15T10:00:00Z') }
    prismaMock.appointment.findMany.mockResolvedValue([apt1, apt2, apt3])
    const res = await request(app)
      .get('/api/admin/appointments/monthly?year=2026&month=6')
      .set('Authorization', token())
    expect(res.status).toBe(200)
    expect(res.body.data['2026-06-03']).toHaveLength(2)
    expect(res.body.data['2026-06-15']).toHaveLength(1)
    expect(res.body.data['2026-06-01']).toEqual([])
  })

  it('queries correct month range', async () => {
    prismaMock.appointment.findMany.mockResolvedValue([])
    await request(app)
      .get('/api/admin/appointments/monthly?year=2026&month=6')
      .set('Authorization', token())
    const call = prismaMock.appointment.findMany.mock.calls[0][0]
    expect(call.where.startDateTime.gte).toEqual(new Date('2026-06-01T00:00:00.000Z'))
    expect(call.where.startDateTime.lte).toEqual(new Date('2026-06-30T23:59:59.999Z'))
  })
})

describe('PATCH /api/admin/appointments/:id/attendance', () => {
  it('marks as attended', async () => {
    prismaMock.appointment.findUnique.mockResolvedValue(APT)
    prismaMock.appointment.update.mockResolvedValue({ ...APT, attended: true })
    const res = await request(app)
      .patch('/api/admin/appointments/a1/attendance')
      .set('Authorization', token())
      .send({ attended: true })
    expect(res.status).toBe(200)
    expect(res.body.data.attended).toBe(true)
  })

  it('marks as not attended', async () => {
    prismaMock.appointment.findUnique.mockResolvedValue({ ...APT, attended: true })
    prismaMock.appointment.update.mockResolvedValue({ ...APT, attended: false })
    const res = await request(app)
      .patch('/api/admin/appointments/a1/attendance')
      .set('Authorization', token())
      .send({ attended: false })
    expect(res.status).toBe(200)
    expect(res.body.data.attended).toBe(false)
  })

  it('returns 400 for invalid body', async () => {
    const res = await request(app)
      .patch('/api/admin/appointments/a1/attendance')
      .set('Authorization', token())
      .send({ attended: 'yes' })
    expect(res.status).toBe(400)
  })

  it('returns 404 when not found', async () => {
    prismaMock.appointment.findUnique.mockResolvedValue(null)
    const res = await request(app)
      .patch('/api/admin/appointments/bad/attendance')
      .set('Authorization', token())
      .send({ attended: true })
    expect(res.status).toBe(404)
  })
})

describe('PATCH /api/admin/appointments/:id/notify-confirmation', () => {
  it('sends the appointment confirmation email again', async () => {
    prismaMock.appointment.findUnique.mockResolvedValue(APT)
    prismaMock.service.findUnique.mockResolvedValue(APT.service)
    prismaMock.professional.findUnique.mockResolvedValue(PROFESSIONAL)
    sendAppointmentConfirmationMock.mockResolvedValue(undefined)

    const res = await request(app)
      .patch('/api/admin/appointments/a1/notify-confirmation')
      .set('Authorization', token())
      .send({})

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(sendAppointmentConfirmationMock).toHaveBeenCalledWith(
      APT.clientEmail,
      expect.objectContaining({ clientName: APT.clientName }),
    )
  })

  it('returns 404 when the appointment does not exist', async () => {
    prismaMock.appointment.findUnique.mockResolvedValue(null)

    const res = await request(app)
      .patch('/api/admin/appointments/bad/notify-confirmation')
      .set('Authorization', token())
      .send({})

    expect(res.status).toBe(404)
    expect(sendAppointmentConfirmationMock).not.toHaveBeenCalled()
  })

  it('returns 502 when the email fails to send', async () => {
    prismaMock.appointment.findUnique.mockResolvedValue(APT)
    prismaMock.service.findUnique.mockResolvedValue(APT.service)
    prismaMock.professional.findUnique.mockResolvedValue(PROFESSIONAL)
    sendAppointmentConfirmationMock.mockRejectedValue(new Error('Resend error'))

    const res = await request(app)
      .patch('/api/admin/appointments/a1/notify-confirmation')
      .set('Authorization', token())
      .send({})

    expect(res.status).toBe(502)
  })
})

describe('PATCH /api/admin/appointments/:id/outcome', () => {
  it('updates outcome and returns the appointment', async () => {
    prismaMock.appointment.findUnique.mockResolvedValue(APT)
    prismaMock.appointment.update.mockResolvedValue({ ...APT, outcome: 'attended' })

    const res = await request(app)
      .patch('/api/admin/appointments/a1/outcome')
      .set('Authorization', token())
      .send({ outcome: 'attended' })

    expect(res.status).toBe(200)
    expect(prismaMock.appointment.update).toHaveBeenCalledWith({
      where: { id: 'a1' },
      data: { outcome: 'attended' },
    })
  })

  it('allows clearing the outcome by sending null', async () => {
    prismaMock.appointment.findUnique.mockResolvedValue({ ...APT, outcome: 'attended' })
    prismaMock.appointment.update.mockResolvedValue({ ...APT, outcome: null })

    const res = await request(app)
      .patch('/api/admin/appointments/a1/outcome')
      .set('Authorization', token())
      .send({ outcome: null })

    expect(res.status).toBe(200)
    expect(prismaMock.appointment.update).toHaveBeenCalledWith({
      where: { id: 'a1' },
      data: { outcome: null },
    })
  })

  it('returns 400 for invalid outcome values', async () => {
    const res = await request(app)
      .patch('/api/admin/appointments/a1/outcome')
      .set('Authorization', token())
      .send({ outcome: 'invalid_outcome' })

    expect(res.status).toBe(400)
  })

  it('returns 404 when appointment not found', async () => {
    prismaMock.appointment.findUnique.mockResolvedValue(null)

    const res = await request(app)
      .patch('/api/admin/appointments/bad/outcome')
      .set('Authorization', token())
      .send({ outcome: 'attended' })

    expect(res.status).toBe(404)
  })
})

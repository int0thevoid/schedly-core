import { beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'

vi.mock('../lib/prisma.js', () => ({ prisma: prismaMock }))
const sendReviewRequest = vi.fn()
vi.mock('../lib/email-service.js', () => ({ getEmailService: () => ({ sendReviewRequest }) }))

import { prismaMock, resetMocks } from './helpers/prisma-mock.js'
import app from '../app.js'
import { sendPostSessionSurveyIfEligible } from '../lib/survey.js'

function adminCookie() {
  return `auth_token=${jwt.sign({ professionalId: 'pro1', role: 'admin' }, process.env.JWT_SECRET ?? 'dev-secret')}`
}

const APPT = {
  id: 'apt1',
  status: 'confirmed',
  outcome: 'attended',
  surveyOptIn: true,
  surveySentAt: null,
  reviewToken: null,
  clientName: 'María González',
  clientEmail: 'Maria@Example.com',
  startDateTime: new Date('2026-10-20T14:00:00Z'),
  service: { name: 'Psicoterapia Adulto' },
  professional: { name: 'Ps. Stefany Osorio', timezone: 'America/Santiago' },
}

beforeEach(() => {
  resetMocks()
  sendReviewRequest.mockReset()
  sendReviewRequest.mockResolvedValue(undefined)
  prismaMock.appointment.findUnique.mockResolvedValue(APPT)
  prismaMock.surveyOptOut.findUnique.mockResolvedValue(null)
  prismaMock.appointment.findFirst.mockResolvedValue(null)
  prismaMock.appointment.findMany.mockResolvedValue([{ id: 'apt1' }])
  prismaMock.review.findFirst.mockResolvedValue(null)
  prismaMock.appointment.updateMany.mockResolvedValue({ count: 1 })
})

describe('sendPostSessionSurveyIfEligible (US-100)', () => {
  it('sends the survey about that session with review and unsubscribe links', async () => {
    expect(await sendPostSessionSurveyIfEligible('apt1')).toBe('sent')
    const [to, data] = sendReviewRequest.mock.calls[0]
    expect(to).toBe('Maria@Example.com')
    expect(data).toMatchObject({ clientName: 'María', serviceName: 'Psicoterapia Adulto', sessionDate: 'martes 20 de octubre' })
    expect(data.reviewUrl).toMatch(/\/resena\/rev_/)
    expect(data.unsubscribeUrl).toMatch(/\/encuestas\/baja\/rev_/)
    expect(prismaMock.appointment.updateMany.mock.calls[0][0].where).toEqual({ id: 'apt1', surveySentAt: null })
  })

  it('not sent without the booking check, if already sent, or if not attended', async () => {
    prismaMock.appointment.findUnique.mockResolvedValueOnce({ ...APPT, surveyOptIn: false })
    expect(await sendPostSessionSurveyIfEligible('apt1')).toBe('not_eligible')
    prismaMock.appointment.findUnique.mockResolvedValueOnce({ ...APPT, surveySentAt: new Date() })
    expect(await sendPostSessionSurveyIfEligible('apt1')).toBe('not_eligible')
    prismaMock.appointment.findUnique.mockResolvedValueOnce({ ...APPT, outcome: 'no_show' })
    expect(await sendPostSessionSurveyIfEligible('apt1')).toBe('not_eligible')
    expect(sendReviewRequest).not.toHaveBeenCalled()
  })

  it('respects the unsubscribe (case-insensitive email)', async () => {
    prismaMock.surveyOptOut.findUnique.mockResolvedValue({ email: 'maria@example.com' })
    expect(await sendPostSessionSurveyIfEligible('apt1')).toBe('opted_out')
    expect(prismaMock.surveyOptOut.findUnique).toHaveBeenCalledWith({ where: { email: 'maria@example.com' } })
    expect(sendReviewRequest).not.toHaveBeenCalled()
  })

  it('max once a month: recent survey or recent review', async () => {
    prismaMock.appointment.findFirst.mockResolvedValueOnce({ id: 'apt0' })
    expect(await sendPostSessionSurveyIfEligible('apt1')).toBe('recent')
    prismaMock.review.findFirst.mockResolvedValueOnce({ id: 'r0' })
    expect(await sendPostSessionSurveyIfEligible('apt1')).toBe('recent')
    expect(sendReviewRequest).not.toHaveBeenCalled()
  })

  it('two simultaneous marks send a single email', async () => {
    prismaMock.appointment.updateMany.mockResolvedValue({ count: 0 })
    expect(await sendPostSessionSurveyIfEligible('apt1')).toBe('not_eligible')
    expect(sendReviewRequest).not.toHaveBeenCalled()
  })

  it('if the email fails it can be retried later', async () => {
    sendReviewRequest.mockRejectedValue(new Error('resend down'))
    expect(await sendPostSessionSurveyIfEligible('apt1')).toBe('failed')
    expect(prismaMock.appointment.update).toHaveBeenCalledWith({ where: { id: 'apt1' }, data: { surveySentAt: null } })
  })
})

describe('PATCH /api/admin/appointments/:id/outcome', () => {
  it('marking "attended" triggers the survey and reports the result', async () => {
    prismaMock.appointment.findFirst.mockResolvedValueOnce({ id: 'apt1', professionalId: 'pro1' })
    prismaMock.appointment.update.mockResolvedValue({ id: 'apt1', outcome: 'attended' })
    const res = await request(app).patch('/api/admin/appointments/apt1/outcome').set('Cookie', adminCookie()).send({ outcome: 'attended' })
    expect(res.status).toBe(200)
    expect(res.body.data.survey).toBe('sent')
  })

  it('marking "no_show" does not send anything', async () => {
    prismaMock.appointment.findFirst.mockResolvedValueOnce({ id: 'apt1', professionalId: 'pro1' })
    prismaMock.appointment.update.mockResolvedValue({ id: 'apt1', outcome: 'no_show' })
    const res = await request(app).patch('/api/admin/appointments/apt1/outcome').set('Cookie', adminCookie()).send({ outcome: 'no_show' })
    expect(res.body.data.survey).toBeNull()
    expect(sendReviewRequest).not.toHaveBeenCalled()
  })
})

describe('POST /api/reviews/unsubscribe/:token', () => {
  it('stores the opt-out by lowercase email', async () => {
    prismaMock.appointment.findUnique.mockResolvedValue({ clientEmail: 'Maria@Example.com' })
    prismaMock.surveyOptOut.upsert.mockResolvedValue({})
    const res = await request(app).post('/api/reviews/unsubscribe/rev_abc')
    expect(res.status).toBe(200)
    expect(prismaMock.surveyOptOut.upsert.mock.calls[0][0].where).toEqual({ email: 'maria@example.com' })
  })

  it('404 for unknown link', async () => {
    prismaMock.appointment.findUnique.mockResolvedValue(null)
    const res = await request(app).post('/api/reviews/unsubscribe/rev_x')
    expect(res.status).toBe(404)
  })
})

describe('POST /api/appointments — survey opt-in (US-099)', () => {
  const SERVICE = { id: 'svc1', professionalId: process.env.PROFESSIONAL_ID ?? '', isActive: true, duration: 45, price: 30000 }
  const BODY = {
    serviceId: 'svc1',
    startDateTime: '2026-12-15T14:00:00Z',
    modality: 'presential',
    clientName: 'Ana',
    clientEmail: 'ana@example.com',
    clientPhone: '+56912345678',
  }

  beforeEach(() => {
    prismaMock.service.findUnique.mockResolvedValue(SERVICE)
    prismaMock.professional.findUnique.mockResolvedValue({ timezone: 'America/Santiago' })
    prismaMock.$transaction.mockImplementation(async (fn: (tx: typeof prismaMock) => Promise<unknown>) => fn(prismaMock))
    prismaMock.appointment.findFirst.mockResolvedValue(null)
    prismaMock.appointment.create.mockResolvedValue({ id: 'new' })
  })

  it('stores the check as sent', async () => {
    await request(app).post('/api/appointments').send({ ...BODY, surveyOptIn: true })
    expect(prismaMock.appointment.create.mock.calls[0][0].data.surveyOptIn).toBe(true)
  })

  it('an unsubscribed patient not recognized by the form gets no surveys even with the default check', async () => {
    prismaMock.surveyOptOut.findUnique.mockResolvedValue({ email: 'ana@example.com' })
    prismaMock.client.findUnique.mockResolvedValue({ dataConsentGiven: false })
    await request(app).post('/api/appointments').send({ ...BODY, surveyOptIn: true })
    expect(prismaMock.appointment.create.mock.calls[0][0].data.surveyOptIn).toBe(false)
    expect(prismaMock.surveyOptOut.delete).not.toHaveBeenCalled()
  })

  it('a recognized patient who re-checks it subscribes again', async () => {
    prismaMock.surveyOptOut.findUnique.mockResolvedValue({ email: 'ana@example.com' })
    prismaMock.client.findUnique.mockResolvedValue({ dataConsentGiven: true })
    await request(app).post('/api/appointments').send({ ...BODY, surveyOptIn: true })
    expect(prismaMock.appointment.create.mock.calls[0][0].data.surveyOptIn).toBe(true)
    expect(prismaMock.surveyOptOut.delete).toHaveBeenCalledWith({ where: { email: 'ana@example.com' } })
  })
})

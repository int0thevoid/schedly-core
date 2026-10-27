import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'

vi.mock('../lib/prisma.js', () => ({ prisma: prismaMock }))

import { prismaMock, resetMocks } from './helpers/prisma-mock.js'
import app from '../app.js'
import { displayNameMatches, initials } from '../lib/review-name.js'

function adminCookie() {
  return `auth_token=${jwt.sign({ professionalId: 'pro1', role: 'admin' }, process.env.JWT_SECRET ?? 'dev-secret')}`
}

const ATTENDED = {
  id: 'apt1',
  status: 'confirmed',
  outcome: 'attended',
  startDateTime: new Date('2026-10-20T14:00:00Z'),
  clientName: 'María Andrea González',
  clientEmail: 'maria@example.com',
  professionalId: 'pro1',
  service: { name: 'Psicoterapia Adulto' },
}

const VALID = { rating: 5, comment: 'Me sentí muy acompañada en la sesión.', isAnonymous: false, displayName: 'María G.' }

beforeEach(() => {
  resetMocks()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('review-name', () => {
  it('accepts parts of the real name and initials', () => {
    expect(displayNameMatches('María G.', 'María Andrea González')).toBe(true)
    expect(displayNameMatches('andrea', 'María Andrea González')).toBe(true)
    expect(displayNameMatches('M. Gonzalez', 'María Andrea González')).toBe(true)
  })

  it('flags names that do not belong to the patient', () => {
    expect(displayNameMatches('Camila R.', 'María Andrea González')).toBe(false)
    expect(displayNameMatches('M. G.', 'María Andrea González')).toBe(false)
  })

  it('builds initials', () => {
    expect(initials('Claudia Betanzo')).toBe('C.B.')
    expect(initials('  ')).toBeNull()
  })
})

describe('GET /api/reviews', () => {
  it('returns approved reviews with stats and hides the name of anonymous ones', async () => {
    prismaMock.review.findMany.mockResolvedValue([
      { id: 'r1', rating: 5, comment: 'Excelente', isAnonymous: true, displayName: 'Oculto', source: 'web' },
    ])
    prismaMock.review.aggregate.mockResolvedValue({ _avg: { rating: 4.8734 }, _count: { _all: 79 } })
    prismaMock.review.groupBy.mockResolvedValue([{ rating: 5, _count: { _all: 78 } }, { rating: 1, _count: { _all: 1 } }])

    const res = await request(app).get('/api/reviews')

    expect(res.status).toBe(200)
    expect(res.body.data.count).toBe(79)
    expect(res.body.data.average).toBe(4.9)
    expect(res.body.data.items[0].displayName).toBeNull()
    expect(prismaMock.review.findMany.mock.calls[0][0].where.status).toBe('approved')
    expect(res.body.data.distribution).toEqual({ '1': 1, '2': 0, '3': 0, '4': 0, '5': 78 })
    expect(res.body.data.filteredCount).toBe(79)
  })

  it('filters by stars without changing the overall stats', async () => {
    prismaMock.review.findMany.mockResolvedValue([])
    prismaMock.review.aggregate.mockResolvedValue({ _avg: { rating: 4.9 }, _count: { _all: 79 } })
    prismaMock.review.groupBy.mockResolvedValue([{ rating: 5, _count: { _all: 78 } }, { rating: 1, _count: { _all: 1 } }])

    const res = await request(app).get('/api/reviews?rating=1')

    expect(prismaMock.review.findMany.mock.calls[0][0].where).toMatchObject({ status: 'approved', rating: 1 })
    expect(prismaMock.review.aggregate.mock.calls[0][0].where.rating).toBeUndefined()
    expect(res.body.data).toMatchObject({ count: 79, filteredCount: 1 })
    expect((await request(app).get('/api/reviews?rating=6')).status).toBe(400)
  })
})

describe('GET /api/reviews/token/:token', () => {
  it('404 for an unknown link', async () => {
    prismaMock.appointment.findUnique.mockResolvedValue(null)
    const res = await request(app).get('/api/reviews/token/rev_x')
    expect(res.status).toBe(404)
  })

  it('cannot review a session the patient did not attend', async () => {
    prismaMock.appointment.findUnique.mockResolvedValue({ ...ATTENDED, outcome: null })
    const res = await request(app).get('/api/reviews/token/rev_x')
    expect(res.body.data).toMatchObject({ canReview: false, reason: 'not_attended', clientFirstName: 'María' })
  })

  it('can review an attended session not yet reviewed', async () => {
    prismaMock.appointment.findUnique.mockResolvedValue(ATTENDED)
    prismaMock.review.findUnique.mockResolvedValue(null)
    const res = await request(app).get('/api/reviews/token/rev_x')
    expect(res.body.data).toMatchObject({ canReview: true, reason: null, serviceName: 'Psicoterapia Adulto' })
  })
})

describe('POST /api/reviews/token/:token', () => {
  it('creates a pending review linked to the session and the patient', async () => {
    prismaMock.appointment.findUnique.mockResolvedValue(ATTENDED)
    prismaMock.review.findUnique.mockResolvedValue(null)
    prismaMock.client.findUnique.mockResolvedValue({ id: 'c1', name: 'María Andrea González' })
    prismaMock.review.create.mockResolvedValue({ id: 'r1', status: 'pending' })

    const res = await request(app).post('/api/reviews/token/rev_x').send(VALID)

    expect(res.status).toBe(201)
    const data = prismaMock.review.create.mock.calls[0][0].data
    expect(data).toMatchObject({
      appointmentId: 'apt1',
      clientId: 'c1',
      status: 'pending',
      source: 'web',
      displayName: 'María G.',
      nameMismatch: false,
      serviceName: 'Psicoterapia Adulto',
    })
  })

  it('marks the review as "pending verification" when the name differs from the real one', async () => {
    prismaMock.appointment.findUnique.mockResolvedValue(ATTENDED)
    prismaMock.review.findUnique.mockResolvedValue(null)
    prismaMock.client.findUnique.mockResolvedValue({ id: 'c1', name: 'María Andrea González' })
    prismaMock.review.create.mockResolvedValue({ id: 'r1', status: 'pending' })

    await request(app).post('/api/reviews/token/rev_x').send({ ...VALID, displayName: 'Camila Rojas' })

    expect(prismaMock.review.create.mock.calls[0][0].data.nameMismatch).toBe(true)
  })

  it('anonymous reviews store no name', async () => {
    prismaMock.appointment.findUnique.mockResolvedValue(ATTENDED)
    prismaMock.review.findUnique.mockResolvedValue(null)
    prismaMock.client.findUnique.mockResolvedValue(null)
    prismaMock.review.create.mockResolvedValue({ id: 'r1', status: 'pending' })

    await request(app).post('/api/reviews/token/rev_x').send({ ...VALID, isAnonymous: true, displayName: 'María' })

    expect(prismaMock.review.create.mock.calls[0][0].data).toMatchObject({ displayName: null, nameMismatch: false })
  })

  it('requires a name unless anonymous, and a minimum text', async () => {
    const noName = await request(app).post('/api/reviews/token/rev_x').send({ ...VALID, displayName: '' })
    expect(noName.status).toBe(400)
    const short = await request(app).post('/api/reviews/token/rev_x').send({ ...VALID, comment: 'Bien' })
    expect(short.status).toBe(400)
  })

  it('409 if the session was already reviewed', async () => {
    prismaMock.appointment.findUnique.mockResolvedValue(ATTENDED)
    prismaMock.review.findUnique.mockResolvedValue({ id: 'r0' })
    const res = await request(app).post('/api/reviews/token/rev_x').send(VALID)
    expect(res.status).toBe(409)
    expect(prismaMock.review.create).not.toHaveBeenCalled()
  })

  it('403 for a cancelled session', async () => {
    prismaMock.appointment.findUnique.mockResolvedValue({ ...ATTENDED, status: 'cancelled' })
    const res = await request(app).post('/api/reviews/token/rev_x').send(VALID)
    expect(res.status).toBe(403)
  })
})

describe('Admin reviews', () => {
  it('requires auth', async () => {
    const res = await request(app).get('/api/admin/reviews')
    expect(res.status).toBe(401)
  })

  it('lists reviews with the evaluated session and counts by status', async () => {
    prismaMock.review.findMany.mockResolvedValue([{ id: 'r1', appointmentId: 'apt1', status: 'pending' }])
    prismaMock.review.groupBy.mockResolvedValue([{ status: 'pending', _count: { _all: 1 } }, { status: 'approved', _count: { _all: 79 } }])
    prismaMock.appointment.findMany.mockResolvedValue([{ id: 'apt1', clientName: 'María Andrea González' }])

    const res = await request(app).get('/api/admin/reviews?status=pending&rating=2').set('Cookie', adminCookie())

    expect(res.status).toBe(200)
    expect(prismaMock.review.findMany.mock.calls[0][0].where).toMatchObject({ status: 'pending', rating: 2 })
    expect(res.body.data.counts).toEqual({ pending: 1, approved: 79, rejected: 0 })
    expect(res.body.data.items[0].appointment.clientName).toBe('María Andrea González')
  })

  it('approves a review', async () => {
    prismaMock.review.findFirst.mockResolvedValue({ id: 'r1' })
    prismaMock.review.update.mockResolvedValue({ id: 'r1', status: 'approved' })
    const res = await request(app).patch('/api/admin/reviews/r1/status').set('Cookie', adminCookie()).send({ status: 'approved' })
    expect(res.status).toBe(200)
    expect(prismaMock.review.update.mock.calls[0][0].data.status).toBe('approved')
    expect(prismaMock.review.update.mock.calls[0][0].data.moderatedAt).toBeInstanceOf(Date)
  })

  it('saves and clears the public reply', async () => {
    prismaMock.review.findFirst.mockResolvedValue({ id: 'r1' })
    prismaMock.review.update.mockResolvedValue({ id: 'r1' })
    await request(app).patch('/api/admin/reviews/r1/reply').set('Cookie', adminCookie()).send({ reply: '¡Gracias!' })
    expect(prismaMock.review.update.mock.calls[0][0].data).toMatchObject({ publicReply: '¡Gracias!' })
    await request(app).patch('/api/admin/reviews/r1/reply').set('Cookie', adminCookie()).send({ reply: '' })
    expect(prismaMock.review.update.mock.calls[1][0].data).toEqual({ publicReply: null, repliedAt: null })
  })

  it('review link only for attended sessions; reuses the token', async () => {
    prismaMock.appointment.findFirst.mockResolvedValueOnce({ id: 'apt1', status: 'confirmed', outcome: null, reviewToken: null })
    const notAttended = await request(app).post('/api/admin/appointments/apt1/review-link').set('Cookie', adminCookie())
    expect(notAttended.status).toBe(409)

    prismaMock.appointment.findFirst.mockResolvedValueOnce({ id: 'apt1', status: 'confirmed', outcome: 'attended', reviewToken: 'rev_abc' })
    prismaMock.review.findUnique.mockResolvedValue(null)
    const res = await request(app).post('/api/admin/appointments/apt1/review-link').set('Cookie', adminCookie())
    expect(res.status).toBe(200)
    expect(res.body.data.url).toMatch(/\/resena\/rev_abc$/)
    expect(prismaMock.appointment.update).not.toHaveBeenCalled()
  })

  it('imports Agify evaluations with initials only, discarding contact data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: 'ag1', date: '2025-04-08T12:00:00Z', evaluation: 5, comment: ' Es maravillosa ', isAnonymous: false,
          client: { name: 'Claudia', lastName: 'Betanzo', email: 'x@y.cl', phone: '+569', rut: '1-9' },
          service: { name: 'Psicoterapia Adulto' },
        },
        { id: 'ag2', date: '2025-05-01T12:00:00Z', evaluation: 5, comment: '', isAnonymous: true, client: null, service: null },
      ],
    }))
    prismaMock.review.createMany.mockResolvedValue({ count: 2 })

    const res = await request(app)
      .post('/api/admin/reviews/import/agify')
      .set('Cookie', adminCookie())
      .send({ profileId: 'b7e9f91b-55ce-4005-b727-c591833b2b19' })

    expect(res.status).toBe(200)
    expect(res.body.data).toEqual({ found: 2, imported: 2, skipped: 0 })
    const { data, skipDuplicates } = prismaMock.review.createMany.mock.calls[0][0]
    expect(skipDuplicates).toBe(true)
    expect(data[0]).toMatchObject({ source: 'agify', externalId: 'ag1', displayName: 'C.B.', comment: 'Es maravillosa', status: 'approved' })
    expect(data[1]).toMatchObject({ isAnonymous: true, displayName: null, comment: null })
    expect(JSON.stringify(data)).not.toMatch(/x@y\.cl|\+569|1-9/)
  })
})

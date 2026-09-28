import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'

vi.mock('../../lib/prisma.js', () => ({ prisma: prismaMock }))

import { prismaMock, resetMocks } from '../helpers/prisma-mock.js'
import app from '../../app.js'

const PROFESSIONAL = {
  id: 'pro1', name: 'Stefany', email: 'stefany@test.com', phone: null,
  timezone: 'America/Santiago', bookingWindowWeeks: 4,
  minAdvanceBusinessDays: 1, minAdvanceUnit: 'hours', defaultBufferMinutes: 15,
  photoUrl: null as string | null,
  createdAt: new Date(), updatedAt: new Date(),
}

beforeEach(() => {
  resetMocks()
  process.env.PROFESSIONAL_ID = 'pro1'
})

describe('GET /api/config (public)', () => {
  it('returns config without authentication', async () => {
    prismaMock.professional.findUnique.mockResolvedValue(PROFESSIONAL)
    const res = await request(app).get('/api/config')
    expect(res.status).toBe(200)
    expect(res.body.data).toMatchObject({
      bookingWindowWeeks: 4,
      minAdvanceBusinessDays: 1,
      minAdvanceUnit: 'hours',
      defaultBufferMinutes: 15,
      timezone: 'America/Santiago',
    })
  })

  it('returns 404 when professional not found', async () => {
    prismaMock.professional.findUnique.mockResolvedValue(null)
    const res = await request(app).get('/api/config')
    expect(res.status).toBe(404)
  })

  it('does not include photoUrl (the photo is served by /api/professional/photo)', async () => {
    prismaMock.professional.findUnique.mockResolvedValue({ ...PROFESSIONAL, photoUrl: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==' })
    const res = await request(app).get('/api/config')
    expect(res.status).toBe(200)
    expect(res.body.data).not.toHaveProperty('photoUrl')
  })
})

describe('GET /api/professional/photo (public)', () => {
  afterEach(() => {
    delete process.env.PROFESSIONAL_PHOTO_FALLBACK_URL
  })

  it('serves the stored photo as a binary image without authentication', async () => {
    prismaMock.professional.findUnique.mockResolvedValue({ ...PROFESSIONAL, photoUrl: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==' })
    const res = await request(app).get('/api/professional/photo')
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toBe('image/jpeg')
    expect(res.headers['cache-control']).toBe('no-cache')
    expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin')
    expect(res.headers['etag']).toBeDefined()
    expect(Buffer.from(res.body).equals(Buffer.from('/9j/4AAQSkZJRg==', 'base64'))).toBe(true)
  })

  it('returns 304 when the browser already has the current photo', async () => {
    prismaMock.professional.findUnique.mockResolvedValue({ ...PROFESSIONAL, photoUrl: 'data:image/png;base64,iVBORw0KGgo=' })
    const first = await request(app).get('/api/professional/photo')
    const second = await request(app).get('/api/professional/photo').set('If-None-Match', first.headers['etag'])
    expect(second.status).toBe(304)
  })

  it('returns 404 when there is no photo and no fallback configured', async () => {
    prismaMock.professional.findUnique.mockResolvedValue(PROFESSIONAL)
    const res = await request(app).get('/api/professional/photo')
    expect(res.status).toBe(404)
  })

  it('redirects to the fallback photo when configured and there is no photo', async () => {
    process.env.PROFESSIONAL_PHOTO_FALLBACK_URL = 'https://example.com/foto.jpg'
    prismaMock.professional.findUnique.mockResolvedValue(PROFESSIONAL)
    const res = await request(app).get('/api/professional/photo')
    expect(res.status).toBe(302)
    expect(res.headers['location']).toBe('https://example.com/foto.jpg')
  })
})

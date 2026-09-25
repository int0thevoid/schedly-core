import { beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'

vi.mock('../../lib/prisma.js', () => ({ prisma: prismaMock }))

import { prismaMock, resetMocks } from '../helpers/prisma-mock.js'
import app from '../../app.js'

function token(professionalId = 'pro1') {
  return jwt.sign({ professionalId, role: 'admin' }, 'dev-secret')
}

const DOCUMENT = {
  id: 'doc1',
  professionalId: 'pro1',
  title: 'Política de almacenamiento de datos',
  content: '<p>Contenido por defecto.</p>',
  updatedById: null,
  createdAt: new Date(),
  updatedAt: new Date(),
}

beforeEach(() => {
  resetMocks()
  process.env.PROFESSIONAL_ID = 'pro1'
})

describe('GET /api/consent-document (public)', () => {
  it('returns the saved document when one exists', async () => {
    prismaMock.consentDocument.findUnique.mockResolvedValue(DOCUMENT)
    const res = await request(app).get('/api/consent-document')
    expect(res.status).toBe(200)
    expect(res.body.data).toEqual({ title: DOCUMENT.title, content: DOCUMENT.content })
  })

  it('falls back to the default text when no document has been configured yet', async () => {
    prismaMock.consentDocument.findUnique.mockResolvedValue(null)
    const res = await request(app).get('/api/consent-document')
    expect(res.status).toBe(200)
    expect(res.body.data.title).toBe('Política de almacenamiento de datos')
    expect(res.body.data.content).toContain('Al autorizar el almacenamiento')
  })

  it('does not require authentication', async () => {
    prismaMock.consentDocument.findUnique.mockResolvedValue(DOCUMENT)
    const res = await request(app).get('/api/consent-document')
    expect(res.status).not.toBe(401)
  })
})

describe('GET /api/admin/consent-document', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/admin/consent-document')
    expect(res.status).toBe(401)
  })

  it('returns the existing document', async () => {
    prismaMock.consentDocument.upsert.mockResolvedValue(DOCUMENT)
    const res = await request(app).get('/api/admin/consent-document').set('Cookie', `auth_token=${token()}`)
    expect(res.status).toBe(200)
    expect(res.body.data.title).toBe(DOCUMENT.title)
    expect(prismaMock.consentDocument.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { professionalId: 'pro1' }, update: {} }),
    )
  })

  it('creates a default document lazily when none exists yet (atomically, via upsert)', async () => {
    prismaMock.consentDocument.upsert.mockResolvedValue(DOCUMENT)
    const res = await request(app).get('/api/admin/consent-document').set('Cookie', `auth_token=${token()}`)
    expect(res.status).toBe(200)
    expect(prismaMock.consentDocument.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ professionalId: 'pro1' }) }),
    )
  })
})

describe('PATCH /api/admin/consent-document', () => {
  it('updates title and content', async () => {
    const updated = { ...DOCUMENT, title: 'Nuevo título', content: '<p>Nuevo contenido</p>', updatedById: 'pro1' }
    prismaMock.consentDocument.upsert.mockResolvedValue(updated)

    const res = await request(app)
      .patch('/api/admin/consent-document')
      .set('Cookie', `auth_token=${token()}`)
      .send({ title: 'Nuevo título', content: '<p>Nuevo contenido</p>' })

    expect(res.status).toBe(200)
    expect(res.body.data.title).toBe('Nuevo título')
    expect(prismaMock.consentDocument.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { professionalId: 'pro1' },
        update: expect.objectContaining({ title: 'Nuevo título', updatedById: 'pro1' }),
      }),
    )
  })

  it('strips disallowed tags and attributes (XSS)', async () => {
    prismaMock.consentDocument.upsert.mockImplementation(({ update }: { update: { content: string } }) =>
      Promise.resolve({ ...DOCUMENT, content: update.content }),
    )

    const res = await request(app)
      .patch('/api/admin/consent-document')
      .set('Cookie', `auth_token=${token()}`)
      .send({ title: 'Título', content: '<p onclick="evil()">Hola</p><script>alert(1)</script><h2>Ok</h2>' })

    expect(res.status).toBe(200)
    expect(res.body.data.content).not.toContain('<script>')
    expect(res.body.data.content).not.toContain('onclick')
    expect(res.body.data.content).toContain('<h2>Ok</h2>')
  })

  it('allows heading, paragraph and list formatting', async () => {
    prismaMock.consentDocument.upsert.mockImplementation(({ update }: { update: { content: string } }) =>
      Promise.resolve({ ...DOCUMENT, content: update.content }),
    )
    const content = '<h1>Título</h1><p>Texto</p><ul><li>Uno</li><li>Dos</li></ul><ol><li>A</li></ol>'

    const res = await request(app)
      .patch('/api/admin/consent-document')
      .set('Cookie', `auth_token=${token()}`)
      .send({ title: 'Título', content })

    expect(res.status).toBe(200)
    expect(res.body.data.content).toContain('<h1>Título</h1>')
    expect(res.body.data.content).toContain('<ul>')
    expect(res.body.data.content).toContain('<li>Uno</li>')
  })

  it('returns 400 for empty title', async () => {
    const res = await request(app)
      .patch('/api/admin/consent-document')
      .set('Cookie', `auth_token=${token()}`)
      .send({ title: '', content: '<p>Contenido</p>' })
    expect(res.status).toBe(400)
  })

  it('returns 400 for empty content', async () => {
    const res = await request(app)
      .patch('/api/admin/consent-document')
      .set('Cookie', `auth_token=${token()}`)
      .send({ title: 'Título', content: '' })
    expect(res.status).toBe(400)
  })

  it('returns 401 without token', async () => {
    const res = await request(app)
      .patch('/api/admin/consent-document')
      .send({ title: 'Título', content: '<p>Contenido</p>' })
    expect(res.status).toBe(401)
  })
})

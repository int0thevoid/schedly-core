import { beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'

vi.mock('../lib/prisma.js', () => ({ prisma: prismaMock }))

import { prismaMock, resetMocks } from './helpers/prisma-mock.js'
import app from '../app.js'

function auth() {
  return `auth_token=${jwt.sign({ professionalId: 'pro1', role: 'admin' }, 'dev-secret')}`
}

const CATEGORY = { id: 'cat1', professionalId: 'pro1', name: 'Color', description: '', position: 0 }

beforeEach(() => {
  resetMocks()
  process.env.PROFESSIONAL_ID = 'pro1'
})

describe('service categories', () => {
  it('lists public categories ordered by position', async () => {
    prismaMock.serviceCategory.findMany.mockResolvedValue([CATEGORY])
    const res = await request(app).get('/api/service-categories')
    expect(res.status).toBe(200)
    expect(res.body.data).toEqual([CATEGORY])
    expect(prismaMock.serviceCategory.findMany.mock.calls[0][0].where).toEqual({ professionalId: 'pro1' })
  })

  it('requires auth for admin endpoints', async () => {
    expect((await request(app).post('/api/admin/service-categories').send({ name: 'Uñas' })).status).toBe(401)
  })

  it('creates a category at the end of the list', async () => {
    prismaMock.serviceCategory.count.mockResolvedValue(2)
    prismaMock.serviceCategory.create.mockResolvedValue({ ...CATEGORY, name: 'Uñas', position: 2 })
    const res = await request(app).post('/api/admin/service-categories').set('Cookie', auth()).send({ name: ' Uñas ' })
    expect(res.status).toBe(201)
    expect(prismaMock.serviceCategory.create.mock.calls[0][0].data).toEqual({ professionalId: 'pro1', name: 'Uñas', description: '', position: 2 })
  })

  it('rejects an empty name', async () => {
    const res = await request(app).post('/api/admin/service-categories').set('Cookie', auth()).send({ name: '  ' })
    expect(res.status).toBe(400)
  })

  it('404 when updating or deleting another professional category', async () => {
    prismaMock.serviceCategory.findFirst.mockResolvedValue(null)
    expect((await request(app).patch('/api/admin/service-categories/x').set('Cookie', auth()).send({ name: 'A' })).status).toBe(404)
    expect((await request(app).delete('/api/admin/service-categories/x').set('Cookie', auth())).status).toBe(404)
    expect(prismaMock.serviceCategory.delete).not.toHaveBeenCalled()
  })

  it('deletes a category', async () => {
    prismaMock.serviceCategory.findFirst.mockResolvedValue(CATEGORY)
    prismaMock.serviceCategory.delete.mockResolvedValue(CATEGORY)
    const res = await request(app).delete('/api/admin/service-categories/cat1').set('Cookie', auth())
    expect(res.status).toBe(200)
    expect(prismaMock.serviceCategory.delete).toHaveBeenCalledWith({ where: { id: 'cat1' } })
  })

  it('refuses to assign a service to a category of another professional', async () => {
    prismaMock.service.findFirst.mockResolvedValue({ id: 's1', professionalId: 'pro1' })
    prismaMock.serviceCategory.findFirst.mockResolvedValue(null)
    const res = await request(app).patch('/api/admin/services/s1').set('Cookie', auth()).send({ categoryId: 'foreign' })
    expect(res.status).toBe(400)
    expect(prismaMock.service.update).not.toHaveBeenCalled()
  })

  it('lets a service leave its category', async () => {
    prismaMock.service.findFirst.mockResolvedValue({ id: 's1', professionalId: 'pro1' })
    prismaMock.service.update.mockResolvedValue({ id: 's1', categoryId: null })
    const res = await request(app).patch('/api/admin/services/s1').set('Cookie', auth()).send({ categoryId: null, position: 3 })
    expect(res.status).toBe(200)
    expect(prismaMock.service.update.mock.calls[0][0].data).toEqual({ categoryId: null, position: 3 })
  })
})

describe('site content', () => {
  it('returns all blocks as a key → value map', async () => {
    prismaMock.siteContent.findMany.mockResolvedValue([
      { key: 'about', value: { title: 'Hola' } },
      { key: 'brand-partner', value: { intro: 'x' } },
    ])
    const res = await request(app).get('/api/site-content')
    expect(res.status).toBe(200)
    expect(res.body.data).toEqual({ about: { title: 'Hola' }, 'brand-partner': { intro: 'x' } })
  })

  it('upserts a block', async () => {
    prismaMock.siteContent.upsert.mockResolvedValue({ key: 'about', value: { title: 'Hola' }, updatedAt: new Date() })
    const res = await request(app).put('/api/admin/site-content/about').set('Cookie', auth()).send({ value: { title: 'Hola' } })
    expect(res.status).toBe(200)
    expect(prismaMock.siteContent.upsert.mock.calls[0][0].where).toEqual({ professionalId_key: { professionalId: 'pro1', key: 'about' } })
  })

  it('rejects invalid keys, missing values and oversized content', async () => {
    const put = (key: string, body: unknown) => request(app).put(`/api/admin/site-content/${key}`).set('Cookie', auth()).send(body as object)
    expect((await put('Bad_Key', { value: 1 })).status).toBe(400)
    expect((await put('about', {})).status).toBe(400)
    expect((await put('about', { value: 'x'.repeat(20_001) })).status).toBe(413)
    expect(prismaMock.siteContent.upsert).not.toHaveBeenCalled()
  })

  it('requires auth to edit', async () => {
    expect((await request(app).put('/api/admin/site-content/about').send({ value: 1 })).status).toBe(401)
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'

vi.mock('../lib/prisma.js', () => ({ prisma: prismaMock }))

import { prismaMock, resetMocks } from './helpers/prisma-mock.js'
import app from '../app.js'
import { slugify } from '../lib/products.js'

const PNG = 'data:image/png;base64,iVBORw0KGgo='

const PRODUCT = {
  id: 'prod1', professionalId: 'pro1', slug: 'ebook-crianza', type: 'ebook', name: 'eBook Crianza',
  summary: 'Guía breve', description: '', price: 9900, imageData: PNG, externalUrl: null, eventDate: null,
  isPublished: true, position: 0, createdAt: new Date('2026-11-01T00:00:00Z'), updatedAt: new Date('2026-11-02T00:00:00Z'),
}

function auth() {
  return `auth_token=${jwt.sign({ professionalId: 'pro1', role: 'admin' }, 'dev-secret')}`
}

beforeEach(() => {
  resetMocks()
  process.env.PROFESSIONAL_ID = 'pro1'
})

describe('slugify', () => {
  it('removes accents and symbols', () => {
    expect(slugify('Taller: Crianza Respetuosa ñandú!')).toBe('taller-crianza-respetuosa-nandu')
    expect(slugify('¡¡¡')).toBe('producto')
  })
})

describe('GET /api/products (public)', () => {
  it('lists only published products, without the image payload', async () => {
    prismaMock.product.findMany.mockResolvedValue([PRODUCT])
    const res = await request(app).get('/api/products')
    expect(res.status).toBe(200)
    expect(prismaMock.product.findMany.mock.calls[0][0].where).toEqual({ professionalId: 'pro1', isPublished: true })
    expect(res.body.data[0].imageData).toBeUndefined()
    expect(res.body.data[0].imageUrl).toBe(`/api/products/prod1/image?v=${PRODUCT.updatedAt.getTime()}`)
  })

  it('returns a published product by slug, 404 otherwise', async () => {
    prismaMock.product.findFirst.mockResolvedValueOnce(PRODUCT).mockResolvedValueOnce(null)
    expect((await request(app).get('/api/products/ebook-crianza')).body.data.name).toBe('eBook Crianza')
    expect(prismaMock.product.findFirst.mock.calls[0][0].where).toMatchObject({ slug: 'ebook-crianza', isPublished: true })
    expect((await request(app).get('/api/products/no-existe')).status).toBe(404)
  })

  it('serves the image as binary with long cache', async () => {
    prismaMock.product.findFirst.mockResolvedValue({ imageData: PNG })
    const res = await request(app).get('/api/products/prod1/image?v=1')
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toBe('image/png')
    expect(res.headers['cache-control']).toContain('immutable')
  })

  it('404 when the product has no image', async () => {
    prismaMock.product.findFirst.mockResolvedValue({ imageData: null })
    expect((await request(app).get('/api/products/prod1/image')).status).toBe(404)
  })
})

describe('admin /api/admin/products', () => {
  it('requires auth', async () => {
    expect((await request(app).get('/api/admin/products')).status).toBe(401)
  })

  it('creates a product with a unique slug at the end of the list', async () => {
    prismaMock.product.findFirst.mockResolvedValue({ position: 4 })
    prismaMock.product.findUnique.mockResolvedValueOnce({ id: 'other' }).mockResolvedValueOnce(null)
    prismaMock.product.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...PRODUCT, ...data }))
    const res = await request(app).post('/api/admin/products').set('Cookie', auth()).send({
      type: 'workshop', name: 'Taller Crianza', summary: 'Para familias', price: 0,
      externalUrl: '', eventDate: '2026-12-05T15:00:00-03:00', isPublished: true,
    })
    expect(res.status).toBe(201)
    const data = prismaMock.product.create.mock.calls[0][0].data
    expect(data).toMatchObject({ professionalId: 'pro1', slug: 'taller-crianza-2', position: 5, externalUrl: null, price: 0 })
    expect((data.eventDate as Date).toISOString()).toBe('2026-12-05T18:00:00.000Z')
  })

  it('validates type, name and link', async () => {
    const base = { type: 'ebook', name: 'X', summary: 'Y', price: 1000 }
    expect((await request(app).post('/api/admin/products').set('Cookie', auth()).send({ ...base, type: 'curso' })).status).toBe(400)
    expect((await request(app).post('/api/admin/products').set('Cookie', auth()).send({ ...base, name: ' ' })).status).toBe(400)
    expect((await request(app).post('/api/admin/products').set('Cookie', auth()).send({ ...base, externalUrl: 'http://x.cl' })).status).toBe(400)
    expect((await request(app).post('/api/admin/products').set('Cookie', auth()).send({ ...base, imageData: 'data:text/html;base64,AA==' })).status).toBe(400)
  })

  it('updates without changing the slug and 404s for foreign products', async () => {
    prismaMock.product.findFirst.mockResolvedValueOnce({ id: 'prod1' }).mockResolvedValueOnce(null)
    prismaMock.product.update.mockResolvedValue({ ...PRODUCT, name: 'Nuevo nombre' })
    const res = await request(app).patch('/api/admin/products/prod1').set('Cookie', auth()).send({ name: 'Nuevo nombre', isPublished: false })
    expect(res.status).toBe(200)
    expect(prismaMock.product.update.mock.calls[0][0].data).toEqual({ name: 'Nuevo nombre', isPublished: false })
    expect((await request(app).patch('/api/admin/products/otro').set('Cookie', auth()).send({ name: 'x' })).status).toBe(404)
  })

  it('deletes a product', async () => {
    prismaMock.product.findFirst.mockResolvedValue({ id: 'prod1' })
    prismaMock.product.delete.mockResolvedValue(PRODUCT)
    const res = await request(app).delete('/api/admin/products/prod1').set('Cookie', auth())
    expect(res.status).toBe(200)
    expect(prismaMock.product.delete).toHaveBeenCalledWith({ where: { id: 'prod1' } })
  })

  it('reorders products by the given ids', async () => {
    prismaMock.product.findMany.mockResolvedValueOnce([{ id: 'b' }, { id: 'a' }]).mockResolvedValueOnce([])
    prismaMock.product.update.mockImplementation((args: unknown) => args)
    prismaMock.$transaction.mockResolvedValue([])
    const res = await request(app).put('/api/admin/products/order').set('Cookie', auth()).send({ ids: ['b', 'a'] })
    expect(res.status).toBe(200)
    expect(prismaMock.product.update.mock.calls.map((c) => c[0])).toEqual([
      { where: { id: 'b' }, data: { position: 0 } },
      { where: { id: 'a' }, data: { position: 1 } },
    ])
  })
})

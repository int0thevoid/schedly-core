import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'

vi.mock('../../lib/prisma.js', () => ({ prisma: prismaMock }))

import { prismaMock, resetMocks } from '../helpers/prisma-mock.js'
import app from '../../app.js'

function token() {
  return jwt.sign({ professionalId: 'pro1', role: 'admin' }, 'dev-secret')
}

const PROFESSIONAL = {
  id: 'pro1',
  name: 'Stefany',
  email: 'stefany@test.com',
  phone: null,
  timezone: 'America/Santiago',
  bookingWindowWeeks: 4,
  minAdvanceBusinessDays: 2,
  defaultBufferMinutes: 0,
  transferRut: null,
  transferBank: null,
  transferAccountType: null,
  transferAccountNumber: null,
  transferEmail: null,
  createdAt: new Date(),
  updatedAt: new Date(),
}

beforeEach(() => {
  resetMocks()
  process.env.PROFESSIONAL_ID = 'pro1'
})

describe('GET /api/admin/transfer-config', () => {
  it('retorna los datos de transferencia y las listas de bancos y tipos de cuenta', async () => {
    prismaMock.professional.findUnique.mockResolvedValue(PROFESSIONAL)
    const res = await request(app)
      .get('/api/admin/transfer-config')
      .set('Cookie', `auth_token=${token()}`)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data).toHaveProperty('banks')
    expect(res.body.data).toHaveProperty('accountTypes')
    expect(Array.isArray(res.body.data.banks)).toBe(true)
    expect(res.body.data.banks.length).toBeGreaterThan(0)
    expect(res.body.data.accountTypes).toHaveLength(3)
  })

  it('retorna los campos de transferencia del profesional', async () => {
    const pro = { ...PROFESSIONAL, transferRut: '12.345.678-9', transferBank: 'estado' }
    prismaMock.professional.findUnique.mockResolvedValue(pro)
    const res = await request(app)
      .get('/api/admin/transfer-config')
      .set('Cookie', `auth_token=${token()}`)
    expect(res.status).toBe(200)
    expect(res.body.data.transferRut).toBe('12.345.678-9')
    expect(res.body.data.transferBank).toBe('estado')
  })

  it('retorna 404 si no existe el profesional', async () => {
    prismaMock.professional.findUnique.mockResolvedValue(null)
    const res = await request(app)
      .get('/api/admin/transfer-config')
      .set('Cookie', `auth_token=${token()}`)
    expect(res.status).toBe(404)
  })

  it('es accesible sin token (endpoint público)', async () => {
    prismaMock.professional.findUnique.mockResolvedValue(PROFESSIONAL)
    const res = await request(app).get('/api/admin/transfer-config')
    expect(res.status).toBe(200)
  })
})

describe('PATCH /api/admin/transfer-config', () => {
  it('actualiza los datos de transferencia', async () => {
    prismaMock.professional.findUnique.mockResolvedValue(PROFESSIONAL)
    prismaMock.professional.update.mockResolvedValue({
      ...PROFESSIONAL,
      transferRut: '12.345.678-9',
      transferBank: 'estado',
      transferAccountType: 'vista',
      transferAccountNumber: '12345678',
      transferEmail: 'stefany@banco.cl',
    })
    const res = await request(app)
      .patch('/api/admin/transfer-config')
      .set('Cookie', `auth_token=${token()}`)
      .send({
        transferRut: '12.345.678-9',
        transferBank: 'estado',
        transferAccountType: 'vista',
        transferAccountNumber: '12345678',
        transferEmail: 'stefany@banco.cl',
      })
    expect(res.status).toBe(200)
    expect(res.body.data.transferRut).toBe('12.345.678-9')
    expect(res.body.data.transferBank).toBe('estado')
    expect(res.body.data.transferAccountType).toBe('vista')
  })

  it('permite actualización parcial (solo un campo)', async () => {
    prismaMock.professional.findUnique.mockResolvedValue(PROFESSIONAL)
    prismaMock.professional.update.mockResolvedValue({ ...PROFESSIONAL, transferRut: '11.111.111-1' })
    const res = await request(app)
      .patch('/api/admin/transfer-config')
      .set('Cookie', `auth_token=${token()}`)
      .send({ transferRut: '11.111.111-1' })
    expect(res.status).toBe(200)
    expect(res.body.data.transferRut).toBe('11.111.111-1')
  })

  it('retorna 400 si el banco no es un código válido', async () => {
    const res = await request(app)
      .patch('/api/admin/transfer-config')
      .set('Cookie', `auth_token=${token()}`)
      .send({ transferBank: 'banco_invalido' })
    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
  })

  it('retorna 400 si el tipo de cuenta no es válido', async () => {
    const res = await request(app)
      .patch('/api/admin/transfer-config')
      .set('Cookie', `auth_token=${token()}`)
      .send({ transferAccountType: 'debito' })
    expect(res.status).toBe(400)
  })

  it('retorna 400 si el email no es válido', async () => {
    const res = await request(app)
      .patch('/api/admin/transfer-config')
      .set('Cookie', `auth_token=${token()}`)
      .send({ transferEmail: 'noesvalido' })
    expect(res.status).toBe(400)
  })

  it('retorna 400 con body vacío', async () => {
    const res = await request(app)
      .patch('/api/admin/transfer-config')
      .set('Cookie', `auth_token=${token()}`)
      .send({})
    expect(res.status).toBe(400)
  })

  it('retorna 404 si no existe el profesional', async () => {
    prismaMock.professional.findUnique.mockResolvedValue(null)
    const res = await request(app)
      .patch('/api/admin/transfer-config')
      .set('Cookie', `auth_token=${token()}`)
      .send({ transferRut: '12.345.678-9' })
    expect(res.status).toBe(404)
  })

  it('retorna 401 sin token', async () => {
    const res = await request(app)
      .patch('/api/admin/transfer-config')
      .send({ transferRut: '12.345.678-9' })
    expect(res.status).toBe(401)
  })
})

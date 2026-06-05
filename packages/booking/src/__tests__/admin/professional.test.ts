import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcrypt'

vi.mock('../../lib/prisma.js', () => ({ prisma: prismaMock }))

import { prismaMock, resetMocks } from '../helpers/prisma-mock.js'
import app from '../../app.js'

function token() {
  return `Bearer ${jwt.sign({ role: 'admin' }, 'dev-secret')}`
}

const PROFESSIONAL = {
  id: 'pro1',
  name: 'Stefany Osorio',
  email: 'stefany@test.com',
  phone: '+56966898588',
  passwordHash: null as string | null,
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

beforeEach(async () => {
  resetMocks()
  process.env.PROFESSIONAL_ID = 'pro1'
  PROFESSIONAL.passwordHash = await bcrypt.hash('password123', 10)
})

// ── PATCH /api/admin/professional ─────────────────────────────────────────────

describe('PATCH /api/admin/professional', () => {
  it('actualiza el nombre del profesional', async () => {
    prismaMock.professional.findUnique.mockResolvedValue(PROFESSIONAL)
    prismaMock.professional.update.mockResolvedValue({ ...PROFESSIONAL, name: 'Stefany O. Alfaro' })

    const res = await request(app)
      .patch('/api/admin/professional')
      .set('Authorization', token())
      .send({ name: 'Stefany O. Alfaro' })

    expect(res.status).toBe(200)
    expect(res.body.data.name).toBe('Stefany O. Alfaro')
    expect(prismaMock.professional.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ name: 'Stefany O. Alfaro' }) }),
    )
  })

  it('actualiza el teléfono', async () => {
    prismaMock.professional.findUnique.mockResolvedValue(PROFESSIONAL)
    prismaMock.professional.update.mockResolvedValue({ ...PROFESSIONAL, phone: '+56999999999' })

    const res = await request(app)
      .patch('/api/admin/professional')
      .set('Authorization', token())
      .send({ phone: '+56999999999' })

    expect(res.status).toBe(200)
    expect(res.body.data.phone).toBe('+56999999999')
  })

  it('retorna 400 si el body está vacío', async () => {
    const res = await request(app)
      .patch('/api/admin/professional')
      .set('Authorization', token())
      .send({})
    expect(res.status).toBe(400)
  })

  it('retorna 400 si el nombre es string vacío', async () => {
    const res = await request(app)
      .patch('/api/admin/professional')
      .set('Authorization', token())
      .send({ name: '' })
    expect(res.status).toBe(400)
  })

  it('retorna 404 si no existe el profesional', async () => {
    prismaMock.professional.findUnique.mockResolvedValue(null)
    const res = await request(app)
      .patch('/api/admin/professional')
      .set('Authorization', token())
      .send({ name: 'Nuevo Nombre' })
    expect(res.status).toBe(404)
  })

  it('retorna 401 sin token', async () => {
    const res = await request(app)
      .patch('/api/admin/professional')
      .send({ name: 'Nuevo Nombre' })
    expect(res.status).toBe(401)
  })
})

// ── POST /api/admin/professional/change-password ─────────────────────────────

describe('POST /api/admin/professional/change-password', () => {
  it('cambia la contraseña correctamente', async () => {
    prismaMock.professional.findUnique.mockResolvedValue(PROFESSIONAL)
    prismaMock.professional.update.mockResolvedValue(PROFESSIONAL)

    const res = await request(app)
      .post('/api/admin/professional/change-password')
      .set('Authorization', token())
      .send({ currentPassword: 'password123', newPassword: 'newPassword456' })

    expect(res.status).toBe(200)
    expect(res.body.data.message).toBe('Contraseña actualizada')
    expect(prismaMock.professional.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ passwordHash: expect.any(String) }) }),
    )
  })

  it('retorna 401 si la contraseña actual es incorrecta', async () => {
    prismaMock.professional.findUnique.mockResolvedValue(PROFESSIONAL)

    const res = await request(app)
      .post('/api/admin/professional/change-password')
      .set('Authorization', token())
      .send({ currentPassword: 'wrongPassword', newPassword: 'newPassword456' })

    expect(res.status).toBe(401)
    expect(res.body.success).toBe(false)
  })

  it('retorna 400 si la nueva contraseña tiene menos de 8 caracteres', async () => {
    const res = await request(app)
      .post('/api/admin/professional/change-password')
      .set('Authorization', token())
      .send({ currentPassword: 'password123', newPassword: 'short' })
    expect(res.status).toBe(400)
  })

  it('retorna 400 si falta currentPassword', async () => {
    const res = await request(app)
      .post('/api/admin/professional/change-password')
      .set('Authorization', token())
      .send({ newPassword: 'newPassword456' })
    expect(res.status).toBe(400)
  })

  it('retorna 404 si no existe el profesional', async () => {
    prismaMock.professional.findUnique.mockResolvedValue(null)
    const res = await request(app)
      .post('/api/admin/professional/change-password')
      .set('Authorization', token())
      .send({ currentPassword: 'password123', newPassword: 'newPassword456' })
    expect(res.status).toBe(404)
  })

  it('retorna 401 sin token', async () => {
    const res = await request(app)
      .post('/api/admin/professional/change-password')
      .send({ currentPassword: 'password123', newPassword: 'newPassword456' })
    expect(res.status).toBe(401)
  })

  it('retorna 401 si no tiene passwordHash configurado', async () => {
    prismaMock.professional.findUnique.mockResolvedValue({ ...PROFESSIONAL, passwordHash: null })

    const res = await request(app)
      .post('/api/admin/professional/change-password')
      .set('Authorization', token())
      .send({ currentPassword: 'password123', newPassword: 'newPassword456' })

    expect(res.status).toBe(401)
  })
})

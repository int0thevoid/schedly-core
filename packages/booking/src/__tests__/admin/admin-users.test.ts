import { beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcrypt'

vi.mock('../../lib/prisma.js', () => ({ prisma: prismaMock }))

import { prismaMock, resetMocks } from '../helpers/prisma-mock.js'
import app from '../../app.js'

const PASSWORD = 'clave-de-prueba'
const ADMIN_USER = {
  id: 'adm1', professionalId: 'pro1', email: 'juan@example.com', name: 'Juan',
  passwordHash: bcrypt.hashSync(PASSWORD, 10), createdAt: new Date(), updatedAt: new Date(),
}

function cookieOf(res: request.Response): string {
  const raw = res.headers['set-cookie'] as unknown as string[]
  return raw[0].split(';')[0]
}

beforeEach(() => {
  resetMocks()
  process.env.PROFESSIONAL_ID = 'pro1'
})

describe('Cuentas adicionales del panel (AdminUser)', () => {
  it('login with an admin user gives a session on the same professional', async () => {
    prismaMock.professional.findUnique.mockResolvedValue(null)
    prismaMock.adminUser.findUnique.mockResolvedValue(ADMIN_USER)
    const res = await request(app).post('/api/auth/login').send({ email: 'Juan@Example.com', password: PASSWORD })
    expect(res.status).toBe(200)
    expect(prismaMock.adminUser.findUnique).toHaveBeenCalledWith({ where: { email: 'juan@example.com' } })
    const token = cookieOf(res).split('=')[1]
    expect(jwt.verify(token, 'dev-secret')).toMatchObject({ professionalId: 'pro1', adminUserId: 'adm1', role: 'admin' })
  })

  it('wrong password → 401 with the same message', async () => {
    prismaMock.professional.findUnique.mockResolvedValue(null)
    prismaMock.adminUser.findUnique.mockResolvedValue(ADMIN_USER)
    const res = await request(app).post('/api/auth/login').send({ email: 'juan@example.com', password: 'otra' })
    expect(res.status).toBe(401)
    expect(res.body.error).toBe('Credenciales incorrectas')
  })

  it('the admin user can use the panel', async () => {
    prismaMock.service.findMany.mockResolvedValue([])
    const token = jwt.sign({ professionalId: 'pro1', role: 'admin', adminUserId: 'adm1' }, 'dev-secret')
    const res = await request(app).get('/api/admin/services').set('Cookie', `auth_token=${token}`)
    expect(res.status).toBe(200)
  })

  it('change-password changes the admin user password, not the professional one', async () => {
    prismaMock.adminUser.findUnique.mockResolvedValue(ADMIN_USER)
    prismaMock.adminUser.update.mockResolvedValue(ADMIN_USER)
    const token = jwt.sign({ professionalId: 'pro1', role: 'admin', adminUserId: 'adm1' }, 'dev-secret')
    const res = await request(app)
      .post('/api/admin/professional/change-password')
      .set('Cookie', `auth_token=${token}`)
      .send({ currentPassword: PASSWORD, newPassword: 'nueva-clave-123' })
    expect(res.status).toBe(200)
    expect(prismaMock.adminUser.update.mock.calls[0][0].where).toEqual({ id: 'adm1' })
    expect(prismaMock.professional.update).not.toHaveBeenCalled()
  })

  it('change-password rejects a wrong current password', async () => {
    prismaMock.adminUser.findUnique.mockResolvedValue(ADMIN_USER)
    const token = jwt.sign({ professionalId: 'pro1', role: 'admin', adminUserId: 'adm1' }, 'dev-secret')
    const res = await request(app)
      .post('/api/admin/professional/change-password')
      .set('Cookie', `auth_token=${token}`)
      .send({ currentPassword: 'mala', newPassword: 'nueva-clave-123' })
    expect(res.status).toBe(401)
  })
})

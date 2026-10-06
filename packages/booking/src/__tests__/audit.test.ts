import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcrypt'

vi.mock('../lib/prisma.js', () => ({ prisma: prismaMock }))

import { prismaMock, resetMocks } from './helpers/prisma-mock.js'
import app from '../app.js'
import type { PrismaClient } from '../generated/prisma/index.js'
import { diff, purgeOldAuditLogs, registerAuditClient, snapshot, withAudit } from '../lib/audit.js'
import { actorTypeForPath, runWithAuditContext, sanitizeSource, setAuditAdmin } from '../lib/audit-context.js'

type Hook = (params: {
  model: string
  operation: string
  args: Record<string, unknown>
  query: (args: Record<string, unknown>) => Promise<unknown>
}) => Promise<unknown>

/** Cliente Prisma falso: captura el hook de withAudit y las escrituras en auditLog. */
function fakeBase(existing: Record<string, unknown> | null = null) {
  let hook: Hook | undefined
  const auditCreate = vi.fn().mockResolvedValue({})
  const findUnique = vi.fn().mockResolvedValue(existing)
  const base = {
    auditLog: { create: auditCreate, deleteMany: vi.fn().mockResolvedValue({ count: 3 }) },
    appointment: { findUnique },
    $extends(ext: { query: { $allModels: { $allOperations: Hook } } }) {
      hook = ext.query.$allModels.$allOperations
      return base
    },
  }
  withAudit(base as unknown as PrismaClient)
  return { base, auditCreate, findUnique, run: (params: Parameters<Hook>[0]) => hook!(params) }
}

const ADMIN_CONTEXT = { actorType: 'admin' as const, actorId: 'pro1', professionalId: 'pro1', source: 'PATCH /api/admin/appointments/a1/status' }

describe('snapshot y diff', () => {
  it('oculta contraseñas, hashes y tokens, y resume textos largos', () => {
    const s = snapshot({
      id: 'c1',
      passwordHash: 'abc',
      appointmentToken: 'tok',
      photoUrl: 'x'.repeat(5000),
      startDateTime: new Date('2026-10-05T17:00:00Z'),
      updatedAt: new Date(),
      service: { name: 'no se guarda' },
    })
    expect(s).toEqual({
      id: 'c1',
      passwordHash: '[redactado]',
      appointmentToken: '[redactado]',
      photoUrl: '[texto de 5000 caracteres]',
      startDateTime: '2026-10-05T17:00:00.000Z',
    })
  })

  it('devuelve solo los campos que cambiaron, ignorando updatedAt', () => {
    expect(
      diff(
        { id: 'a1', status: 'pending', paymentStatus: 'unpaid', updatedAt: new Date(1) },
        { id: 'a1', status: 'cancelled', paymentStatus: 'unpaid', updatedAt: new Date(2) },
      ),
    ).toEqual({ status: { from: 'pending', to: 'cancelled' } })
  })
})

describe('audit-context', () => {
  it('reemplaza tokens de la URL y quita la query string', () => {
    expect(sanitizeSource('POST', '/api/appointments/abcdefghijklmnopqrstuvwxyz0123/reschedule?x=1'))
      .toBe('POST /api/appointments/:token/reschedule')
  })

  it('el sitio público se atribuye a pacientes y lo demás es anónimo hasta autenticar', () => {
    expect(actorTypeForPath('/api/appointments')).toBe('patient')
    expect(actorTypeForPath('/api/clients/lookup')).toBe('patient')
    expect(actorTypeForPath('/api/admin/appointments')).toBe('anonymous')
  })

  it('setAuditAdmin marca la petición en curso como de la administradora', () => {
    const context = { actorType: 'anonymous' as const }
    runWithAuditContext(context, () => setAuditAdmin('pro1'))
    expect(context).toMatchObject({ actorType: 'admin', actorId: 'pro1', professionalId: 'pro1' })
  })
})

describe('withAudit', () => {
  it('registra una modificación con actor, antes/después y origen', async () => {
    const { run, auditCreate } = fakeBase({ id: 'a1', professionalId: 'pro1', status: 'pending' })
    await runWithAuditContext({ ...ADMIN_CONTEXT }, () =>
      run({
        model: 'Appointment',
        operation: 'update',
        args: { where: { id: 'a1' }, data: { status: 'cancelled' } },
        query: async () => ({ id: 'a1', professionalId: 'pro1', status: 'cancelled' }),
      }),
    )
    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorType: 'admin',
        actorId: 'pro1',
        professionalId: 'pro1',
        action: 'update',
        entity: 'Appointment',
        entityId: 'a1',
        changes: { status: { from: 'pending', to: 'cancelled' } },
        source: 'PATCH /api/admin/appointments/a1/status',
      }),
    })
  })

  it('registra una creación con snapshot y sin consultar el estado anterior', async () => {
    const { run, auditCreate, findUnique } = fakeBase()
    await runWithAuditContext({ actorType: 'patient', source: 'POST /api/appointments' }, () =>
      run({
        model: 'Appointment',
        operation: 'create',
        args: { data: {} },
        query: async () => ({ id: 'a2', professionalId: 'pro1', status: 'pending', appointmentToken: 'secreto' }),
      }),
    )
    expect(findUnique).not.toHaveBeenCalled()
    const data = auditCreate.mock.calls[0][0].data
    expect(data).toMatchObject({ actorType: 'patient', action: 'create', entityId: 'a2' })
    expect(data.changes).toMatchObject({ status: 'pending', appointmentToken: '[redactado]' })
  })

  it('una eliminación guarda el registro borrado', async () => {
    const { run, auditCreate } = fakeBase({ id: 'b1', professionalId: 'pro1', title: 'Vacaciones' })
    await run({ model: 'Appointment', operation: 'delete', args: { where: { id: 'b1' } }, query: async () => ({ id: 'b1' }) })
    expect(auditCreate.mock.calls[0][0].data).toMatchObject({
      actorType: 'system',
      action: 'delete',
      entityId: 'b1',
      changes: { id: 'b1', title: 'Vacaciones' },
    })
  })

  it('no registra modificaciones que no cambian nada, ni lecturas, ni el propio historial', async () => {
    const { run, auditCreate } = fakeBase({ id: 'a1', status: 'pending' })
    await run({ model: 'Appointment', operation: 'update', args: { where: { id: 'a1' } }, query: async () => ({ id: 'a1', status: 'pending' }) })
    await run({ model: 'Appointment', operation: 'findMany', args: {}, query: async () => [] })
    await run({ model: 'AuditLog', operation: 'create', args: {}, query: async () => ({}) })
    expect(auditCreate).not.toHaveBeenCalled()
  })

  it('si falla la escritura del historial, la operación original igual se completa', async () => {
    const { run, auditCreate } = fakeBase()
    auditCreate.mockRejectedValue(new Error('db down'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await run({ model: 'Client', operation: 'create', args: {}, query: async () => ({ id: 'c1' }) })
    expect(result).toEqual({ id: 'c1' })
  })

  it('el borrado por antigüedad elimina lo anterior a 2 años', async () => {
    const { base } = fakeBase()
    const count = await purgeOldAuditLogs(base as unknown as PrismaClient, new Date('2026-10-05T00:00:00Z'))
    expect(count).toBe(3)
    expect(base.auditLog.deleteMany).toHaveBeenCalledWith({ where: { createdAt: { lt: new Date('2024-10-05T00:00:00Z') } } })
  })
})

describe('eventos de login', () => {
  const PASSWORD = 'secreta123'
  let events: ReturnType<typeof vi.fn>

  beforeEach(() => {
    resetMocks()
    events = vi.fn().mockResolvedValue({})
    registerAuditClient({ auditLog: { create: events } } as unknown as PrismaClient)
  })

  it('registra el login fallido sin guardar la contraseña', async () => {
    prismaMock.professional.findUnique.mockResolvedValue({ id: 'pro1', email: 's@test.cl', passwordHash: bcrypt.hashSync(PASSWORD, 4) })
    await request(app).post('/api/auth/login').send({ email: 's@test.cl', password: 'mala' })
    const data = events.mock.calls[0][0].data
    expect(data).toMatchObject({ action: 'login_failed', entity: 'Auth', entityId: 'pro1', changes: { email: 's@test.cl' } })
    expect(JSON.stringify(data)).not.toContain('mala')
  })

  it('registra el login exitoso como acción de la administradora', async () => {
    prismaMock.professional.findUnique.mockResolvedValue({ id: 'pro1', email: 's@test.cl', passwordHash: bcrypt.hashSync(PASSWORD, 4) })
    await request(app).post('/api/auth/login').send({ email: 's@test.cl', password: PASSWORD })
    expect(events.mock.calls[0][0].data).toMatchObject({ action: 'login_succeeded', actorType: 'admin', actorId: 'pro1' })
  })
})

describe('API de historial', () => {
  function token() {
    return jwt.sign({ professionalId: 'pro1', role: 'admin' }, 'dev-secret')
  }

  beforeEach(() => {
    resetMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('requiere sesión de administradora', async () => {
    const res = await request(app).get('/api/admin/audit/appointments/a1')
    expect(res.status).toBe(401)
  })

  it('no muestra el historial de citas de otro profesional', async () => {
    prismaMock.appointment.findFirst.mockResolvedValue(null)
    const res = await request(app).get('/api/admin/audit/appointments/a1').set('Cookie', `auth_token=${token()}`)
    expect(res.status).toBe(404)
    expect(prismaMock.appointment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'a1', professionalId: 'pro1' } }),
    )
  })

  it('devuelve el historial de una cita, lo más reciente primero', async () => {
    prismaMock.appointment.findFirst.mockResolvedValue({ id: 'a1' })
    prismaMock.auditLog.findMany.mockResolvedValue([{ id: 'l1', action: 'rescheduled' }])
    const res = await request(app).get('/api/admin/audit/appointments/a1').set('Cookie', `auth_token=${token()}`)
    expect(res.status).toBe(200)
    expect(res.body.data).toEqual([{ id: 'l1', action: 'rescheduled' }])
    expect(prismaMock.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { entity: 'Appointment', entityId: 'a1' }, orderBy: { createdAt: 'desc' } }),
    )
  })

  it('el historial de un paciente incluye su ficha y sus citas con este profesional', async () => {
    prismaMock.client.findUnique.mockResolvedValue({ email: 'ana@test.cl' })
    prismaMock.appointment.findMany.mockResolvedValue([{ id: 'a1' }, { id: 'a2' }])
    prismaMock.auditLog.findMany.mockResolvedValue([])
    const res = await request(app).get('/api/admin/audit/clients/c1').set('Cookie', `auth_token=${token()}`)
    expect(res.status).toBe(200)
    expect(prismaMock.appointment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { clientEmail: 'ana@test.cl', professionalId: 'pro1' } }),
    )
    expect(prismaMock.auditLog.findMany.mock.calls[0][0].where).toEqual({
      OR: [
        { entity: 'Client', entityId: 'c1' },
        { entity: 'Appointment', entityId: { in: ['a1', 'a2'] } },
      ],
    })
  })
})

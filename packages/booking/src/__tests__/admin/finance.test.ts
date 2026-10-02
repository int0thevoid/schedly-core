import { beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'

vi.mock('../../lib/prisma.js', () => ({ prisma: prismaMock }))

import { prismaMock, resetMocks } from '../helpers/prisma-mock.js'
import app from '../../app.js'
import { summarizeFinance, type FinanceAppointment } from '../../lib/finance-summary.js'

function token() {
  return jwt.sign({ professionalId: 'pro1', role: 'admin' }, 'dev-secret')
}

const TERAPIA = { id: 's1', name: 'Terapia individual', price: 35000 }
const PAREJA = { id: 's2', name: 'Terapia de pareja', price: 42000 }
const NOW = new Date('2026-10-15T15:00:00Z')

function appt(id: string, start: string, overrides: Partial<FinanceAppointment> = {}): FinanceAppointment {
  return {
    id,
    clientName: `Paciente ${id}`,
    startDateTime: new Date(start),
    paymentStatus: 'unpaid',
    paymentAmount: null,
    paymentMethod: null,
    outcome: null,
    service: TERAPIA,
    ...overrides,
  }
}

const MONTH: FinanceAppointment[] = [
  appt('transfer', '2026-10-01T13:00:00Z', { paymentStatus: 'paid', paymentAmount: 30000, paymentMethod: 'transfer' }),
  appt('cash', '2026-10-02T13:00:00Z', { paymentStatus: 'paid', paymentAmount: 42000, paymentMethod: 'cash', service: PAREJA }),
  appt('legacy', '2026-10-03T13:00:00Z', { paymentStatus: 'paid', paymentAmount: 35000 }),
  appt('gift', '2026-10-05T13:00:00Z', { paymentStatus: 'paid', paymentAmount: 35000, paymentMethod: 'gift' }),
  appt('debt', '2026-10-08T13:00:00Z'),
  appt('noshow', '2026-10-09T13:00:00Z', { outcome: 'no_show', service: PAREJA }),
  appt('future', '2026-10-20T13:00:00Z'),
  appt('prepaid', '2026-10-21T13:00:00Z', { paymentStatus: 'paid', paymentAmount: 35000, paymentMethod: 'transfer' }),
]

describe('summarizeFinance', () => {
  const s = summarizeFinance(MONTH, NOW)

  it('cobrado suma pagos del mes (incluye prepagos de citas futuras) y excluye regalías', () => {
    expect(s.collected).toEqual({ amount: 142000, count: 4 })
    expect(s.gifts).toEqual({ amount: 35000, count: 1 })
  })

  it('separa por cobrar, inasistencias sin pago y proyectado, al precio del servicio', () => {
    expect(s.outstanding).toEqual({ amount: 35000, count: 1 })
    expect(s.noShowUnpaid).toEqual({ amount: 42000, count: 1 })
    expect(s.projected).toEqual({ amount: 35000, count: 1 })
  })

  it('desglosa por método; pagos antiguos sin método van a "unspecified"', () => {
    expect(s.byMethod).toEqual({
      transfer: { amount: 65000, count: 2 },
      cash: { amount: 42000, count: 1 },
      unspecified: { amount: 35000, count: 1 },
    })
  })

  it('el desglose por servicio cuadra con el total cobrado', () => {
    expect(s.byService.reduce((sum, x) => sum + x.collected, 0)).toBe(s.collected.amount)
    expect(s.byService).toEqual([
      { serviceId: 's1', serviceName: 'Terapia individual', appointments: 6, collected: 100000, pending: 70000 },
      { serviceId: 's2', serviceName: 'Terapia de pareja', appointments: 2, collected: 42000, pending: 42000 },
    ])
  })

  it('lista pagos pendientes vencidos (sin futuros), ordenados y marcando inasistencias', () => {
    expect(s.pendingPayments.map((p) => [p.id, p.amount, p.noShow])).toEqual([
      ['debt', 35000, false],
      ['noshow', 42000, true],
    ])
  })

  it('mes sin citas devuelve todo en cero', () => {
    const empty = summarizeFinance([], NOW)
    expect(empty.collected).toEqual({ amount: 0, count: 0 })
    expect(empty.byService).toEqual([])
    expect(empty.pendingPayments).toEqual([])
  })
})

describe('GET /api/admin/finance/summary', () => {
  beforeEach(() => {
    resetMocks()
    process.env.PROFESSIONAL_ID = 'pro1'
  })

  it('requiere autenticación', async () => {
    const res = await request(app).get('/api/admin/finance/summary?year=2026&month=10')
    expect(res.status).toBe(401)
  })

  it('valida el mes', async () => {
    const res = await request(app).get('/api/admin/finance/summary?year=2026&month=13').set('Cookie', `auth_token=${token()}`)
    expect(res.status).toBe(400)
  })

  it('consulta el mes pedido y el anterior, del profesional del token y sin canceladas', async () => {
    prismaMock.appointment.findMany.mockResolvedValueOnce(MONTH).mockResolvedValueOnce([
      appt('sept', '2026-09-10T13:00:00Z', { paymentStatus: 'paid', paymentAmount: 30000, paymentMethod: 'cash' }),
    ])
    const res = await request(app).get('/api/admin/finance/summary?year=2026&month=10').set('Cookie', `auth_token=${token()}`)
    expect(res.status).toBe(200)
    expect(res.body.data.year).toBe(2026)
    expect(res.body.data.month).toBe(10)
    expect(res.body.data.collected).toEqual({ amount: 142000, count: 4 })
    expect(res.body.data.previousMonth).toEqual({ year: 2026, month: 9, collected: { amount: 30000, count: 1 } })

    const [current, previous] = prismaMock.appointment.findMany.mock.calls.map((c) => c[0].where)
    expect(current.professionalId).toBe('pro1')
    expect(current.status).toEqual({ not: 'cancelled' })
    // Octubre en Santiago (UTC-3): 01-10 00:00 → 31-10 23:59:59.999
    expect(current.startDateTime.gte.toISOString()).toBe('2026-10-01T03:00:00.000Z')
    expect(current.startDateTime.lte.toISOString()).toBe('2026-11-01T02:59:59.999Z')
    // 01-09 Chile aún está en horario de invierno (UTC-4)
    expect(previous.startDateTime.gte.toISOString()).toBe('2026-09-01T04:00:00.000Z')
  })

  it('enero compara contra diciembre del año anterior', async () => {
    prismaMock.appointment.findMany.mockResolvedValue([])
    const res = await request(app).get('/api/admin/finance/summary?year=2027&month=1').set('Cookie', `auth_token=${token()}`)
    expect(res.status).toBe(200)
    expect(res.body.data.previousMonth).toMatchObject({ year: 2026, month: 12 })
  })
})

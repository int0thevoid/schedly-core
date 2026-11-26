import { beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'

vi.mock('../lib/prisma.js', () => ({ prisma: prismaMock }))
vi.mock('../lib/email-service.js', () => ({ getEmailService: () => emailMock }))

const emailMock = {
  sendEventRegistrationReceived: vi.fn().mockResolvedValue(undefined),
  sendEventRegistrationToProfessional: vi.fn().mockResolvedValue(undefined),
  sendEventRegistrationStatus: vi.fn().mockResolvedValue(undefined),
}

import { prismaMock, resetMocks } from './helpers/prisma-mock.js'
import app from '../app.js'
import {
  eventPublishProblems,
  occupiesSeat,
  parseEventConfig,
  publicAvailability,
  publicEventConfig,
  registrationAvailability,
  statusFromPayments,
  validateAnswers,
  visibleFields,
  type EventField,
} from '../lib/events.js'
import { buildExportTable } from '../controllers/admin/events.controller.js'
import { toCsv, toXlsx } from '../lib/spreadsheet.js'

const NOW = new Date('2026-12-01T12:00:00Z')

function field(partial: Partial<EventField> & Pick<EventField, 'id' | 'type'>): EventField {
  return {
    label: partial.id,
    help: '',
    required: false,
    options: [],
    min: null,
    max: null,
    rangeMessage: '',
    role: null,
    category: 'general',
    showIf: null,
    ...partial,
  }
}

const FIELDS: EventField[] = [
  field({ id: 'nombre', type: 'short_text', required: true, role: 'name' }),
  field({ id: 'correo', type: 'email', required: true, role: 'email' }),
  field({ id: 'edad', type: 'number', required: true, min: 18, rangeMessage: 'Debes tener 18 años o más' }),
  field({ id: 'dieta', type: 'single_choice', options: ['Normal', 'Otra'], category: 'logistics' }),
  field({ id: 'dieta_otra', type: 'short_text', required: true, category: 'logistics', showIf: { fieldId: 'dieta', values: ['Otra'] } }),
  field({ id: 'salud', type: 'section' }),
  field({ id: 'tiene_condicion', type: 'yes_no', category: 'sensitive' }),
  field({ id: 'condicion', type: 'long_text', required: true, category: 'sensitive', showIf: { fieldId: 'tiene_condicion', values: ['yes'] } }),
]

const CONFIG = parseEventConfig({
  startsAt: '2027-01-22T15:00:00-03:00',
  endsAt: '2027-01-24T13:00:00-03:00',
  capacity: 2,
  holdHours: 24,
  registrationClosesAt: '2027-01-17T23:59:00-03:00',
  fields: FIELDS,
  consents: [{ id: 'mayor', text: 'Declaro tener 18 años o más', required: true }],
  paymentOptions: [
    {
      id: 'cuotas',
      label: '3 cuotas',
      installments: [
        { id: 'c1', label: 'Cuota 1', amount: 60000 },
        { id: 'c2', label: 'Cuota 2', amount: 60000, dueDate: '2026-12-22T23:59:00-03:00' },
        { id: 'c3', label: 'Cuota 3', amount: 60000, dueDate: '2027-01-07T23:59:00-03:00' },
      ],
      link: 'https://mpago.la/abc',
      availableUntil: '2026-12-22T23:59:00-03:00',
    },
    { id: 'completo', label: 'Pago completo', installments: [{ id: 'total', label: 'Total', amount: 180000 }], link: 'https://mpago.la/xyz' },
  ],
})

describe('event config', () => {
  it('fills defaults from an empty object', () => {
    const c = parseEventConfig({})
    expect(c.holdHours).toBe(24)
    expect(c.fields).toEqual([])
    expect(c.documents.cancellation).toBe('')
  })

  it('lists what blocks publishing', () => {
    expect(eventPublishProblems(parseEventConfig({}), 1000)).toEqual(
      expect.arrayContaining(['Falta la fecha de inicio del evento', 'Falta al menos una modalidad de pago']),
    )
    expect(eventPublishProblems(CONFIG, 180000)).toEqual([])
  })

  it('rejects conditions on later questions and non-https links', () => {
    const bad = parseEventConfig({ ...CONFIG, fields: [field({ id: 'a', type: 'short_text', showIf: { fieldId: 'b', values: ['x'] } }), ...FIELDS] })
    expect(eventPublishProblems(bad, 0).join()).toContain('depende de una pregunta que no está antes')
    expect(() => parseEventConfig({ paymentOptions: [{ id: 'x', label: 'X', link: 'http://a.cl', installments: [{ id: 'i', label: 'I', amount: 1 }] }] })).toThrow()
  })
})

describe('answers', () => {
  it('validates required, ranges and conditional questions; splits sensitive data', () => {
    const ok = validateAnswers(FIELDS, {
      nombre: ' Ana ', correo: 'ana@example.com', edad: '30', dieta: 'Otra', dieta_otra: 'Sin cebolla',
      tiene_condicion: 'yes', condicion: 'Asma', extra: 'ignorada',
    })
    expect(ok.errors).toEqual({})
    expect(ok.answers).toEqual({ nombre: 'Ana', correo: 'ana@example.com', edad: 30, dieta: 'Otra', dieta_otra: 'Sin cebolla' })
    expect(ok.sensitive).toEqual({ tiene_condicion: true, condicion: 'Asma' })

    const bad = validateAnswers(FIELDS, { nombre: 'Ana', correo: 'no-es-correo', edad: 17, dieta: 'Otra', tiene_condicion: 'no', condicion: 'x' })
    expect(bad.errors).toEqual({ correo: 'Correo inválido', edad: 'Debes tener 18 años o más', dieta_otra: 'Esta pregunta es obligatoria' })
    // Pregunta oculta: se descarta aunque venga.
    expect(bad.sensitive).toEqual({ tiene_condicion: false })
  })

  it('a hidden section hides its questions', () => {
    const fields = [field({ id: 'q', type: 'yes_no' }), field({ id: 's', type: 'section', showIf: { fieldId: 'q', values: ['yes'] } }), field({ id: 'x', type: 'short_text', required: true })]
    expect(visibleFields(fields, { q: false }).map((f) => f.id)).toEqual(['q'])
    expect(validateAnswers(fields, { q: 'no' }).errors).toEqual({})
    expect(validateAnswers(fields, { q: 'yes' }).errors).toEqual({ x: 'Esta pregunta es obligatoria' })
  })
})

describe('seats and status', () => {
  it('pending holds count only until they expire', () => {
    expect(occupiesSeat({ status: 'pending', holdExpiresAt: new Date('2026-12-02T00:00:00Z') }, NOW)).toBe(true)
    expect(occupiesSeat({ status: 'pending', holdExpiresAt: new Date('2026-11-30T00:00:00Z') }, NOW)).toBe(false)
    expect(occupiesSeat({ status: 'reserved', holdExpiresAt: null }, NOW)).toBe(true)
    expect(occupiesSeat({ status: 'cancelled', holdExpiresAt: null }, NOW)).toBe(false)
  })

  it('availability: open, full, waitlist, closed', () => {
    expect(registrationAvailability(CONFIG, 1, NOW)).toEqual({ status: 'open', remaining: 1 })
    expect(registrationAvailability(CONFIG, 2, NOW).status).toBe('full')
    expect(registrationAvailability({ ...CONFIG, waitlistEnabled: true }, 2, NOW).status).toBe('waitlist')
    expect(registrationAvailability(CONFIG, 0, new Date('2027-01-18T12:00:00Z')).status).toBe('closed')
  })

  it('first installment confirms the seat, the total completes it', () => {
    expect(statusFromPayments(0, 180000, 60000)).toBe('pending')
    expect(statusFromPayments(30000, 180000, 60000)).toBe('pending')
    expect(statusFromPayments(60000, 180000, 60000)).toBe('reserved')
    expect(statusFromPayments(180000, 180000, 60000)).toBe('paid')
  })
})

describe('exports', () => {
  const reg = {
    id: 'r1', professionalId: 'pro1', productId: 'ev1', token: 't', status: 'reserved', name: 'Ana', email: 'ana@example.com', phone: '+56911111111',
    answers: { dieta: 'Otra', dieta_otra: 'Sin cebolla', edad: 30 }, sensitiveAnswers: { condicion: 'Asma', tiene_condicion: true },
    formSnapshot: FIELDS, paymentOptionId: 'cuotas', paymentSnapshot: CONFIG.paymentOptions[0], totalAmount: 180000,
    acceptedTerms: {}, holdExpiresAt: null, notes: '', cancelledAt: null, sensitivePurgedAt: null,
    createdAt: NOW, updatedAt: NOW,
    payments: [{ id: 'p1', registrationId: 'r1', amount: 60000, paidAt: NOW, method: 'Mercado Pago', note: '', createdAt: NOW }],
  }

  it('general export has payments but never health data', () => {
    const t = buildExportTable('general', [reg], FIELDS)
    expect(t.headers).toContain('Saldo')
    expect(t.rows[0]).toContain(120000)
    expect(JSON.stringify(t)).not.toContain('Asma')
    expect(t.headers).not.toContain('dieta')
  })

  it('logistics and sensitive exports are separate', () => {
    expect(buildExportTable('logistics', [reg], FIELDS).headers).toEqual(['Nombre', 'Correo', 'Teléfono', 'Estado', 'dieta', 'dieta_otra'])
    expect(buildExportTable('sensitive', [reg], FIELDS).rows[0]).toEqual(['Ana', 'ana@example.com', '+56911111111', 'Reserva confirmada (pago parcial)', 'Sí', 'Asma'])
  })

  it('csv escapes and neutralizes formulas; xlsx is a zip', () => {
    expect(toCsv({ headers: ['a'], rows: [['=1+1'], ['x,"y"']] })).toBe('﻿a\r\n\'=1+1\r\n"x,""y"""')
    expect(toXlsx({ headers: ['a'], rows: [[1]] }).subarray(0, 2).toString()).toBe('PK')
  })
})

describe('POST /api/products/:slug/registrations', () => {
  const EVENT = {
    id: 'ev1', professionalId: 'pro1', slug: 'retiro', type: 'event', name: 'Retiro', summary: '', description: '', price: 180000,
    imageData: null, externalUrl: null, eventDate: null, isPublished: true, position: 0, eventConfig: CONFIG,
    createdAt: NOW, updatedAt: NOW,
  }
  const body = {
    answers: { nombre: 'Ana', correo: 'ANA@example.com', edad: 30, dieta: 'Normal', tiene_condicion: 'no' },
    consents: { mayor: true },
    paymentOptionId: 'cuotas',
  }

  beforeEach(() => {
    resetMocks()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    process.env.PROFESSIONAL_ID = 'pro1'
    prismaMock.product.findFirst.mockResolvedValue(EVENT)
    prismaMock.$transaction.mockImplementation((fn: (tx: typeof prismaMock) => unknown) => fn(prismaMock))
    prismaMock.eventRegistration.findFirst.mockResolvedValue(null)
    prismaMock.eventRegistration.findMany.mockResolvedValue([])
    prismaMock.eventRegistration.findUnique.mockResolvedValue(null)
    prismaMock.eventRegistration.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => ({ id: 'r1', ...data }))
  })

  it('creates a pending registration with a 24h hold and a snapshot of what was accepted', async () => {
    const res = await request(app).post('/api/products/retiro/registrations').send(body)
    expect(res.status).toBe(201)
    const data = prismaMock.eventRegistration.create.mock.calls[0][0].data
    expect(data).toMatchObject({ status: 'pending', name: 'Ana', email: 'ana@example.com', totalAmount: 180000, paymentOptionId: 'cuotas' })
    expect(data.holdExpiresAt).toEqual(new Date('2026-12-02T12:00:00Z'))
    expect(data.sensitiveAnswers).toEqual({ tiene_condicion: false })
    expect(data.acceptedTerms.consents).toEqual([{ id: 'mayor', text: 'Declaro tener 18 años o más', accepted: true }])
    expect(res.body.data.token).toBe(data.token)
    vi.useRealTimers()
  })

  it('returns field errors (consent missing, option no longer offered)', async () => {
    vi.setSystemTime(new Date('2026-12-28T12:00:00Z'))
    const res = await request(app).post('/api/products/retiro/registrations').send({ ...body, consents: {} })
    expect(res.status).toBe(400)
    expect(res.body.fieldErrors).toEqual({ mayor: 'Debes aceptar esta condición', paymentOptionId: 'Elige una modalidad de pago' })
    vi.useRealTimers()
  })

  it('409 when full or duplicated', async () => {
    prismaMock.eventRegistration.findMany.mockResolvedValue([
      { status: 'paid', holdExpiresAt: null },
      { status: 'reserved', holdExpiresAt: null },
    ])
    expect((await request(app).post('/api/products/retiro/registrations').send(body)).body.error).toBe('El evento está completo.')
    prismaMock.eventRegistration.findFirst.mockResolvedValue({ id: 'x' })
    expect((await request(app).post('/api/products/retiro/registrations').send(body)).status).toBe(409)
    vi.useRealTimers()
  })
})

describe('incomplete events (fix: convertir un taller publicado en evento)', () => {
  const WORKSHOP = {
    id: 'w1', professionalId: 'pro1', slug: 'retiro-femenino', type: 'workshop', name: 'Retiro', summary: 'S', description: '', price: 180000,
    imageData: null, imageThumbData: null, externalUrl: null, eventDate: new Date('2027-01-22T15:00:00Z'), isPublished: true, position: 0,
    eventConfig: null, createdAt: NOW, updatedAt: NOW,
  }
  const auth = () => `auth_token=${jwt.sign({ professionalId: 'pro1', role: 'admin' }, 'dev-secret')}`

  beforeEach(() => {
    resetMocks()
    process.env.PROFESSIONAL_ID = 'pro1'
    prismaMock.product.findFirst.mockResolvedValue(WORKSHOP)
    prismaMock.product.update.mockImplementation(({ data }: { data: Record<string, unknown> }) => ({ ...WORKSHOP, ...data }))
  })

  it('a published workshop becomes an event without unpublishing; the start date is kept', async () => {
    const res = await request(app).patch('/api/admin/products/w1').set('Cookie', auth()).send({ type: 'event', isPublished: true })
    expect(res.status).toBe(200)
    const data = prismaMock.product.update.mock.calls[0][0].data
    expect(data.type).toBe('event')
    expect(data.eventConfig.startsAt).toBe('2027-01-22T15:00:00.000Z')
    expect(data.eventConfig.fields.map((f: EventField) => f.role)).toEqual(['name', 'email', 'phone'])
    expect(res.body.data.isPublished).toBe(true)
    expect(res.body.data.eventProblems).toEqual(['Falta al menos una modalidad de pago'])
  })

  it('the date edited in «Editar» goes into the event configuration', async () => {
    prismaMock.product.findFirst.mockResolvedValue({ ...WORKSHOP, type: 'event', eventConfig: CONFIG })
    await request(app).patch('/api/admin/products/w1').set('Cookie', auth()).send({ eventDate: '2027-02-01T15:00:00.000Z' })
    const data = prismaMock.product.update.mock.calls[0][0].data
    expect(data.eventConfig.startsAt).toBe('2027-02-01T15:00:00.000Z')
    expect(data.eventConfig.capacity).toBe(2)
    expect(data.eventDate).toEqual(new Date('2027-02-01T15:00:00.000Z'))
  })

  it('an incomplete event shows «próximamente» and rejects registrations', () => {
    const incomplete = { ...CONFIG, paymentOptions: [] }
    expect(registrationAvailability(incomplete, 0, NOW, eventPublishProblems(incomplete, 180000).length === 0).status).toBe('not_started')
  })
})

describe('publicAvailability (fix: mostrar «Quedan X cupos» solo con N o menos)', () => {
  const open = (remaining: number | null) => ({ status: 'open' as const, remaining, capacity: 11, taken: 11 - (remaining ?? 0) })
  it('hides the number unless N or fewer seats remain; never exposes capacity or taken', () => {
    expect(publicAvailability(open(11), { showRemainingAt: 3 })).toEqual({ status: 'open', remaining: null, capacity: null, taken: null })
    expect(publicAvailability(open(3), { showRemainingAt: 3 }).remaining).toBe(3)
    expect(publicAvailability(open(1), { showRemainingAt: null }).remaining).toBeNull()
    expect(publicAvailability(open(1), { showRemainingAt: 0 }).remaining).toBeNull()
    expect(publicAvailability({ ...open(0), status: 'full' as const }, { showRemainingAt: 0 })).toMatchObject({ status: 'full', remaining: 0 })
  })

  it('public config never carries the total capacity', () => {
    expect(publicEventConfig(CONFIG, NOW).capacity).toBeNull()
  })
})

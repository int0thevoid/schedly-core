import { beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'

vi.mock('../lib/prisma.js', () => ({ prisma: prismaMock }))

import { prismaMock, resetMocks } from './helpers/prisma-mock.js'
import app from '../app.js'
import { getAdminDaySlots } from '../availability.js'
import type { Appointment, ScheduleBlock, Service, WeeklySchedule } from '../types.js'

// Lunes 8 de junio de 2026 (Chile UTC-4): 09:00 local = 13:00Z.
const DATE = new Date('2026-06-08T12:00:00.000Z')
const at = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(Date.UTC(2026, 5, 8, h + 4, m))
}
const SERVICE: Service = {
  id: 's1', name: 'Sesión', description: '', duration: 45, price: 30000, currency: 'CLP', modality: 'presential', isActive: true,
}
// Solo para otro servicio: la web no la ofrecería para s1; el panel sí.
const SCHEDULE: WeeklySchedule[] = [{ dayOfWeek: 1, startTime: '09:00', endTime: '13:00', serviceIds: ['otro'], isActive: true }]
const LATER = new Date('2026-06-01T12:00:00Z')

function appointment(start: string, end: string): Appointment {
  return {
    id: start, serviceId: 's1', clientName: 'A', clientEmail: 'a@a.cl', clientPhone: '1',
    startDateTime: at(start), endDateTime: at(end), modality: 'presential', status: 'confirmed',
    paymentStatus: 'unpaid', createdAt: LATER, bufferMinutes: 15,
  }
}

describe('getAdminDaySlots (cita manual)', () => {
  it('shows every hour of the schedule, ignoring per-service schedule', () => {
    const slots = getAdminDaySlots(DATE, SERVICE, SCHEDULE, [], [], 15, LATER)
    expect(slots.map((s) => s.startDateTime.toISOString())).toEqual([at('09:00'), at('10:00'), at('11:00'), at('12:00')].map((d) => d.toISOString()))
    expect(slots.every((s) => s.note === null)).toBe(true)
  })

  it('keeps blocked hours selectable with a note; hides hours taken by another appointment', () => {
    const block: ScheduleBlock = { id: 'b1', title: 'Almuerzo', startDateTime: at('12:00'), endDateTime: at('13:00') }
    const slots = getAdminDaySlots(DATE, SERVICE, SCHEDULE, [block], [appointment('10:00', '10:45')], 15, LATER)
    const byTime = Object.fromEntries(slots.map((s) => [s.startDateTime.toISOString(), s.note]))
    expect(byTime[at('10:00').toISOString()]).toBeUndefined()
    expect(byTime[at('12:00').toISOString()]).toBe('Bloqueado: Almuerzo')
  })

  it('flags (but allows) a slot without the rest time between sessions', () => {
    const slots = getAdminDaySlots(DATE, SERVICE, SCHEDULE, [], [appointment('09:20', '10:05')], 15, LATER)
    const ten = slots.find((s) => s.startDateTime.getTime() === at('10:00').getTime())
    // 09:20–10:05 se cruza con 10:00: oculta. 11:00 queda libre.
    expect(ten).toBeUndefined()
    const slots2 = getAdminDaySlots(DATE, SERVICE, SCHEDULE, [], [appointment('10:45', '10:55')], 15, LATER)
    expect(slots2.find((s) => s.startDateTime.getTime() === at('11:00').getTime())?.note).toBe('Sin descanso entre sesiones')
  })

  it('does not apply minimum notice: hours later today are offered, past ones flagged', () => {
    const now = at('10:30')
    const slots = getAdminDaySlots(DATE, SERVICE, SCHEDULE, [], [], 15, now)
    expect(slots.find((s) => s.startDateTime.getTime() === at('11:00').getTime())?.note).toBeNull()
    expect(slots.find((s) => s.startDateTime.getTime() === at('09:00').getTime())?.note).toBe('Hora ya pasada')
  })
})

describe('GET /api/admin/availability', () => {
  beforeEach(() => resetMocks())

  it('requires admin auth', async () => {
    expect((await request(app).get('/api/admin/availability?serviceId=s1&date=2026-06-08')).status).toBe(401)
  })

  it('returns admin slots for the professional of the session', async () => {
    prismaMock.service.findUnique.mockResolvedValue({ ...SERVICE, professionalId: 'pro1', bufferMinutes: null })
    prismaMock.professional.findUnique.mockResolvedValue({ bookingWindowWeeks: 1, minAdvanceBusinessDays: 168, minAdvanceUnit: 'hours', defaultBufferMinutes: 15, timezone: 'America/Santiago' })
    prismaMock.weeklySchedule.findMany.mockResolvedValue([{ dayOfWeek: 1, startTime: '09:00', endTime: '11:00', serviceIds: [], isActive: true }])
    prismaMock.scheduleBlock.findMany.mockResolvedValue([])
    prismaMock.appointment.findMany.mockResolvedValue([])
    const token = jwt.sign({ professionalId: 'pro1', role: 'admin' }, process.env.JWT_SECRET ?? 'dev-secret')

    const res = await request(app).get('/api/admin/availability?serviceId=s1&date=2026-06-08').set('Cookie', `auth_token=${token}`)

    expect(res.status).toBe(200)
    // Con 168 h de anticipación mínima la web no ofrecería nada; el panel sí.
    expect(res.body.data).toHaveLength(2)
  })
})

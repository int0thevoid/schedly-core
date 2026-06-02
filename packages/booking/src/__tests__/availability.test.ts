import { describe, it, expect } from 'vitest'
import {
  generateDaySlots,
  filterBlockedSlots,
  filterOccupiedSlots,
  getAvailableSlots,
  doesBlockApplyToDate,
} from '../availability'
import type { Appointment, ScheduleBlock, Service, TimeSlot, WeeklySchedule } from '../types'

// ─── Helpers de test ─────────────────────────────────────────────────────────

const TIMEZONE = 'America/Santiago'

/** Formatea un Date como "HH:mm" en hora de Santiago. */
function toSantiagoHHMM(date: Date): string {
  return date.toLocaleTimeString('en-GB', {
    timeZone: TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

/** Formatea un Date como "YYYY-MM-DD" en fecha de Santiago. */
function toSantiagoDate(date: Date): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: TIMEZONE }).format(date)
}

/**
 * Crea un Date UTC que representa una hora local en America/Santiago.
 * Usa el mismo algoritmo que la función interna toUTC de availability.ts.
 */
function makeSantiagoDate(isoDate: string, timeStr: string): Date {
  const [year, month, day] = isoDate.split('-').map(Number)
  const [hour, minute] = timeStr.split(':').map(Number)

  const fakeUTC = new Date(Date.UTC(year, month - 1, day, hour, minute, 0))
  const localParts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(fakeUTC)

  const get = (type: string) => {
    const val = Number(localParts.find(p => p.type === type)!.value)
    return type === 'hour' && val === 24 ? 0 : val
  }

  const localAsUTC = new Date(Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second')))
  const offsetMs = fakeUTC.getTime() - localAsUTC.getTime()
  return new Date(fakeUTC.getTime() + offsetMs)
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

// Lunes 15 enero 2024 al mediodía UTC = 09:00 Santiago (verano, UTC-3)
const MONDAY_JAN_15 = new Date('2024-01-15T12:00:00Z')

// Lunes 15 julio 2024 al mediodía UTC = 08:00 Santiago (invierno, UTC-4)
const MONDAY_JUL_15 = new Date('2024-07-15T12:00:00Z')

// Domingo 14 enero 2024
const SUNDAY_JAN_14 = new Date('2024-01-14T12:00:00Z')

// Miércoles 10 enero 2024
const WEDNESDAY_JAN_10 = new Date('2024-01-10T12:00:00Z')

// Sábado 13 enero 2024
const SATURDAY_JAN_13 = new Date('2024-01-13T12:00:00Z')

const SCHEDULE_MON_FRI: WeeklySchedule[] = [
  { dayOfWeek: 1, startTime: '09:00', endTime: '19:00' }, // lunes
  { dayOfWeek: 2, startTime: '09:00', endTime: '19:00' }, // martes
  { dayOfWeek: 3, startTime: '09:00', endTime: '19:00' }, // miércoles
  { dayOfWeek: 4, startTime: '09:00', endTime: '19:00' }, // jueves
  { dayOfWeek: 5, startTime: '09:00', endTime: '19:00' }, // viernes
]

const SERVICE_45: Service = {
  id: 'svc-1',
  name: 'Psicoterapia Individual',
  description: '',
  duration: 45,
  price: 30000,
  currency: 'CLP',
  modality: 'both',
  isActive: true,
}

const SERVICE_60: Service = {
  id: 'svc-2',
  name: 'Terapia de Parejas',
  description: '',
  duration: 60,
  price: 42000,
  currency: 'CLP',
  modality: 'both',
  isActive: true,
}

function makeAppointment(
  start: Date,
  end: Date,
  status: Appointment['status'] = 'confirmed',
): Appointment {
  return {
    id: crypto.randomUUID(),
    serviceId: 'svc-1',
    clientName: 'Test Client',
    clientEmail: 'test@test.cl',
    clientPhone: '+56900000000',
    startDateTime: start,
    endDateTime: end,
    modality: 'presential',
    status,
    paymentStatus: 'unpaid',
    createdAt: new Date(),
  }
}

function makeBlock(
  startIso: string,
  endIso: string,
  recurrence?: ScheduleBlock['recurrence'],
): ScheduleBlock {
  return {
    id: crypto.randomUUID(),
    title: 'Bloqueo',
    startDateTime: new Date(startIso),
    endDateTime: new Date(endIso),
    recurrence,
  }
}

// ─── generateDaySlots ────────────────────────────────────────────────────────

describe('generateDaySlots', () => {
  it('retorna 0 slots cuando no hay horario para ese día', () => {
    // SUNDAY_JAN_14 es domingo (dayOfWeek=0), no está en el horario
    const slots = generateDaySlots(SUNDAY_JAN_14, SCHEDULE_MON_FRI, 45)
    expect(slots).toHaveLength(0)
  })

  it('retorna 0 slots con horario vacío', () => {
    const slots = generateDaySlots(MONDAY_JAN_15, [], 45)
    expect(slots).toHaveLength(0)
  })

  it('genera 13 slots de 45 min en horario 09:00-19:00 (verano)', () => {
    // (19:00 - 09:00) = 600 min / 45 min = 13 slots completos
    const slots = generateDaySlots(MONDAY_JAN_15, SCHEDULE_MON_FRI, 45)
    expect(slots).toHaveLength(13)
  })

  it('el primer slot comienza a las 09:00 Santiago', () => {
    const slots = generateDaySlots(MONDAY_JAN_15, SCHEDULE_MON_FRI, 45)
    expect(toSantiagoHHMM(slots[0].startDateTime)).toBe('09:00')
    expect(toSantiagoHHMM(slots[0].endDateTime)).toBe('09:45')
  })

  it('el segundo slot es 09:45, el tercero 10:30', () => {
    const slots = generateDaySlots(MONDAY_JAN_15, SCHEDULE_MON_FRI, 45)
    expect(toSantiagoHHMM(slots[1].startDateTime)).toBe('09:45')
    expect(toSantiagoHHMM(slots[2].startDateTime)).toBe('10:30')
  })

  it('el último slot comienza a las 18:00 y termina a las 18:45', () => {
    const slots = generateDaySlots(MONDAY_JAN_15, SCHEDULE_MON_FRI, 45)
    const last = slots[slots.length - 1]
    expect(toSantiagoHHMM(last.startDateTime)).toBe('18:00')
    expect(toSantiagoHHMM(last.endDateTime)).toBe('18:45')
  })

  it('todos los slots están en la misma fecha de Santiago', () => {
    const slots = generateDaySlots(MONDAY_JAN_15, SCHEDULE_MON_FRI, 45)
    slots.forEach(slot => {
      expect(toSantiagoDate(slot.startDateTime)).toBe('2024-01-15')
    })
  })

  it('genera slots correctos en invierno (UTC-4)', () => {
    const slots = generateDaySlots(MONDAY_JUL_15, SCHEDULE_MON_FRI, 45)
    expect(slots).toHaveLength(13)
    expect(toSantiagoHHMM(slots[0].startDateTime)).toBe('09:00')
    expect(toSantiagoDate(slots[0].startDateTime)).toBe('2024-07-15')
  })

  it('genera slots correctos con duración de 60 min: 10 slots en 09:00-19:00', () => {
    const slots = generateDaySlots(MONDAY_JAN_15, SCHEDULE_MON_FRI, 60)
    expect(slots).toHaveLength(10)
    expect(toSantiagoHHMM(slots[0].startDateTime)).toBe('09:00')
    expect(toSantiagoHHMM(slots[9].startDateTime)).toBe('18:00')
  })

  it('todos los slots se inicializan con isAvailable=true', () => {
    const slots = generateDaySlots(MONDAY_JAN_15, SCHEDULE_MON_FRI, 45)
    expect(slots.every(s => s.isAvailable)).toBe(true)
  })

  it('sábado sin horario configurado → 0 slots', () => {
    const slots = generateDaySlots(SATURDAY_JAN_13, SCHEDULE_MON_FRI, 45)
    expect(slots).toHaveLength(0)
  })
})

// ─── doesBlockApplyToDate ────────────────────────────────────────────────────

describe('doesBlockApplyToDate', () => {
  it('bloqueo puntual aplica sólo en su propia fecha', () => {
    const block = makeBlock('2024-01-15T14:00:00Z', '2024-01-15T16:00:00Z')
    expect(doesBlockApplyToDate(block, MONDAY_JAN_15)).toBe(true)
    expect(doesBlockApplyToDate(block, new Date('2024-01-16T12:00:00Z'))).toBe(false)
    expect(doesBlockApplyToDate(block, new Date('2024-01-14T12:00:00Z'))).toBe(false)
  })

  it('recurrencia diaria aplica a cualquier día después del inicio', () => {
    const block = makeBlock('2024-01-15T14:00:00Z', '2024-01-15T16:00:00Z', { type: 'daily' })
    expect(doesBlockApplyToDate(block, MONDAY_JAN_15)).toBe(true)
    expect(doesBlockApplyToDate(block, new Date('2024-01-20T12:00:00Z'))).toBe(true)
    expect(doesBlockApplyToDate(block, new Date('2024-01-14T12:00:00Z'))).toBe(false)
  })

  it('recurrencia diaria respeta la fecha de fin', () => {
    const block = makeBlock('2024-01-15T14:00:00Z', '2024-01-15T16:00:00Z', {
      type: 'daily',
      // 2024-01-20T15:00Z = 2024-01-20 12:00 Santiago (UTC-3) → fecha 20 enero en Santiago
      endDate: new Date('2024-01-20T15:00:00Z'),
    })
    expect(doesBlockApplyToDate(block, new Date('2024-01-20T12:00:00Z'))).toBe(true)
    expect(doesBlockApplyToDate(block, new Date('2024-01-21T12:00:00Z'))).toBe(false)
  })

  it('recurrencia weekdays aplica lunes-viernes, no fines de semana', () => {
    // Bloqueo empieza el 15 enero (lunes). Usar fechas >= 15 enero.
    const block = makeBlock('2024-01-15T14:00:00Z', '2024-01-15T16:00:00Z', { type: 'weekdays' })
    // Lunes 15 enero
    expect(doesBlockApplyToDate(block, MONDAY_JAN_15)).toBe(true)
    // Miércoles 17 enero (después del inicio)
    expect(doesBlockApplyToDate(block, new Date('2024-01-17T12:00:00Z'))).toBe(true)
    // Sábado 20 enero
    expect(doesBlockApplyToDate(block, new Date('2024-01-20T12:00:00Z'))).toBe(false)
    // Domingo 21 enero
    expect(doesBlockApplyToDate(block, new Date('2024-01-21T12:00:00Z'))).toBe(false)
  })

  it('recurrencia weekly aplica sólo al mismo día de la semana', () => {
    // MONDAY_JAN_15 es lunes (dayOfWeek=1)
    const block = makeBlock('2024-01-15T14:00:00Z', '2024-01-15T16:00:00Z', { type: 'weekly' })
    // Siguiente lunes (22 enero)
    expect(doesBlockApplyToDate(block, new Date('2024-01-22T12:00:00Z'))).toBe(true)
    // Martes
    expect(doesBlockApplyToDate(block, new Date('2024-01-16T12:00:00Z'))).toBe(false)
    // Miércoles
    expect(doesBlockApplyToDate(block, WEDNESDAY_JAN_10)).toBe(false)
  })

  it('recurrencia monthly aplica el mismo día del mes', () => {
    // 15 de enero
    const block = makeBlock('2024-01-15T14:00:00Z', '2024-01-15T16:00:00Z', { type: 'monthly' })
    // 15 de febrero
    expect(doesBlockApplyToDate(block, new Date('2024-02-15T12:00:00Z'))).toBe(true)
    // 14 de febrero
    expect(doesBlockApplyToDate(block, new Date('2024-02-14T12:00:00Z'))).toBe(false)
    // 15 de julio
    expect(doesBlockApplyToDate(block, new Date('2024-07-15T12:00:00Z'))).toBe(true)
  })
})

// ─── filterBlockedSlots ──────────────────────────────────────────────────────

describe('filterBlockedSlots', () => {
  it('sin bloques → todos los slots disponibles', () => {
    const slots = generateDaySlots(MONDAY_JAN_15, SCHEDULE_MON_FRI, 45)
    const result = filterBlockedSlots(slots, [])
    expect(result.every(s => s.isAvailable)).toBe(true)
  })

  it('bloqueo puntual todo el día → todos los slots bloqueados', () => {
    const slots = generateDaySlots(MONDAY_JAN_15, SCHEDULE_MON_FRI, 45)
    // Bloqueo desde 08:00 hasta 20:00 Santiago del 15 enero
    const block = makeBlock(
      makeSantiagoDate('2024-01-15', '08:00').toISOString(),
      makeSantiagoDate('2024-01-15', '20:00').toISOString(),
    )
    const result = filterBlockedSlots(slots, [block])
    expect(result.every(s => !s.isAvailable)).toBe(true)
  })

  it('bloqueo puntual parcial bloquea sólo los slots solapados', () => {
    const slots = generateDaySlots(MONDAY_JAN_15, SCHEDULE_MON_FRI, 45)
    // Bloqueo 11:00-13:00 Santiago (cubre slots 11:15 y 12:00)
    const block = makeBlock(
      makeSantiagoDate('2024-01-15', '11:00').toISOString(),
      makeSantiagoDate('2024-01-15', '13:00').toISOString(),
    )
    const result = filterBlockedSlots(slots, [block])

    const blockedTimes = result.filter(s => !s.isAvailable).map(s => toSantiagoHHMM(s.startDateTime))
    // Los slots 10:30-11:15 y 11:15-12:00 y 12:00-12:45 se solapan con 11:00-13:00
    expect(blockedTimes).toContain('10:30')
    expect(blockedTimes).toContain('11:15')
    expect(blockedTimes).toContain('12:00')

    // El slot 09:00 no se solapa
    const slot900 = result.find(s => toSantiagoHHMM(s.startDateTime) === '09:00')
    expect(slot900?.isAvailable).toBe(true)
  })

  it('bloqueo recurrente diario bloquea el mismo horario todos los días', () => {
    const monday = generateDaySlots(MONDAY_JAN_15, SCHEDULE_MON_FRI, 45)
    const tuesday = generateDaySlots(new Date('2024-01-16T12:00:00Z'), SCHEDULE_MON_FRI, 45)

    // Bloqueo diario de 10:00 a 11:00 Santiago, desde el 15 enero
    const block = makeBlock(
      makeSantiagoDate('2024-01-15', '10:00').toISOString(),
      makeSantiagoDate('2024-01-15', '11:00').toISOString(),
      { type: 'daily' },
    )

    const monResult = filterBlockedSlots(monday, [block])
    const tueResult = filterBlockedSlots(tuesday, [block])

    // En ambos días, el slot 09:45-10:30 queda bloqueado (solapa con 10:00-11:00)
    const monBlocked = monResult.filter(s => !s.isAvailable).map(s => toSantiagoHHMM(s.startDateTime))
    const tueBlocked = tueResult.filter(s => !s.isAvailable).map(s => toSantiagoHHMM(s.startDateTime))

    expect(monBlocked).toContain('09:45')
    expect(tueBlocked).toContain('09:45')
  })

  it('bloqueo recurrente semanal (mismo día) afecta sólo ese día de la semana', () => {
    const monday = generateDaySlots(MONDAY_JAN_15, SCHEDULE_MON_FRI, 45)
    const tuesday = generateDaySlots(new Date('2024-01-16T12:00:00Z'), SCHEDULE_MON_FRI, 45)

    const block = makeBlock(
      makeSantiagoDate('2024-01-15', '10:00').toISOString(),
      makeSantiagoDate('2024-01-15', '11:00').toISOString(),
      { type: 'weekly' },
    )

    const monResult = filterBlockedSlots(monday, [block])
    const tueResult = filterBlockedSlots(tuesday, [block])

    const monBlocked = monResult.some(s => !s.isAvailable)
    const tueBlocked = tueResult.some(s => !s.isAvailable)

    expect(monBlocked).toBe(true)
    expect(tueBlocked).toBe(false)  // martes no es lunes
  })

  it('bloqueo recurrente sólo días hábiles no afecta fines de semana', () => {
    const wednesdaySchedule: WeeklySchedule[] = [
      { dayOfWeek: 3, startTime: '09:00', endTime: '19:00' },
      { dayOfWeek: 6, startTime: '09:00', endTime: '14:00' }, // sábado
    ]
    const wednesday = generateDaySlots(WEDNESDAY_JAN_10, wednesdaySchedule, 45)
    const saturday = generateDaySlots(SATURDAY_JAN_13, wednesdaySchedule, 45)

    const block = makeBlock(
      makeSantiagoDate('2024-01-10', '10:00').toISOString(),
      makeSantiagoDate('2024-01-10', '11:00').toISOString(),
      { type: 'weekdays' },
    )

    const wedResult = filterBlockedSlots(wednesday, [block])
    const satResult = filterBlockedSlots(saturday, [block])

    expect(wedResult.some(s => !s.isAvailable)).toBe(true)   // miércoles bloqueado
    expect(satResult.every(s => s.isAvailable)).toBe(true)    // sábado sin cambios
  })

  it('bloqueo en día diferente no afecta los slots', () => {
    const slots = generateDaySlots(MONDAY_JAN_15, SCHEDULE_MON_FRI, 45)
    // Bloqueo el día 16 (martes), no el 15 (lunes)
    const block = makeBlock(
      makeSantiagoDate('2024-01-16', '09:00').toISOString(),
      makeSantiagoDate('2024-01-16', '19:00').toISOString(),
    )
    const result = filterBlockedSlots(slots, [block])
    expect(result.every(s => s.isAvailable)).toBe(true)
  })
})

// ─── filterOccupiedSlots ─────────────────────────────────────────────────────

describe('filterOccupiedSlots', () => {
  it('sin citas → todos los slots disponibles', () => {
    const slots = generateDaySlots(MONDAY_JAN_15, SCHEDULE_MON_FRI, 45)
    const result = filterOccupiedSlots(slots, [])
    expect(result.every(s => s.isAvailable)).toBe(true)
  })

  it('cita que ocupa un slot lo marca como no disponible', () => {
    const slots = generateDaySlots(MONDAY_JAN_15, SCHEDULE_MON_FRI, 45)
    const aptStart = makeSantiagoDate('2024-01-15', '09:00')
    const aptEnd = makeSantiagoDate('2024-01-15', '09:45')
    const appointment = makeAppointment(aptStart, aptEnd)

    const result = filterOccupiedSlots(slots, [appointment])
    const slot900 = result.find(s => toSantiagoHHMM(s.startDateTime) === '09:00')
    const slot945 = result.find(s => toSantiagoHHMM(s.startDateTime) === '09:45')

    expect(slot900?.isAvailable).toBe(false)
    expect(slot945?.isAvailable).toBe(true)  // el siguiente slot está libre
  })

  it('cita cancelada no bloquea el slot', () => {
    const slots = generateDaySlots(MONDAY_JAN_15, SCHEDULE_MON_FRI, 45)
    const aptStart = makeSantiagoDate('2024-01-15', '09:00')
    const aptEnd = makeSantiagoDate('2024-01-15', '09:45')
    const appointment = makeAppointment(aptStart, aptEnd, 'cancelled')

    const result = filterOccupiedSlots(slots, [appointment])
    const slot900 = result.find(s => toSantiagoHHMM(s.startDateTime) === '09:00')
    expect(slot900?.isAvailable).toBe(true)
  })

  it('cita que solapa parcialmente bloquea los slots afectados', () => {
    const slots = generateDaySlots(MONDAY_JAN_15, SCHEDULE_MON_FRI, 45)
    // Cita de 09:30 a 10:30 — solapa con slot 09:00-09:45 y slot 09:45-10:30
    const aptStart = makeSantiagoDate('2024-01-15', '09:30')
    const aptEnd = makeSantiagoDate('2024-01-15', '10:30')
    const appointment = makeAppointment(aptStart, aptEnd)

    const result = filterOccupiedSlots(slots, [appointment])
    const s900 = result.find(s => toSantiagoHHMM(s.startDateTime) === '09:00')
    const s945 = result.find(s => toSantiagoHHMM(s.startDateTime) === '09:45')
    const s1030 = result.find(s => toSantiagoHHMM(s.startDateTime) === '10:30')

    expect(s900?.isAvailable).toBe(false)
    expect(s945?.isAvailable).toBe(false)
    expect(s1030?.isAvailable).toBe(true)
  })

  it('múltiples citas bloquean sus respectivos slots', () => {
    const slots = generateDaySlots(MONDAY_JAN_15, SCHEDULE_MON_FRI, 45)
    const apt1 = makeAppointment(
      makeSantiagoDate('2024-01-15', '09:00'),
      makeSantiagoDate('2024-01-15', '09:45'),
    )
    const apt2 = makeAppointment(
      makeSantiagoDate('2024-01-15', '11:15'),
      makeSantiagoDate('2024-01-15', '12:00'),
    )

    const result = filterOccupiedSlots(slots, [apt1, apt2])
    const blocked = result.filter(s => !s.isAvailable).map(s => toSantiagoHHMM(s.startDateTime))
    expect(blocked).toContain('09:00')
    expect(blocked).toContain('11:15')
    expect(blocked).not.toContain('09:45')
  })
})

// ─── getAvailableSlots ───────────────────────────────────────────────────────

describe('getAvailableSlots', () => {
  it('retorna todos los slots disponibles cuando no hay bloques ni citas', () => {
    const available = getAvailableSlots(MONDAY_JAN_15, SERVICE_45, SCHEDULE_MON_FRI, [], [])
    expect(available).toHaveLength(13)
    expect(available.every(s => s.isAvailable)).toBe(true)
  })

  it('retorna 0 slots para un día sin horario', () => {
    const available = getAvailableSlots(SUNDAY_JAN_14, SERVICE_45, SCHEDULE_MON_FRI, [], [])
    expect(available).toHaveLength(0)
  })

  it('aplica correctamente bloques y citas combinados', () => {
    const block = makeBlock(
      makeSantiagoDate('2024-01-15', '09:00').toISOString(),
      makeSantiagoDate('2024-01-15', '09:45').toISOString(),
    )
    const apt = makeAppointment(
      makeSantiagoDate('2024-01-15', '09:45'),
      makeSantiagoDate('2024-01-15', '10:30'),
    )

    const available = getAvailableSlots(MONDAY_JAN_15, SERVICE_45, SCHEDULE_MON_FRI, [block], [apt])
    const times = available.map(s => toSantiagoHHMM(s.startDateTime))

    expect(times).not.toContain('09:00') // bloqueado
    expect(times).not.toContain('09:45') // ocupado por cita
    expect(times).toContain('10:30')     // libre
  })

  it('filtra el horario según serviceIds del WeeklySchedule', () => {
    const mixedSchedule: WeeklySchedule[] = [
      // lunes: sólo svc-1
      { dayOfWeek: 1, startTime: '09:00', endTime: '13:00', serviceIds: ['svc-1'] },
      // martes: todos los servicios (sin serviceIds)
      { dayOfWeek: 2, startTime: '09:00', endTime: '13:00' },
    ]

    // svc-2 no está en serviceIds del lunes → 0 slots
    const mondayForSvc2 = getAvailableSlots(MONDAY_JAN_15, SERVICE_60, mixedSchedule, [], [])
    expect(mondayForSvc2).toHaveLength(0)

    // svc-2 sí aplica el martes (sin restricción de serviceIds) → 4 slots de 60 min en 09-13
    const tuesday = new Date('2024-01-16T12:00:00Z')
    const tuesdayForSvc2 = getAvailableSlots(tuesday, SERVICE_60, mixedSchedule, [], [])
    expect(tuesdayForSvc2).toHaveLength(4)
  })

  it('retorna sólo slots con isAvailable=true (no incluye los no disponibles)', () => {
    const block = makeBlock(
      makeSantiagoDate('2024-01-15', '09:00').toISOString(),
      makeSantiagoDate('2024-01-15', '19:00').toISOString(),
    )
    const available = getAvailableSlots(MONDAY_JAN_15, SERVICE_45, SCHEDULE_MON_FRI, [block], [])
    expect(available).toHaveLength(0)
  })
})

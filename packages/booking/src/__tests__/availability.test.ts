import { describe, it, expect } from 'vitest'
import {
  generateDaySlots,
  filterBlockedSlots,
  filterOccupiedSlots,
  getAvailableSlots,
  doesBlockApplyToDate,
  getMinBookingDateTime,
  getMaxBookingDateTime,
} from '../availability'
import type { Appointment, ProfessionalConfig, ScheduleBlock, Service, TimeSlot, WeeklySchedule } from '../types'

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

  it('genera 10 slots de 45 min en horario 09:00-19:00, en horas cerradas (verano)', () => {
    // Slots cada 60 min desde 09:00 hasta 18:00 (18:00 + 45min <= 19:00)
    const slots = generateDaySlots(MONDAY_JAN_15, SCHEDULE_MON_FRI, 45)
    expect(slots).toHaveLength(10)
  })

  it('el primer slot comienza a las 09:00 Santiago', () => {
    const slots = generateDaySlots(MONDAY_JAN_15, SCHEDULE_MON_FRI, 45)
    expect(toSantiagoHHMM(slots[0].startDateTime)).toBe('09:00')
    expect(toSantiagoHHMM(slots[0].endDateTime)).toBe('09:45')
  })

  it('el segundo slot es 10:00, el tercero 11:00 (incrementos de 60 min)', () => {
    const slots = generateDaySlots(MONDAY_JAN_15, SCHEDULE_MON_FRI, 45)
    expect(toSantiagoHHMM(slots[1].startDateTime)).toBe('10:00')
    expect(toSantiagoHHMM(slots[2].startDateTime)).toBe('11:00')
  })

  it('todos los slots comienzan en una hora cerrada (minuto = 00), sin importar la duración', () => {
    const slots45 = generateDaySlots(MONDAY_JAN_15, SCHEDULE_MON_FRI, 45)
    const slots50buffer15 = generateDaySlots(MONDAY_JAN_15, SCHEDULE_MON_FRI, 50, 15)
    ;[...slots45, ...slots50buffer15].forEach(slot => {
      expect(toSantiagoHHMM(slot.startDateTime).endsWith(':00')).toBe(true)
    })
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
    expect(slots).toHaveLength(10)
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
    // Bloqueo 11:00-13:00 Santiago (cubre los slots 11:00-11:45 y 12:00-12:45)
    const block = makeBlock(
      makeSantiagoDate('2024-01-15', '11:00').toISOString(),
      makeSantiagoDate('2024-01-15', '13:00').toISOString(),
    )
    const result = filterBlockedSlots(slots, [block])

    const blockedTimes = result.filter(s => !s.isAvailable).map(s => toSantiagoHHMM(s.startDateTime))
    expect(blockedTimes).toContain('11:00')
    expect(blockedTimes).toContain('12:00')

    // El slot 09:00 no se solapa
    const slot900 = result.find(s => toSantiagoHHMM(s.startDateTime) === '09:00')
    expect(slot900?.isAvailable).toBe(true)

    // El slot 13:00 tampoco (el bloqueo termina justo cuando empieza)
    const slot1300 = result.find(s => toSantiagoHHMM(s.startDateTime) === '13:00')
    expect(slot1300?.isAvailable).toBe(true)
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

    // En ambos días, el slot 10:00-10:45 queda bloqueado (solapa con 10:00-11:00)
    const monBlocked = monResult.filter(s => !s.isAvailable).map(s => toSantiagoHHMM(s.startDateTime))
    const tueBlocked = tueResult.filter(s => !s.isAvailable).map(s => toSantiagoHHMM(s.startDateTime))

    expect(monBlocked).toContain('10:00')
    expect(tueBlocked).toContain('10:00')
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
    const slot1000 = result.find(s => toSantiagoHHMM(s.startDateTime) === '10:00')

    expect(slot900?.isAvailable).toBe(false)
    expect(slot1000?.isAvailable).toBe(true)  // el siguiente slot está libre
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
    // Cita de 09:30 a 10:30 — solapa con slot 09:00-09:45 y slot 10:00-10:45
    const aptStart = makeSantiagoDate('2024-01-15', '09:30')
    const aptEnd = makeSantiagoDate('2024-01-15', '10:30')
    const appointment = makeAppointment(aptStart, aptEnd)

    const result = filterOccupiedSlots(slots, [appointment])
    const s900 = result.find(s => toSantiagoHHMM(s.startDateTime) === '09:00')
    const s1000 = result.find(s => toSantiagoHHMM(s.startDateTime) === '10:00')
    const s1100 = result.find(s => toSantiagoHHMM(s.startDateTime) === '11:00')

    expect(s900?.isAvailable).toBe(false)
    expect(s1000?.isAvailable).toBe(false)
    expect(s1100?.isAvailable).toBe(true)
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
    expect(blocked).toContain('11:00')
    expect(blocked).not.toContain('10:00')
  })
})

// ─── getAvailableSlots ───────────────────────────────────────────────────────

describe('getAvailableSlots', () => {
  it('retorna todos los slots disponibles cuando no hay bloques ni citas', () => {
    const available = getAvailableSlots(MONDAY_JAN_15, SERVICE_45, SCHEDULE_MON_FRI, [], [])
    expect(available).toHaveLength(10)
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
    expect(times).not.toContain('10:00') // ocupado por cita
    expect(times).toContain('11:00')     // libre
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

// ─── Fixtures adicionales ────────────────────────────────────────────────────

const DEFAULT_CONFIG: ProfessionalConfig = {
  bookingWindowWeeks: 4,
  minAdvanceBusinessDays: 2,
  defaultBufferMinutes: 0,
  timezone: 'America/Santiago',
}

// ─── getMinBookingDateTime ───────────────────────────────────────────────────

describe('getMinBookingDateTime', () => {
  // Con minAdvanceBusinessDays=2 y now en día X:
  // avanzamos de día en día desde mañana contando sólo L–V hasta completar 2

  it('hoy lunes → mínimo miércoles', () => {
    // now = lunes 15 ene 2024 (mediodía UTC = 09:00 Santiago)
    const now = new Date('2024-01-15T12:00:00Z')
    const min = getMinBookingDateTime(now, 2, 'America/Santiago')
    expect(toSantiagoDate(min)).toBe('2024-01-17') // miércoles
  })

  it('hoy jueves → mínimo lunes siguiente', () => {
    // now = jueves 18 ene 2024
    const now = new Date('2024-01-18T12:00:00Z')
    const min = getMinBookingDateTime(now, 2, 'America/Santiago')
    // viernes(1) → sáb/dom skip → lunes(2)
    expect(toSantiagoDate(min)).toBe('2024-01-22')
  })

  it('hoy viernes → mínimo martes siguiente', () => {
    const now = new Date('2024-01-19T12:00:00Z') // viernes 19 ene
    const min = getMinBookingDateTime(now, 2, 'America/Santiago')
    // sáb/dom skip → lunes(1) → martes(2)
    expect(toSantiagoDate(min)).toBe('2024-01-23')
  })

  it('hoy sábado → mínimo martes siguiente', () => {
    const now = new Date('2024-01-20T12:00:00Z') // sábado 20 ene
    const min = getMinBookingDateTime(now, 2, 'America/Santiago')
    // dom skip → lunes(1) → martes(2)
    expect(toSantiagoDate(min)).toBe('2024-01-23')
  })

  it('hoy domingo → mínimo martes siguiente', () => {
    const now = new Date('2024-01-21T12:00:00Z') // domingo 21 ene
    const min = getMinBookingDateTime(now, 2, 'America/Santiago')
    // lunes(1) → martes(2)
    expect(toSantiagoDate(min)).toBe('2024-01-23')
  })

  it('retorna el inicio del día (00:00:00) en Santiago', () => {
    const now = new Date('2024-01-15T12:00:00Z') // lunes
    const min = getMinBookingDateTime(now, 2, 'America/Santiago')
    // Debe ser las 00:00:00 Santiago (= 03:00 UTC en verano UTC-3)
    expect(toSantiagoHHMM(min)).toBe('00:00')
  })

  it('minAdvanceBusinessDays=1 → mañana si mañana es hábil', () => {
    const now = new Date('2024-01-15T12:00:00Z') // lunes
    const min = getMinBookingDateTime(now, 1, 'America/Santiago')
    expect(toSantiagoDate(min)).toBe('2024-01-16') // martes
  })
})

// ─── getMaxBookingDateTime ───────────────────────────────────────────────────

describe('getMaxBookingDateTime', () => {
  it('bookingWindowWeeks: 4 → exactamente 28 días después en Santiago', () => {
    const now = new Date('2024-01-15T12:00:00Z') // lunes 15 enero
    const max = getMaxBookingDateTime(now, 4, 'America/Santiago')
    // 15 ene + 28 días = 12 feb
    expect(toSantiagoDate(max)).toBe('2024-02-12')
  })

  it('bookingWindowWeeks: 2 → 14 días después', () => {
    const now = new Date('2024-01-15T12:00:00Z')
    const max = getMaxBookingDateTime(now, 2, 'America/Santiago')
    expect(toSantiagoDate(max)).toBe('2024-01-29')
  })

  it('retorna el final del día (23:59) en Santiago', () => {
    const now = new Date('2024-01-15T12:00:00Z')
    const max = getMaxBookingDateTime(now, 4, 'America/Santiago')
    expect(toSantiagoHHMM(max)).toBe('23:59')
  })

  it('max > min siempre que bookingWindowWeeks >= 1', () => {
    const now = new Date('2024-01-15T12:00:00Z')
    const min = getMinBookingDateTime(now, 2, 'America/Santiago')
    const max = getMaxBookingDateTime(now, 1, 'America/Santiago')
    expect(max.getTime()).toBeGreaterThan(min.getTime())
  })
})

// ─── generateDaySlots con buffer ────────────────────────────────────────────

describe('generateDaySlots con bufferMinutes', () => {
  it('buffer=0 → slots cada 60 min, en horas cerradas (10 slots de 45 min)', () => {
    const slots = generateDaySlots(MONDAY_JAN_15, SCHEDULE_MON_FRI, 45, 0)
    expect(slots).toHaveLength(10)
    expect(toSantiagoHHMM(slots[0].startDateTime)).toBe('09:00')
    expect(toSantiagoHHMM(slots[1].startDateTime)).toBe('10:00')
  })

  it('sesión 45min + buffer 15min → siguiente slot a los 60min', () => {
    const slots = generateDaySlots(MONDAY_JAN_15, SCHEDULE_MON_FRI, 45, 15)
    // Intervalo = 60 min → 09:00, 10:00, 11:00...
    expect(toSantiagoHHMM(slots[0].startDateTime)).toBe('09:00')
    expect(toSantiagoHHMM(slots[1].startDateTime)).toBe('10:00')
    expect(toSantiagoHHMM(slots[2].startDateTime)).toBe('11:00')
  })

  it('sesión 45min + buffer 15min → 10 slots en 09:00-19:00', () => {
    // 600 min / 60 min = 10 slots
    const slots = generateDaySlots(MONDAY_JAN_15, SCHEDULE_MON_FRI, 45, 15)
    expect(slots).toHaveLength(10)
  })

  it('cada slot dura sólo la duración del servicio (sin incluir el buffer)', () => {
    const slots = generateDaySlots(MONDAY_JAN_15, SCHEDULE_MON_FRI, 45, 15)
    slots.forEach(slot => {
      const durationMin = (slot.endDateTime.getTime() - slot.startDateTime.getTime()) / 60000
      expect(durationMin).toBe(45)
    })
  })

  it('sesión 60min + buffer 30min → 9 slots en 09:00-19:00 (incrementos de 60 min)', () => {
    // Cada slot avanza 60 min; válido si start + 60 + 30 <= 19:00 → start <= 17:00
    // Slots: 09:00, 10:00, 11:00, 12:00, 13:00, 14:00, 15:00, 16:00, 17:00
    const slots = generateDaySlots(MONDAY_JAN_15, SCHEDULE_MON_FRI, 60, 30)
    expect(slots).toHaveLength(9)
    expect(toSantiagoHHMM(slots[0].startDateTime)).toBe('09:00')
    expect(toSantiagoHHMM(slots[1].startDateTime)).toBe('10:00')
    expect(toSantiagoHHMM(slots[slots.length - 1].startDateTime)).toBe('17:00')
  })
})

// ─── getAvailableSlots con config ────────────────────────────────────────────

describe('getAvailableSlots con ProfessionalConfig', () => {
  // now fijo para todos los tests de esta sección
  // now = lunes 15 ene 2024 → min = miércoles 17 ene, max = lunes 12 feb (con defaults)
  const NOW = new Date('2024-01-15T12:00:00Z')

  it('usa buffer del servicio si está definido (sobreescribe el global)', () => {
    const serviceWithBuffer: Service = { ...SERVICE_45, bufferMinutes: 15 }
    const config: ProfessionalConfig = { ...DEFAULT_CONFIG, defaultBufferMinutes: 30 }

    // buffer efectivo = 15 (del servicio), no 30 (del global)
    // intervalo = 45+15=60 → 10 slots
    const wednesday = new Date('2024-01-17T12:00:00Z')
    const slots = getAvailableSlots(wednesday, serviceWithBuffer, config, SCHEDULE_MON_FRI, [], [], NOW)
    expect(slots).toHaveLength(10)
    expect(toSantiagoHHMM(slots[1].startDateTime)).toBe('10:00') // gap de 60 min
  })

  it('usa buffer global cuando el servicio no tiene bufferMinutes', () => {
    const config: ProfessionalConfig = { ...DEFAULT_CONFIG, defaultBufferMinutes: 15 }
    // SERVICE_45 no tiene bufferMinutes → usa 15 del config → intervalo 60 min → 10 slots
    const wednesday = new Date('2024-01-17T12:00:00Z')
    const slots = getAvailableSlots(wednesday, SERVICE_45, config, SCHEDULE_MON_FRI, [], [], NOW)
    expect(slots).toHaveLength(10)
  })

  it('sin buffer (defaultBufferMinutes=0) → 10 slots de 45 min en horas cerradas', () => {
    const wednesday = new Date('2024-01-17T12:00:00Z')
    const slots = getAvailableSlots(wednesday, SERVICE_45, DEFAULT_CONFIG, SCHEDULE_MON_FRI, [], [], NOW)
    expect(slots).toHaveLength(10)
  })

  it('slot antes del mínimo → no disponible (día completo bloqueado por ventana)', () => {
    // now = lunes 15 → min = miércoles 17
    // querying martes 16 (antes del mínimo)
    const tuesday = new Date('2024-01-16T12:00:00Z')
    const slots = getAvailableSlots(tuesday, SERVICE_45, DEFAULT_CONFIG, SCHEDULE_MON_FRI, [], [], NOW)
    expect(slots).toHaveLength(0)
  })

  it('slot después del máximo → no disponible', () => {
    // now = lunes 15 → max = 12 feb (4 semanas = 28 días)
    // querying 13 feb (un día después del máximo)
    const afterMax = new Date('2024-02-13T12:00:00Z') // martes 13 feb
    const slots = getAvailableSlots(afterMax, SERVICE_45, DEFAULT_CONFIG, SCHEDULE_MON_FRI, [], [], NOW)
    expect(slots).toHaveLength(0)
  })

  it('slot dentro de la ventana → disponible si no bloqueado', () => {
    // now = lunes 15 → min = miércoles 17, max = 12 feb
    // querying miércoles 24 enero (dentro del rango)
    const wednesday24 = new Date('2024-01-24T12:00:00Z')
    const slots = getAvailableSlots(wednesday24, SERVICE_45, DEFAULT_CONFIG, SCHEDULE_MON_FRI, [], [], NOW)
    expect(slots.length).toBeGreaterThan(0)
    expect(slots.every(s => s.isAvailable)).toBe(true)
  })

  it('el día exacto del mínimo (miércoles 17) está disponible', () => {
    const minDay = new Date('2024-01-17T12:00:00Z')
    const slots = getAvailableSlots(minDay, SERVICE_45, DEFAULT_CONFIG, SCHEDULE_MON_FRI, [], [], NOW)
    expect(slots.length).toBeGreaterThan(0)
  })

  it('el día exacto del máximo (12 feb) está disponible', () => {
    const maxDay = new Date('2024-02-12T12:00:00Z') // lunes
    const slots = getAvailableSlots(maxDay, SERVICE_45, DEFAULT_CONFIG, SCHEDULE_MON_FRI, [], [], NOW)
    expect(slots.length).toBeGreaterThan(0)
  })

  it('combina ventana + bloqueo + cita correctamente', () => {
    const day = new Date('2024-01-17T12:00:00Z') // miércoles 17, dentro del rango

    // Bloqueo de 09:00 a 09:45 → primer slot bloqueado
    const block = makeBlock(
      makeSantiagoDate('2024-01-17', '09:00').toISOString(),
      makeSantiagoDate('2024-01-17', '09:45').toISOString(),
    )

    // Cita de 09:45 a 10:30 → segundo slot ocupado
    const apt = makeAppointment(
      makeSantiagoDate('2024-01-17', '09:45'),
      makeSantiagoDate('2024-01-17', '10:30'),
    )

    const slots = getAvailableSlots(day, SERVICE_45, DEFAULT_CONFIG, SCHEDULE_MON_FRI, [block], [apt], NOW)
    const times = slots.map(s => toSantiagoHHMM(s.startDateTime))

    expect(times).not.toContain('09:00') // bloqueado
    expect(times).not.toContain('10:00') // ocupado por cita
    expect(times).toContain('11:00')     // libre y dentro del rango
  })

  it('sin now explícito usa new Date() internamente (smoke test)', () => {
    // Sólo verifica que no lanza excepción; el resultado depende del tiempo real
    const day = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000) // +10 días
    expect(() =>
      getAvailableSlots(day, SERVICE_45, DEFAULT_CONFIG, SCHEDULE_MON_FRI, [], []),
    ).not.toThrow()
  })
})

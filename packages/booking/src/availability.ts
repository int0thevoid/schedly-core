import type { Appointment, ProfessionalConfig, ScheduleBlock, Service, TimeSlot, WeeklySchedule } from './types'
import { DEFAULT_PROFESSIONAL_CONFIG } from './types'

const TIMEZONE = 'America/Santiago'

// ─── Helpers de timezone ──────────────────────────────────────────────────────

/**
 * Convierte año/mes/día/hora/minuto expresados en hora local de `timezone` a un Date UTC.
 *
 * Algoritmo: crea una fecha "ficticia" en UTC con los mismos dígitos que la hora
 * local, mide cuánto difiere el reloj de la zona horaria respecto a UTC y aplica
 * la corrección. Funciona correctamente con DST.
 */
function toUTC(year: number, month: number, day: number, hour: number, minute: number, timezone: string): Date {
  const fakeUTC = new Date(Date.UTC(year, month - 1, day, hour, minute, 0))

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(fakeUTC)

  const get = (type: string) => {
    const val = Number(parts.find(p => p.type === type)!.value)
    return type === 'hour' && val === 24 ? 0 : val
  }

  const localAsUTC = new Date(Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second')))
  return new Date(fakeUTC.getTime() + (fakeUTC.getTime() - localAsUTC.getTime()))
}

/** Día de la semana (0=domingo) de `date` en la zona horaria indicada. */
function dayOfWeekInZone(date: Date, timezone: string): 0 | 1 | 2 | 3 | 4 | 5 | 6 {
  const [year, month, day] = new Intl.DateTimeFormat('sv-SE', { timeZone: timezone })
    .format(date)
    .split('-')
    .map(Number)
  // Mediodía UTC para que el día de la semana no cambie por el offset horario
  return new Date(Date.UTC(year, month - 1, day, 12)).getUTCDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6
}

/** Inicio del día (00:00:00 local) en `timezone`, devuelto como Date UTC. */
function startOfDayInZone(date: Date, timezone: string): Date {
  const [year, month, day] = new Intl.DateTimeFormat('sv-SE', { timeZone: timezone })
    .format(date)
    .split('-')
    .map(Number)
  return toUTC(year, month, day, 0, 0, timezone)
}

/** Proyecta la hora-minuto de `reference` sobre la fecha de `targetDate`, en `timezone`. */
function projectTimeOnDate(reference: Date, targetDate: Date, timezone: string): Date {
  const p = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(reference)

  let hour = Number(p.find(x => x.type === 'hour')!.value)
  const minute = Number(p.find(x => x.type === 'minute')!.value)
  if (hour === 24) hour = 0

  const [year, month, day] = new Intl.DateTimeFormat('sv-SE', { timeZone: timezone })
    .format(targetDate)
    .split('-')
    .map(Number)

  return toUTC(year, month, day, hour, minute, timezone)
}

/** Convierte "HH:mm" al Date UTC correspondiente al día de `date` en `timezone`. */
function timeStrToUTC(date: Date, timeStr: string, timezone: string): Date {
  const [hour, minute] = timeStr.split(':').map(Number)
  const [year, month, day] = new Intl.DateTimeFormat('sv-SE', { timeZone: timezone })
    .format(date)
    .split('-')
    .map(Number)
  return toUTC(year, month, day, hour, minute, timezone)
}

// Wrappers fijos para America/Santiago (compatibilidad con código existente)
const dayOfWeekInSantiago = (date: Date) => dayOfWeekInZone(date, TIMEZONE)
const startOfDayInSantiago = (date: Date) => startOfDayInZone(date, TIMEZONE)

// ─── Funciones públicas ───────────────────────────────────────────────────────

/**
 * Genera los slots del día según el horario semanal.
 *
 * Los slots se separan por `serviceDuration + bufferMinutes` minutos (intervalo),
 * pero cada slot dura sólo `serviceDuration` minutos. Si `bufferMinutes` es 0
 * (por defecto), el comportamiento es idéntico al original.
 */
export function generateDaySlots(
  date: Date,
  weeklySchedule: WeeklySchedule[],
  serviceDuration: number,
  bufferMinutes: number = 0,
): TimeSlot[] {
  const dow = dayOfWeekInSantiago(date)
  const schedule = weeklySchedule.find(s => s.dayOfWeek === dow)
  if (!schedule) return []

  const start = timeStrToUTC(date, schedule.startTime, TIMEZONE)
  const end = timeStrToUTC(date, schedule.endTime, TIMEZONE)
  const durationMs = serviceDuration * 60 * 1000
  const intervalMs = (serviceDuration + bufferMinutes) * 60 * 1000

  const slots: TimeSlot[] = []
  let cursor = start.getTime()

  while (cursor + durationMs <= end.getTime()) {
    slots.push({
      startDateTime: new Date(cursor),
      endDateTime: new Date(cursor + durationMs),
      isAvailable: true,
    })
    cursor += intervalMs
  }

  return slots
}

/**
 * Calcula el Date mínimo a partir del cual se puede agendar, contando
 * `minAdvanceBusinessDays` días hábiles (lunes–viernes) desde `now`.
 * Devuelve el inicio (00:00:00) de ese día hábil en `timezone`.
 *
 * Ejemplos con minAdvanceBusinessDays=2:
 *   lunes    → miércoles
 *   jueves   → lunes siguiente
 *   viernes  → martes siguiente
 *   sábado   → martes siguiente
 *   domingo  → martes siguiente
 */
export function getMinBookingDateTime(now: Date, minAdvanceBusinessDays: number, timezone: string): Date {
  // Inicio de hoy en la zona horaria indicada
  const todayStr = new Intl.DateTimeFormat('sv-SE', { timeZone: timezone }).format(now)
  const [y, mo, d] = todayStr.split('-').map(Number)

  // Arrancamos desde mañana (el primer candidato siempre es el día siguiente)
  let cursor = new Date(toUTC(y, mo, d, 0, 0, timezone).getTime() + 24 * 60 * 60 * 1000)

  let counted = 0
  while (counted < minAdvanceBusinessDays) {
    const dow = dayOfWeekInZone(cursor, timezone)
    if (dow >= 1 && dow <= 5) {
      counted++
      if (counted === minAdvanceBusinessDays) break
    }
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000)
  }

  // Devolver el inicio de ese día en la zona horaria
  const dateStr = new Intl.DateTimeFormat('sv-SE', { timeZone: timezone }).format(cursor)
  const [ty, tmo, td] = dateStr.split('-').map(Number)
  return toUTC(ty, tmo, td, 0, 0, timezone)
}

/**
 * Calcula el Date máximo hasta el cual se puede agendar:
 * `bookingWindowWeeks` semanas exactas desde `now`, al final del día (23:59)
 * en `timezone`.
 */
export function getMaxBookingDateTime(now: Date, bookingWindowWeeks: number, timezone: string): Date {
  const maxMs = now.getTime() + bookingWindowWeeks * 7 * 24 * 60 * 60 * 1000
  const maxDate = new Date(maxMs)
  const dateStr = new Intl.DateTimeFormat('sv-SE', { timeZone: timezone }).format(maxDate)
  const [y, mo, d] = dateStr.split('-').map(Number)
  return toUTC(y, mo, d, 23, 59, timezone)
}

/**
 * Verifica si un bloqueo (recurrente o no) aplica a la fecha del slot.
 */
export function doesBlockApplyToDate(block: ScheduleBlock, date: Date): boolean {
  const blockStartDay = startOfDayInSantiago(block.startDateTime)
  const targetDay = startOfDayInSantiago(date)

  if (targetDay < blockStartDay) return false

  if (!block.recurrence) {
    return blockStartDay.getTime() === targetDay.getTime()
  }

  if (block.recurrence.endDate) {
    const endDay = startOfDayInSantiago(block.recurrence.endDate)
    if (targetDay > endDay) return false
  }

  switch (block.recurrence.type) {
    case 'daily':
      return true

    case 'weekdays': {
      const dow = dayOfWeekInSantiago(date)
      return dow >= 1 && dow <= 5
    }

    case 'weekly':
      return dayOfWeekInSantiago(block.startDateTime) === dayOfWeekInSantiago(date)

    case 'monthly': {
      const blockDay = Number(
        new Intl.DateTimeFormat('sv-SE', { timeZone: TIMEZONE }).format(block.startDateTime).split('-')[2],
      )
      const targetDay2 = Number(
        new Intl.DateTimeFormat('sv-SE', { timeZone: TIMEZONE }).format(date).split('-')[2],
      )
      return blockDay === targetDay2
    }
  }
}

/**
 * Marca como no disponibles los slots que se solapan con algún bloqueo.
 * Para bloqueos recurrentes proyecta la ventana horaria sobre la fecha del slot.
 */
export function filterBlockedSlots(slots: TimeSlot[], blocks: ScheduleBlock[]): TimeSlot[] {
  return slots.map(slot => {
    const isBlocked = blocks.some(block => {
      if (!doesBlockApplyToDate(block, slot.startDateTime)) return false

      if (!block.recurrence) {
        return slot.startDateTime < block.endDateTime && slot.endDateTime > block.startDateTime
      }

      const blockStart = projectTimeOnDate(block.startDateTime, slot.startDateTime, TIMEZONE)
      const blockEnd = projectTimeOnDate(block.endDateTime, slot.startDateTime, TIMEZONE)
      return slot.startDateTime < blockEnd && slot.endDateTime > blockStart
    })

    return isBlocked ? { ...slot, isAvailable: false } : slot
  })
}

/**
 * Marca como no disponibles los slots solapados con citas activas (no canceladas).
 */
export function filterOccupiedSlots(slots: TimeSlot[], appointments: Appointment[]): TimeSlot[] {
  const active = appointments.filter(a => a.status !== 'cancelled')
  return slots.map(slot => {
    const isOccupied = active.some(
      apt => slot.startDateTime < apt.endDateTime && slot.endDateTime > apt.startDateTime,
    )
    return isOccupied ? { ...slot, isAvailable: false } : slot
  })
}

// ─── getAvailableSlots (overloaded) ──────────────────────────────────────────

/**
 * Firma original — sin config, sin buffer, sin ventana de agendamiento.
 * Todos los 34 tests anteriores usan esta firma.
 */
export function getAvailableSlots(
  date: Date,
  service: Service,
  weeklySchedule: WeeklySchedule[],
  blocks: ScheduleBlock[],
  appointments: Appointment[],
): TimeSlot[]

/**
 * Firma con config — aplica buffer, ventana mínima y máxima de agendamiento.
 * `now` permite inyectar el momento actual en tests; por defecto usa `new Date()`.
 */
export function getAvailableSlots(
  date: Date,
  service: Service,
  config: ProfessionalConfig,
  weeklySchedule: WeeklySchedule[],
  blocks: ScheduleBlock[],
  appointments: Appointment[],
  now?: Date,
): TimeSlot[]

export function getAvailableSlots(
  date: Date,
  service: Service,
  thirdArg: ProfessionalConfig | WeeklySchedule[],
  fourthArg: WeeklySchedule[] | ScheduleBlock[] = [],
  fifthArg: ScheduleBlock[] | Appointment[] = [],
  sixthArg: Appointment[] | Date | undefined = [],
  seventhArg?: Date,
): TimeSlot[] {
  if (Array.isArray(thirdArg)) {
    // ── Firma original ─────────────────────────────────────────────────────
    const weeklySchedule = thirdArg
    const blocks = fourthArg as ScheduleBlock[]
    const appointments = fifthArg as Appointment[]

    const relevant = weeklySchedule.filter(s => !s.serviceIds || s.serviceIds.length === 0 || s.serviceIds.includes(service.id))
    const slots = generateDaySlots(date, relevant, service.duration)
    return filterOccupiedSlots(filterBlockedSlots(slots, blocks), appointments).filter(s => s.isAvailable)
  }

  // ── Firma con config ─────────────────────────────────────────────────────
  const config = thirdArg
  const weeklySchedule = fourthArg as WeeklySchedule[]
  const blocks = fifthArg as ScheduleBlock[]
  const appointments = (Array.isArray(sixthArg) ? sixthArg : []) as Appointment[]
  const now = (seventhArg ?? (sixthArg instanceof Date ? sixthArg : new Date()))

  const buffer = service.bufferMinutes ?? config.defaultBufferMinutes
  const relevant = weeklySchedule.filter(s => !s.serviceIds || s.serviceIds.length === 0 || s.serviceIds.includes(service.id))
  const slots = generateDaySlots(date, relevant, service.duration, buffer)

  const minDT = getMinBookingDateTime(now, config.minAdvanceBusinessDays, config.timezone)
  const maxDT = getMaxBookingDateTime(now, config.bookingWindowWeeks, config.timezone)

  const inWindow = slots.map(slot =>
    slot.startDateTime >= minDT && slot.endDateTime <= maxDT
      ? slot
      : { ...slot, isAvailable: false },
  )

  return filterOccupiedSlots(filterBlockedSlots(inWindow, blocks), appointments).filter(s => s.isAvailable)
}

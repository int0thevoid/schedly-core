import type { Appointment, ScheduleBlock, Service, TimeSlot, WeeklySchedule } from './types'

const TIMEZONE = 'America/Santiago'

// ─── Helpers de timezone ──────────────────────────────────────────────────────

/**
 * Convierte un año/mes/día/hora/minuto expresados en `timezone` local a un Date UTC.
 *
 * Algoritmo: crea una fecha "ficticia" en UTC con los mismos dígitos que la hora
 * local, luego mide cuánto difiere el reloj de Santiago de UTC en ese instante, y
 * aplica la corrección. Funciona correctamente con DST.
 */
function toUTC(year: number, month: number, day: number, hour: number, minute: number, timezone: string): Date {
  const fakeUTC = new Date(Date.UTC(year, month - 1, day, hour, minute, 0))

  const localParts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
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

/** Día de la semana (0=domingo) de una fecha según America/Santiago. */
function dayOfWeekInSantiago(date: Date): 0 | 1 | 2 | 3 | 4 | 5 | 6 {
  // sv-SE siempre devuelve "YYYY-MM-DD"
  const [year, month, day] = new Intl.DateTimeFormat('sv-SE', { timeZone: TIMEZONE })
    .format(date)
    .split('-')
    .map(Number)
  // Usar mediodía UTC para que el día de la semana no cambie por zona horaria
  return new Date(Date.UTC(year, month - 1, day, 12)).getUTCDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6
}

/** Inicio del día en America/Santiago (00:00:00 Santiago como Date UTC). */
function startOfDayInSantiago(date: Date): Date {
  const [year, month, day] = new Intl.DateTimeFormat('sv-SE', { timeZone: TIMEZONE })
    .format(date)
    .split('-')
    .map(Number)
  return toUTC(year, month, day, 0, 0, TIMEZONE)
}

/** Crea un Date con la misma hora-minuto de `reference` proyectada sobre `targetDate`, en Santiago. */
function projectTimeOnDate(reference: Date, targetDate: Date): Date {
  const timeParts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(reference)

  let hour = Number(timeParts.find(p => p.type === 'hour')!.value)
  const minute = Number(timeParts.find(p => p.type === 'minute')!.value)
  if (hour === 24) hour = 0

  const [year, month, day] = new Intl.DateTimeFormat('sv-SE', { timeZone: TIMEZONE })
    .format(targetDate)
    .split('-')
    .map(Number)

  return toUTC(year, month, day, hour, minute, TIMEZONE)
}

/** Convierte "HH:mm" en un Date UTC en la fecha de `date`, según Santiago. */
function timeStrToUTC(date: Date, timeStr: string): Date {
  const [hour, minute] = timeStr.split(':').map(Number)
  const [year, month, day] = new Intl.DateTimeFormat('sv-SE', { timeZone: TIMEZONE })
    .format(date)
    .split('-')
    .map(Number)
  return toUTC(year, month, day, hour, minute, TIMEZONE)
}

// ─── Funciones públicas ───────────────────────────────────────────────────────

/**
 * Genera todos los slots del día según el horario semanal.
 * Los slots se generan en intervalos de `serviceDuration` minutos.
 * Sólo se incluyen los slots que terminan a más tardar en `endTime`.
 */
export function generateDaySlots(
  date: Date,
  weeklySchedule: WeeklySchedule[],
  serviceDuration: number,
): TimeSlot[] {
  const dow = dayOfWeekInSantiago(date)
  const schedule = weeklySchedule.find(s => s.dayOfWeek === dow)
  if (!schedule) return []

  const start = timeStrToUTC(date, schedule.startTime)
  const end = timeStrToUTC(date, schedule.endTime)
  const durationMs = serviceDuration * 60 * 1000

  const slots: TimeSlot[] = []
  let cursor = start.getTime()

  while (cursor + durationMs <= end.getTime()) {
    slots.push({
      startDateTime: new Date(cursor),
      endDateTime: new Date(cursor + durationMs),
      isAvailable: true,
    })
    cursor += durationMs
  }

  return slots
}

/**
 * Verifica si un bloqueo (recurrente o no) aplica a la fecha del slot.
 */
export function doesBlockApplyToDate(block: ScheduleBlock, date: Date): boolean {
  const blockStartDay = startOfDayInSantiago(block.startDateTime)
  const targetDay = startOfDayInSantiago(date)

  if (targetDay < blockStartDay) return false

  if (!block.recurrence) {
    // Bloqueo puntual: compara sólo la fecha (no la hora)
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
      const blockDateStr = new Intl.DateTimeFormat('sv-SE', { timeZone: TIMEZONE }).format(block.startDateTime)
      const targetDateStr = new Intl.DateTimeFormat('sv-SE', { timeZone: TIMEZONE }).format(date)
      return Number(blockDateStr.split('-')[2]) === Number(targetDateStr.split('-')[2])
    }
  }
}

/**
 * Marca como no disponibles los slots que se solapan con algún bloqueo.
 * Para bloques recurrentes, la ventana de tiempo del bloqueo se proyecta
 * sobre la fecha del slot.
 */
export function filterBlockedSlots(slots: TimeSlot[], blocks: ScheduleBlock[]): TimeSlot[] {
  return slots.map(slot => {
    const isBlocked = blocks.some(block => {
      if (!doesBlockApplyToDate(block, slot.startDateTime)) return false

      if (!block.recurrence) {
        return slot.startDateTime < block.endDateTime && slot.endDateTime > block.startDateTime
      }

      // Proyectar la ventana del bloqueo sobre la fecha del slot
      const blockStart = projectTimeOnDate(block.startDateTime, slot.startDateTime)
      const blockEnd = projectTimeOnDate(block.endDateTime, slot.startDateTime)
      return slot.startDateTime < blockEnd && slot.endDateTime > blockStart
    })

    return isBlocked ? { ...slot, isAvailable: false } : slot
  })
}

/**
 * Marca como no disponibles los slots que se solapan con citas existentes
 * (excepto las canceladas).
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

/**
 * Retorna únicamente los slots disponibles para un día, servicio y configuración dados.
 */
export function getAvailableSlots(
  date: Date,
  service: Service,
  weeklySchedule: WeeklySchedule[],
  blocks: ScheduleBlock[],
  appointments: Appointment[],
): TimeSlot[] {
  // Filtrar horarios que aplican a este servicio
  const relevantSchedule = weeklySchedule.filter(
    s => !s.serviceIds || s.serviceIds.includes(service.id),
  )

  const slots = generateDaySlots(date, relevantSchedule, service.duration)
  const afterBlocks = filterBlockedSlots(slots, blocks)
  const afterAppointments = filterOccupiedSlots(afterBlocks, appointments)

  return afterAppointments.filter(s => s.isAvailable)
}

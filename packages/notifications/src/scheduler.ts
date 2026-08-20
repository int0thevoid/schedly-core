const TWO_HOURS_MS = 2 * 60 * 60 * 1000
const ACTIVE_STATUSES = ['pending', 'confirmed']

/** Forma mínima de una cita necesaria para calcular recordatorios, sin depender de los tipos generados de Prisma. */
export interface AppointmentForReminder {
  id: string
  startDateTime: Date
  status: string
  reminderSentAt: Date | null
}

export type ReminderTiming = 'day_before' | 'same_day'

export interface AppointmentNeedingReminder {
  appointment: AppointmentForReminder
  timing: ReminderTiming
}

export interface AppointmentsNeedingReminder {
  reminder: AppointmentNeedingReminder[]
}

interface LocalDateParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
}

function getLocalDateParts(date: Date, timezone: string): LocalDateParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date)

  const get = (type: string): number => Number(parts.find(p => p.type === type)?.value ?? 0)
  const hour = get('hour')

  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: hour === 24 ? 0 : hour,
    minute: get('minute'),
  }
}

function isSameLocalDay(a: Date, b: Date, timezone: string): boolean {
  const pa = getLocalDateParts(a, timezone)
  const pb = getLocalDateParts(b, timezone)
  return pa.year === pb.year && pa.month === pb.month && pa.day === pb.day
}

/** true si `a` cae en el día calendario inmediatamente siguiente a `b`, según `timezone`. */
function isNextLocalDay(a: Date, b: Date, timezone: string): boolean {
  const pb = getLocalDateParts(b, timezone)
  const nextDay = new Date(Date.UTC(pb.year, pb.month - 1, pb.day + 1))
  const pa = getLocalDateParts(a, timezone)
  return pa.year === nextDay.getUTCFullYear() && pa.month === nextDay.getUTCMonth() + 1 && pa.day === nextDay.getUTCDate()
}

/**
 * Determina qué citas necesitan el recordatorio único en este momento, según `now` y `timezone`.
 * Es un solo recordatorio por cita (no varios), con dos ventanas posibles de disparo:
 * - `day_before`: a partir de las 10:00 del día calendario anterior a la cita.
 * - `same_day`: dentro de las 2 horas previas al inicio, para citas cuyo día calendario es hoy —
 *   cubre tanto las agendadas el mismo día (nunca tuvieron ventana de "día anterior") como una red
 *   de seguridad si por algún motivo la ventana de "día anterior" no llegó a dispararse.
 */
export function getAppointmentsNeedingReminder(
  appointments: AppointmentForReminder[],
  now: Date,
  timezone: string
): AppointmentsNeedingReminder {
  const reminder: AppointmentNeedingReminder[] = []
  const nowParts = getLocalDateParts(now, timezone)

  for (const appointment of appointments) {
    if (!ACTIVE_STATUSES.includes(appointment.status)) continue
    if (appointment.reminderSentAt !== null) continue

    const msUntilStart = appointment.startDateTime.getTime() - now.getTime()

    const dayBeforeWindowOpen = nowParts.hour >= 10 && isNextLocalDay(appointment.startDateTime, now, timezone)
    const sameDayWindowOpen = isSameLocalDay(appointment.startDateTime, now, timezone) && msUntilStart > 0 && msUntilStart <= TWO_HOURS_MS

    if (dayBeforeWindowOpen) {
      reminder.push({ appointment, timing: 'day_before' })
    } else if (sameDayWindowOpen) {
      reminder.push({ appointment, timing: 'same_day' })
    }
  }

  return { reminder }
}

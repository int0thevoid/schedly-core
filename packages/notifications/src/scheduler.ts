const TWO_HOURS_MS = 2 * 60 * 60 * 1000
const ACTIVE_STATUSES = ['pending', 'confirmed']

/** Forma mínima de una cita necesaria para calcular recordatorios, sin depender de los tipos generados de Prisma. */
export interface AppointmentForReminder {
  id: string
  startDateTime: Date
  status: string
  paymentStatus: string
  reminderSentAt: Date | null
  reminder2hSentAt: Date | null
  paymentReminderSentAt: Date | null
}

export interface AppointmentsNeedingReminder {
  reminder24h: AppointmentForReminder[]
  reminder2h: AppointmentForReminder[]
  paymentReminder: AppointmentForReminder[]
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
 * Determina qué citas necesitan recordatorios en este momento, según `now` y `timezone`.
 * - reminder24h: citas de mañana (calendario local) sin recordatorio 24h enviado.
 * - reminder2h: citas que empiezan dentro de las próximas 2 horas sin recordatorio enviado.
 * - paymentReminder: citas sin pago, a las 10:00 del día anterior o a las 20:00 del mismo día,
 *   sin haber enviado ya un recordatorio de pago ese mismo día.
 */
export function getAppointmentsNeedingReminder(
  appointments: AppointmentForReminder[],
  now: Date,
  timezone: string
): AppointmentsNeedingReminder {
  const reminder24h: AppointmentForReminder[] = []
  const reminder2h: AppointmentForReminder[] = []
  const paymentReminder: AppointmentForReminder[] = []

  const nowParts = getLocalDateParts(now, timezone)

  for (const appointment of appointments) {
    if (!ACTIVE_STATUSES.includes(appointment.status)) continue

    const msUntilStart = appointment.startDateTime.getTime() - now.getTime()

    if (appointment.reminderSentAt === null && isNextLocalDay(appointment.startDateTime, now, timezone)) {
      reminder24h.push(appointment)
    }

    if (appointment.reminder2hSentAt === null && msUntilStart > 0 && msUntilStart <= TWO_HOURS_MS) {
      reminder2h.push(appointment)
    }

    if (appointment.paymentStatus === 'unpaid') {
      const dayBeforeWindowOpen = nowParts.hour >= 10 && isNextLocalDay(appointment.startDateTime, now, timezone)
      const sameDayWindowOpen = nowParts.hour >= 20 && isSameLocalDay(appointment.startDateTime, now, timezone)
      const alreadySentToday =
        appointment.paymentReminderSentAt !== null && isSameLocalDay(appointment.paymentReminderSentAt, now, timezone)

      if ((dayBeforeWindowOpen || sameDayWindowOpen) && !alreadySentToday) {
        paymentReminder.push(appointment)
      }
    }
  }

  return { reminder24h, reminder2h, paymentReminder }
}

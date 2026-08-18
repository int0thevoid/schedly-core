/** Retorna la fecha actual (YYYY-MM-DD) en la zona horaria indicada. */
export function todayInTZ(tz: string): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: tz })
}

/** Retorna la fecha (YYYY-MM-DD) de un instante dado, en la zona horaria indicada. */
export function dateKeyInTZ(date: Date, tz: string): string {
  return date.toLocaleDateString('en-CA', { timeZone: tz })
}

/** Suma (o resta) días a una fecha YYYY-MM-DD, sin depender de zona horaria. */
export function addDaysToDateStr(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

/** Calcula el rango UTC [gte, lte] correspondiente al día `dateStr` en la zona horaria indicada. */
export function dayRangeInTZ(dateStr: string, tz: string): { gte: Date; lte: Date } {
  // Use noon as reference to avoid DST edge cases when computing the UTC offset
  const ref = new Date(`${dateStr}T12:00:00Z`)
  const localNoon = new Date(
    ref.toLocaleString('en-US', {
      timeZone: tz,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }),
  )
  const offsetMs = ref.getTime() - localNoon.getTime()
  return {
    gte: new Date(new Date(`${dateStr}T00:00:00Z`).getTime() + offsetMs),
    lte: new Date(new Date(`${dateStr}T23:59:59.999Z`).getTime() + offsetMs),
  }
}

/** Retorna la hora actual en minutos desde medianoche (0-1439) en la zona horaria indicada. */
export function nowMinutesInTZ(tz: string): number {
  const formatted = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date())
  const [hours, minutes] = formatted.split(':').map(Number)
  return hours * 60 + minutes
}

/** Convierte una hora "HH:MM" a minutos desde medianoche. */
export function timeStrToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

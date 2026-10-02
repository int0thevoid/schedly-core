import { afterEach, describe, expect, it } from 'vitest'
import { dayRangeInTZ } from '../lib/date.js'

const ORIGINAL_TZ = process.env.TZ

describe('dayRangeInTZ', () => {
  afterEach(() => {
    process.env.TZ = ORIGINAL_TZ
  })

  it.each(['UTC', 'America/Santiago', 'Asia/Tokyo'])('no depende de la zona horaria del proceso (%s)', (processTz) => {
    process.env.TZ = processTz
    // Octubre: Chile en horario de verano (UTC-3)
    expect(dayRangeInTZ('2026-10-01', 'America/Santiago').gte.toISOString()).toBe('2026-10-01T03:00:00.000Z')
    expect(dayRangeInTZ('2026-10-01', 'America/Santiago').lte.toISOString()).toBe('2026-10-02T02:59:59.999Z')
    // Junio: horario de invierno (UTC-4)
    expect(dayRangeInTZ('2026-06-15', 'America/Santiago').gte.toISOString()).toBe('2026-06-15T04:00:00.000Z')
  })
})

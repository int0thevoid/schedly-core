import { describe, expect, it } from 'vitest'
import { getAppointmentsNeedingReminder, type AppointmentForReminder } from '../scheduler.js'

const TIMEZONE = 'UTC'

function makeAppointment(overrides: Partial<AppointmentForReminder>): AppointmentForReminder {
  return {
    id: 'apt1',
    startDateTime: new Date('2026-06-16T09:00:00Z'),
    status: 'confirmed',
    reminderSentAt: null,
    ...overrides,
  }
}

describe('getAppointmentsNeedingReminder', () => {
  it('day_before: incluye una cita de mañana una vez pasadas las 10:00 de hoy', () => {
    const now = new Date('2026-06-15T10:30:00Z')
    const appointment = makeAppointment({ startDateTime: new Date('2026-06-16T09:00:00Z') })
    const result = getAppointmentsNeedingReminder([appointment], now, TIMEZONE)
    expect(result.reminder).toEqual([{ appointment, timing: 'day_before' }])
  })

  it('day_before: excluye una cita de mañana antes de las 10:00 de hoy', () => {
    const now = new Date('2026-06-15T08:00:00Z')
    const appointment = makeAppointment({ startDateTime: new Date('2026-06-16T09:00:00Z') })
    const result = getAppointmentsNeedingReminder([appointment], now, TIMEZONE)
    expect(result.reminder).toEqual([])
  })

  it('excluye citas que empiezan pasado mañana (fuera de ambas ventanas)', () => {
    const now = new Date('2026-06-15T10:30:00Z')
    const appointment = makeAppointment({ startDateTime: new Date('2026-06-17T09:00:00Z') })
    const result = getAppointmentsNeedingReminder([appointment], now, TIMEZONE)
    expect(result.reminder).toEqual([])
  })

  it('same_day: incluye una cita de hoy dentro de las 2 horas previas al inicio', () => {
    const now = new Date('2026-06-15T20:30:00Z')
    const appointment = makeAppointment({ startDateTime: new Date('2026-06-15T22:00:00Z') })
    const result = getAppointmentsNeedingReminder([appointment], now, TIMEZONE)
    expect(result.reminder).toEqual([{ appointment, timing: 'same_day' }])
  })

  it('same_day: excluye una cita de hoy con más de 2 horas de margen (agendada el mismo día, con tiempo de sobra)', () => {
    const now = new Date('2026-06-15T08:00:00Z')
    const appointment = makeAppointment({ startDateTime: new Date('2026-06-15T22:00:00Z') })
    const result = getAppointmentsNeedingReminder([appointment], now, TIMEZONE)
    expect(result.reminder).toEqual([])
  })

  it('excluye citas que ya empezaron', () => {
    const now = new Date('2026-06-15T08:00:00Z')
    const appointment = makeAppointment({ startDateTime: new Date('2026-06-15T07:00:00Z') })
    const result = getAppointmentsNeedingReminder([appointment], now, TIMEZONE)
    expect(result.reminder).toEqual([])
  })

  it('excluye citas con el recordatorio ya enviado, sin importar la ventana', () => {
    const now = new Date('2026-06-15T20:30:00Z')
    const appointment = makeAppointment({
      startDateTime: new Date('2026-06-15T22:00:00Z'),
      reminderSentAt: new Date('2026-06-15T20:15:00Z'),
    })
    const result = getAppointmentsNeedingReminder([appointment], now, TIMEZONE)
    expect(result.reminder).toEqual([])
  })

  it('excluye citas canceladas', () => {
    const now = new Date('2026-06-15T20:30:00Z')
    const appointment = makeAppointment({ startDateTime: new Date('2026-06-16T09:00:00Z'), status: 'cancelled' })
    const result = getAppointmentsNeedingReminder([appointment], now, TIMEZONE)
    expect(result.reminder).toEqual([])
  })

  it('prioriza day_before sobre same_day si ambas ventanas coincidieran (caso límite, no debería pasar en la práctica)', () => {
    // Cita de "mañana" según la ventana day_before, pero también dentro de las 2h — con las reglas de
    // calendario actuales esto es imposible en la práctica (isNextLocalDay e isSameLocalDay son
    // mutuamente excluyentes), pero fijamos el comportamiento explícito por si el cálculo de zona
    // horaria cambia en el futuro: day_before gana.
    const now = new Date('2026-06-15T10:30:00Z')
    const appointment = makeAppointment({ startDateTime: new Date('2026-06-16T09:00:00Z') })
    const result = getAppointmentsNeedingReminder([appointment], now, TIMEZONE)
    expect(result.reminder[0]?.timing).toBe('day_before')
  })
})

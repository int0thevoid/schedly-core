import { describe, expect, it } from 'vitest'
import { getAppointmentsNeedingReminder, type AppointmentForReminder } from '../scheduler.js'

const TIMEZONE = 'UTC'

function makeAppointment(overrides: Partial<AppointmentForReminder>): AppointmentForReminder {
  return {
    id: 'apt1',
    startDateTime: new Date('2026-06-16T09:00:00Z'),
    status: 'confirmed',
    paymentStatus: 'paid',
    reminderSentAt: null,
    reminder2hSentAt: null,
    paymentReminderSentAt: null,
    ...overrides,
  }
}

describe('getAppointmentsNeedingReminder', () => {
  const NOW = new Date('2026-06-15T08:00:00Z')

  it('includes appointments that start tomorrow without a 24h reminder sent', () => {
    const appointment = makeAppointment({ startDateTime: new Date('2026-06-16T09:00:00Z'), reminderSentAt: null })
    const result = getAppointmentsNeedingReminder([appointment], NOW, TIMEZONE)
    expect(result.reminder24h).toEqual([appointment])
  })

  it('excludes appointments that already had a 24h reminder sent', () => {
    const appointment = makeAppointment({
      startDateTime: new Date('2026-06-16T09:00:00Z'),
      reminderSentAt: new Date('2026-06-15T08:00:00Z'),
    })
    const result = getAppointmentsNeedingReminder([appointment], NOW, TIMEZONE)
    expect(result.reminder24h).toEqual([])
  })

  it('excludes appointments that start the day after tomorrow', () => {
    const appointment = makeAppointment({ startDateTime: new Date('2026-06-17T09:00:00Z') })
    const result = getAppointmentsNeedingReminder([appointment], NOW, TIMEZONE)
    expect(result.reminder24h).toEqual([])
  })

  it('includes appointments starting within the next 2 hours without a 2h reminder sent', () => {
    const appointment = makeAppointment({ startDateTime: new Date('2026-06-15T09:00:00Z'), reminder2hSentAt: null })
    const result = getAppointmentsNeedingReminder([appointment], NOW, TIMEZONE)
    expect(result.reminder2h).toEqual([appointment])
  })

  it('excludes appointments starting in more than 2 hours', () => {
    const appointment = makeAppointment({ startDateTime: new Date('2026-06-15T11:00:00Z'), reminder2hSentAt: null })
    const result = getAppointmentsNeedingReminder([appointment], NOW, TIMEZONE)
    expect(result.reminder2h).toEqual([])
  })

  it('excludes appointments that already started', () => {
    const appointment = makeAppointment({ startDateTime: new Date('2026-06-15T07:00:00Z'), reminder2hSentAt: null })
    const result = getAppointmentsNeedingReminder([appointment], NOW, TIMEZONE)
    expect(result.reminder2h).toEqual([])
  })

  it('excludes appointments that already had a 2h reminder sent', () => {
    const appointment = makeAppointment({
      startDateTime: new Date('2026-06-15T09:00:00Z'),
      reminder2hSentAt: new Date('2026-06-15T07:00:00Z'),
    })
    const result = getAppointmentsNeedingReminder([appointment], NOW, TIMEZONE)
    expect(result.reminder2h).toEqual([])
  })

  it('includes unpaid appointments for tomorrow once it is past 10:00 today', () => {
    const now = new Date('2026-06-15T10:30:00Z')
    const appointment = makeAppointment({
      startDateTime: new Date('2026-06-16T09:00:00Z'),
      paymentStatus: 'unpaid',
      paymentReminderSentAt: null,
    })
    const result = getAppointmentsNeedingReminder([appointment], now, TIMEZONE)
    expect(result.paymentReminder).toEqual([appointment])
  })

  it('excludes unpaid appointments for tomorrow before 10:00 today', () => {
    const now = new Date('2026-06-15T08:00:00Z')
    const appointment = makeAppointment({
      startDateTime: new Date('2026-06-16T09:00:00Z'),
      paymentStatus: 'unpaid',
      paymentReminderSentAt: null,
    })
    const result = getAppointmentsNeedingReminder([appointment], now, TIMEZONE)
    expect(result.paymentReminder).toEqual([])
  })

  it('includes unpaid appointments for today once it is past 20:00', () => {
    const now = new Date('2026-06-15T20:30:00Z')
    const appointment = makeAppointment({
      startDateTime: new Date('2026-06-15T22:00:00Z'),
      paymentStatus: 'unpaid',
      paymentReminderSentAt: null,
    })
    const result = getAppointmentsNeedingReminder([appointment], now, TIMEZONE)
    expect(result.paymentReminder).toEqual([appointment])
  })

  it('does not send a payment reminder twice on the same day', () => {
    const now = new Date('2026-06-15T20:30:00Z')
    const appointment = makeAppointment({
      startDateTime: new Date('2026-06-15T22:00:00Z'),
      paymentStatus: 'unpaid',
      paymentReminderSentAt: new Date('2026-06-15T10:30:00Z'),
    })
    const result = getAppointmentsNeedingReminder([appointment], now, TIMEZONE)
    expect(result.paymentReminder).toEqual([])
  })

  it('excludes paid appointments from payment reminders', () => {
    const now = new Date('2026-06-15T20:30:00Z')
    const appointment = makeAppointment({
      startDateTime: new Date('2026-06-15T22:00:00Z'),
      paymentStatus: 'paid',
      paymentReminderSentAt: null,
    })
    const result = getAppointmentsNeedingReminder([appointment], now, TIMEZONE)
    expect(result.paymentReminder).toEqual([])
  })

  it('excludes cancelled appointments from every reminder type', () => {
    const now = new Date('2026-06-15T20:30:00Z')
    const appointment = makeAppointment({
      startDateTime: new Date('2026-06-16T09:00:00Z'),
      status: 'cancelled',
      paymentStatus: 'unpaid',
    })
    const result = getAppointmentsNeedingReminder([appointment], now, TIMEZONE)
    expect(result.reminder24h).toEqual([])
    expect(result.reminder2h).toEqual([])
    expect(result.paymentReminder).toEqual([])
  })
})

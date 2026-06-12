import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/prisma.js', () => ({ prisma: prismaMock }))

const sendAppointmentReminder = vi.fn().mockResolvedValue(undefined)
const sendPaymentReminder = vi.fn().mockResolvedValue(undefined)
const sendAppointmentConfirmation = vi.fn().mockResolvedValue(undefined)
const sendReviewRequest = vi.fn().mockResolvedValue(undefined)

vi.mock('@schedly/notifications', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@schedly/notifications')>()
  return {
    ...actual,
    EmailService: class {
      sendAppointmentReminder = sendAppointmentReminder
      sendPaymentReminder = sendPaymentReminder
      sendAppointmentConfirmation = sendAppointmentConfirmation
      sendReviewRequest = sendReviewRequest
    },
  }
})

import { prismaMock, resetMocks } from './helpers/prisma-mock.js'
import { runNotificationsJob } from '../jobs/notifications.job.js'

const PROFESSIONAL = {
  id: 'pro1',
  name: 'Ps. Stefany Osorio',
  email: 'stefany@example.com',
  phone: '+56966898588',
  timezone: 'UTC',
  transferRut: '12.345.678-9',
  transferBank: 'Banco Estado',
  transferAccountType: 'Cuenta Vista',
  transferAccountNumber: '123456789',
  transferEmail: 'pagos@example.com',
}

const SERVICE = {
  id: 's1',
  name: 'Primera visita',
  price: 30000,
  duration: 45,
  modality: 'online',
}

function makeAppointment(overrides: Record<string, unknown>) {
  return {
    id: 'apt1',
    professionalId: 'pro1',
    serviceId: 's1',
    clientName: 'Ana',
    clientEmail: 'ana@test.com',
    clientPhone: '+56912345678',
    startDateTime: new Date('2026-06-16T09:00:00Z'),
    endDateTime: new Date('2026-06-16T09:45:00Z'),
    modality: 'online',
    status: 'confirmed',
    paymentStatus: 'paid',
    reminderSentAt: null,
    reminder2hSentAt: null,
    paymentReminderSentAt: null,
    notes: null,
    service: SERVICE,
    ...overrides,
  }
}

beforeEach(() => {
  resetMocks()
  sendAppointmentReminder.mockClear()
  sendPaymentReminder.mockClear()
  sendAppointmentConfirmation.mockClear()
  sendReviewRequest.mockClear()
  process.env.PROFESSIONAL_ID = 'pro1'
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-06-15T08:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('runNotificationsJob', () => {
  it('sends a 24h reminder and marks reminderSentAt', async () => {
    prismaMock.professional.findUnique.mockResolvedValue(PROFESSIONAL)
    const appointment = makeAppointment({})
    prismaMock.appointment.findMany.mockResolvedValue([appointment])

    await runNotificationsJob()

    expect(sendAppointmentReminder).toHaveBeenCalledWith('ana@test.com', expect.objectContaining({ hoursUntil: 24 }))
    expect(prismaMock.appointment.update).toHaveBeenCalledWith({
      where: { id: 'apt1' },
      data: { reminderSentAt: new Date('2026-06-15T08:00:00Z') },
    })
  })

  it('does not send a duplicate 24h reminder when reminderSentAt is already set', async () => {
    prismaMock.professional.findUnique.mockResolvedValue(PROFESSIONAL)
    const appointment = makeAppointment({ reminderSentAt: new Date('2026-06-15T07:00:00Z') })
    prismaMock.appointment.findMany.mockResolvedValue([appointment])

    await runNotificationsJob()

    expect(sendAppointmentReminder).not.toHaveBeenCalled()
    expect(prismaMock.appointment.update).not.toHaveBeenCalled()
  })

  it('sends a 2h reminder and marks reminder2hSentAt', async () => {
    prismaMock.professional.findUnique.mockResolvedValue(PROFESSIONAL)
    const appointment = makeAppointment({
      startDateTime: new Date('2026-06-15T09:00:00Z'),
      endDateTime: new Date('2026-06-15T09:45:00Z'),
      reminderSentAt: new Date('2026-06-14T08:00:00Z'),
    })
    prismaMock.appointment.findMany.mockResolvedValue([appointment])

    await runNotificationsJob()

    expect(sendAppointmentReminder).toHaveBeenCalledWith('ana@test.com', expect.objectContaining({ hoursUntil: 2 }))
    expect(prismaMock.appointment.update).toHaveBeenCalledWith({
      where: { id: 'apt1' },
      data: { reminder2hSentAt: new Date('2026-06-15T08:00:00Z') },
    })
  })

  it('does not send a duplicate 2h reminder when reminder2hSentAt is already set', async () => {
    prismaMock.professional.findUnique.mockResolvedValue(PROFESSIONAL)
    const appointment = makeAppointment({
      startDateTime: new Date('2026-06-15T09:00:00Z'),
      endDateTime: new Date('2026-06-15T09:45:00Z'),
      reminderSentAt: new Date('2026-06-14T08:00:00Z'),
      reminder2hSentAt: new Date('2026-06-15T07:00:00Z'),
    })
    prismaMock.appointment.findMany.mockResolvedValue([appointment])

    await runNotificationsJob()

    expect(sendAppointmentReminder).not.toHaveBeenCalled()
    expect(prismaMock.appointment.update).not.toHaveBeenCalled()
  })

  it('sends a payment reminder for unpaid appointments and marks paymentReminderSentAt', async () => {
    vi.setSystemTime(new Date('2026-06-15T20:30:00Z'))
    prismaMock.professional.findUnique.mockResolvedValue(PROFESSIONAL)
    const appointment = makeAppointment({
      startDateTime: new Date('2026-06-15T22:00:00Z'),
      endDateTime: new Date('2026-06-15T22:45:00Z'),
      paymentStatus: 'unpaid',
      reminderSentAt: new Date('2026-06-14T20:30:00Z'),
      reminder2hSentAt: new Date('2026-06-15T20:00:00Z'),
    })
    prismaMock.appointment.findMany.mockResolvedValue([appointment])

    await runNotificationsJob()

    expect(sendPaymentReminder).toHaveBeenCalledWith('ana@test.com', expect.objectContaining({ serviceName: 'Primera visita' }))
    expect(prismaMock.appointment.update).toHaveBeenCalledWith({
      where: { id: 'apt1' },
      data: { paymentReminderSentAt: new Date('2026-06-15T20:30:00Z') },
    })
  })

  it('does not send a duplicate payment reminder on the same day', async () => {
    vi.setSystemTime(new Date('2026-06-15T20:30:00Z'))
    prismaMock.professional.findUnique.mockResolvedValue(PROFESSIONAL)
    const appointment = makeAppointment({
      startDateTime: new Date('2026-06-15T22:00:00Z'),
      endDateTime: new Date('2026-06-15T22:45:00Z'),
      paymentStatus: 'unpaid',
      paymentReminderSentAt: new Date('2026-06-15T10:30:00Z'),
      reminderSentAt: new Date('2026-06-14T20:30:00Z'),
      reminder2hSentAt: new Date('2026-06-15T20:00:00Z'),
    })
    prismaMock.appointment.findMany.mockResolvedValue([appointment])

    await runNotificationsJob()

    expect(sendPaymentReminder).not.toHaveBeenCalled()
    expect(prismaMock.appointment.update).not.toHaveBeenCalled()
  })

  it('does nothing when the professional cannot be found', async () => {
    prismaMock.professional.findUnique.mockResolvedValue(null)

    await runNotificationsJob()

    expect(prismaMock.appointment.findMany).not.toHaveBeenCalled()
  })
})

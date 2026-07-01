import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/prisma.js', () => ({ prisma: prismaMock }))

const sendAppointmentReminder = vi.fn().mockResolvedValue(undefined)
const sendDailyDigest = vi.fn().mockResolvedValue(undefined)

vi.mock('@schedly/notifications', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@schedly/notifications')>()
  return {
    ...actual,
    EmailService: class {
      sendAppointmentReminder = sendAppointmentReminder
      sendDailyDigest = sendDailyDigest
    },
  }
})

import { prismaMock, resetMocks } from './helpers/prisma-mock.js'
import { EmailService } from '@schedly/notifications'
import { runNotificationsJob, sendDailyDigestIfNeeded } from '../jobs/notifications.job.js'
import type { Professional } from '../generated/prisma/index.js'

const PROFESSIONAL = {
  id: 'pro1',
  name: 'Ps. Stefany Osorio',
  email: 'stefany@example.com',
  phone: '+56966898588',
  timezone: 'UTC',
  dailyDigestTime: '16:00',
  lastDailyDigestSentDate: null as string | null,
} as unknown as Professional

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
    startDateTime: new Date('2026-06-15T10:00:00Z'),
    endDateTime: new Date('2026-06-15T10:45:00Z'),
    modality: 'online',
    status: 'confirmed',
    paymentStatus: 'paid',
    reminder2hSentAt: null,
    notes: null,
    service: SERVICE,
    appointmentToken: 'tok_abc123',
    tokenExpiresAt: new Date('2026-06-14T23:00:00Z'),
    ...overrides,
  }
}

beforeEach(() => {
  resetMocks()
  sendAppointmentReminder.mockClear()
  sendDailyDigest.mockClear()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-06-15T08:00:00Z'))
  process.env.PROFESSIONAL_ID = 'pro1'
})

afterEach(() => {
  vi.useRealTimers()
})

describe('runNotificationsJob', () => {
  it('does nothing when the professional cannot be found', async () => {
    prismaMock.professional.findUnique.mockResolvedValue(null)

    await runNotificationsJob()

    expect(prismaMock.appointment.findMany).not.toHaveBeenCalled()
  })

  it('sends a 2h reminder and marks reminder2hSentAt', async () => {
    prismaMock.professional.findUnique.mockResolvedValue(PROFESSIONAL)
    const appointment = makeAppointment({
      startDateTime: new Date('2026-06-15T10:00:00Z'),
      endDateTime: new Date('2026-06-15T10:45:00Z'),
    })
    prismaMock.appointment.findMany.mockResolvedValue([appointment])

    await runNotificationsJob()

    expect(sendAppointmentReminder).toHaveBeenCalledWith(
      'ana@test.com',
      expect.objectContaining({ clientName: 'Ana', serviceName: 'Primera visita' }),
    )
    expect(prismaMock.appointment.update).toHaveBeenCalledWith({
      where: { id: 'apt1' },
      data: { reminder2hSentAt: new Date('2026-06-15T08:00:00Z') },
    })
  })

  it('queries only active appointments within 2h and without reminder already sent', async () => {
    prismaMock.professional.findUnique.mockResolvedValue(PROFESSIONAL)
    prismaMock.appointment.findMany.mockResolvedValue([])

    await runNotificationsJob()

    expect(prismaMock.appointment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { not: 'cancelled' },
          reminder2hSentAt: null,
        }),
      }),
    )
  })

  it('does not send reminder when no appointments are returned (outside window, already sent, or cancelled)', async () => {
    prismaMock.professional.findUnique.mockResolvedValue(PROFESSIONAL)
    prismaMock.appointment.findMany.mockResolvedValue([])

    await runNotificationsJob()

    expect(sendAppointmentReminder).not.toHaveBeenCalled()
  })
})

describe('sendDailyDigestIfNeeded', () => {
  const emailService = new EmailService()

  it('does not send if the digest was already sent today', async () => {
    vi.setSystemTime(new Date('2026-06-15T16:05:00Z'))
    const professional = { ...PROFESSIONAL, dailyDigestTime: '16:00', lastDailyDigestSentDate: '2026-06-15' } as unknown as Professional

    await sendDailyDigestIfNeeded(professional, emailService)

    expect(sendDailyDigest).not.toHaveBeenCalled()
    expect(prismaMock.appointment.findMany).not.toHaveBeenCalled()
  })

  it('does not send outside the configured time window', async () => {
    vi.setSystemTime(new Date('2026-06-15T08:00:00Z'))
    const professional = { ...PROFESSIONAL, dailyDigestTime: '16:00', lastDailyDigestSentDate: null as string | null } as unknown as Professional

    await sendDailyDigestIfNeeded(professional, emailService)

    expect(sendDailyDigest).not.toHaveBeenCalled()
  })

  it("sends the digest with tomorrow's appointments and marks lastDailyDigestSentDate", async () => {
    vi.setSystemTime(new Date('2026-06-15T16:05:00Z'))
    const professional = { ...PROFESSIONAL, dailyDigestTime: '16:00', lastDailyDigestSentDate: null as string | null } as unknown as Professional
    const appointment = makeAppointment({
      startDateTime: new Date('2026-06-16T14:00:00Z'),
      endDateTime: new Date('2026-06-16T14:45:00Z'),
      paymentStatus: 'paid',
      attendanceConfirmed: true,
    })
    prismaMock.appointment.findMany.mockResolvedValue([appointment])

    await sendDailyDigestIfNeeded(professional, emailService)

    expect(sendDailyDigest).toHaveBeenCalledWith(
      'stefany@example.com',
      expect.objectContaining({
        appointments: [expect.objectContaining({ clientName: 'Ana' })],
      }),
    )
    expect(prismaMock.professional.update).toHaveBeenCalledWith({
      where: { id: 'pro1' },
      data: { lastDailyDigestSentDate: '2026-06-15' },
    })
  })
})

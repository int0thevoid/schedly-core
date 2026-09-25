import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/prisma.js', () => ({ prisma: prismaMock }))
vi.mock('@schedly/notifications', () => ({
  createGoogleMeetEvent: vi.fn(),
  cancelGoogleMeetEvent: vi.fn(),
}))

import { prismaMock, resetMocks } from './helpers/prisma-mock.js'
import { createGoogleMeetEvent, cancelGoogleMeetEvent } from '@schedly/notifications'
import { ensureGoogleMeetEvent, cancelGoogleMeetEventForAppointment } from '../lib/google-meet.js'

const SERVICE = {
  id: 's1', name: 'Terapia individual', professionalId: 'pro1', isActive: true,
  modality: 'online', duration: 50, price: 30000, description: '',
  bufferMinutes: null, createdAt: new Date(), updatedAt: new Date(),
}

const ONLINE_APPOINTMENT = {
  id: 'apt1', professionalId: 'pro1', serviceId: 's1',
  clientName: 'Ana', clientEmail: 'ana@test.com', clientPhone: '+56912345678',
  startDateTime: new Date('2026-12-15T14:00:00Z'),
  endDateTime: new Date('2026-12-15T14:50:00Z'),
  modality: 'online', status: 'pending', paymentStatus: 'unpaid',
  paymentAmount: null, paymentMethod: null, notes: null,
  bookingFlow: 'advance', paymentDeadline: null, autoCancelledAt: null,
  attendanceConfirmed: false, attendanceConfirmedAt: null,
  appointmentToken: 'tok_abc123', tokenExpiresAt: null,
  googleEventId: null, meetLink: null,
  createdAt: new Date(), updatedAt: new Date(),
}

const PRESENTIAL_APPOINTMENT = { ...ONLINE_APPOINTMENT, id: 'apt2', modality: 'presential' }

beforeEach(() => {
  resetMocks()
  vi.mocked(createGoogleMeetEvent).mockReset()
  vi.mocked(cancelGoogleMeetEvent).mockReset()
})

describe('ensureGoogleMeetEvent', () => {
  it('does nothing for presential appointments', async () => {
    const result = await ensureGoogleMeetEvent(PRESENTIAL_APPOINTMENT, SERVICE, 'Stefany Osorio')
    expect(result).toBe(PRESENTIAL_APPOINTMENT)
    expect(createGoogleMeetEvent).not.toHaveBeenCalled()
  })

  it('creates the Meet event and persists the link for online appointments', async () => {
    vi.mocked(createGoogleMeetEvent).mockResolvedValue({ eventId: 'evt1', meetLink: 'https://meet.google.com/abc-defg-hij' })
    const updated = { ...ONLINE_APPOINTMENT, googleEventId: 'evt1', meetLink: 'https://meet.google.com/abc-defg-hij' }
    prismaMock.appointment.update.mockResolvedValue(updated)

    const result = await ensureGoogleMeetEvent(ONLINE_APPOINTMENT, SERVICE, 'Stefany Osorio')

    expect(createGoogleMeetEvent).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Terapia individual — Stefany Osorio' }),
    )
    expect(prismaMock.appointment.update).toHaveBeenCalledWith({
      where: { id: 'apt1' },
      data: { googleEventId: 'evt1', meetLink: 'https://meet.google.com/abc-defg-hij' },
    })
    expect(result).toEqual(updated)
  })

  it('returns the original appointment when Meet creation fails, without throwing', async () => {
    vi.mocked(createGoogleMeetEvent).mockResolvedValue(null)

    const result = await ensureGoogleMeetEvent(ONLINE_APPOINTMENT, SERVICE, 'Stefany Osorio')

    expect(result).toBe(ONLINE_APPOINTMENT)
    expect(prismaMock.appointment.update).not.toHaveBeenCalled()
  })

  it('does not throw when the Meet service itself rejects', async () => {
    vi.mocked(createGoogleMeetEvent).mockRejectedValue(new Error('network error'))

    const result = await ensureGoogleMeetEvent(ONLINE_APPOINTMENT, SERVICE, 'Stefany Osorio')

    expect(result).toBe(ONLINE_APPOINTMENT)
  })
})

describe('cancelGoogleMeetEventForAppointment', () => {
  it('does nothing when the appointment has no googleEventId', async () => {
    await cancelGoogleMeetEventForAppointment({ id: 'apt1', googleEventId: null })
    expect(cancelGoogleMeetEvent).not.toHaveBeenCalled()
  })

  it('cancels the event when googleEventId is present', async () => {
    await cancelGoogleMeetEventForAppointment({ id: 'apt1', googleEventId: 'evt1' })
    expect(cancelGoogleMeetEvent).toHaveBeenCalledWith('evt1')
  })

  it('does not throw when cancellation fails', async () => {
    vi.mocked(cancelGoogleMeetEvent).mockRejectedValue(new Error('network error'))
    await expect(cancelGoogleMeetEventForAppointment({ id: 'apt1', googleEventId: 'evt1' })).resolves.toBeUndefined()
  })
})

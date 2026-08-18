import { beforeEach, describe, expect, it, vi } from 'vitest'

const sendMock = vi.fn()

vi.mock('resend', () => ({
  Resend: class {
    emails = { send: sendMock }
  },
}))

import { EmailService } from '../email.service.js'
import type { ReviewRequestData } from '../templates/review-request.js'
import type { AppointmentConfirmationData } from '../templates/appointment-confirmation.js'
import type { AppointmentReminderData } from '../templates/appointment-reminder.js'
import type { AppointmentModifiedData } from '../templates/appointment-modified.js'

const REVIEW_DATA: ReviewRequestData = {
  clientName: 'Ana Pérez',
  serviceName: 'Primera visita',
  professionalName: 'Ps. Stefany Osorio',
}

const CONFIRMATION_DATA: AppointmentConfirmationData = {
  clientName: 'Ana Pérez',
  serviceName: 'Primera visita',
  date: 'Miércoles, 15 de julio de 2026',
  startTime: '10:00',
  endTime: '10:45',
  modality: 'presential',
  address: 'Buenos Aires 1088, Villa Alemana',
  price: 30000,
  professionalName: 'Ps. Stefany Osorio',
  professionalPhone: '+56966898588',
  modifyUrl: 'https://example.com/cita/tok/modificar',
  cancelUrl: 'https://example.com/cita/tok/anular',
  googleCalendarUrl: 'https://calendar.google.com/render?action=TEMPLATE',
  startDateTime: new Date('2026-07-15T10:00:00.000Z'),
  endDateTime: new Date('2026-07-15T10:45:00.000Z'),
}

const REMINDER_DATA: AppointmentReminderData = {
  clientName: 'Ana Pérez',
  serviceName: 'Primera visita',
  date: 'Miércoles, 15 de julio de 2026',
  startTime: '10:00',
  endTime: '10:45',
  modality: 'online',
  googleCalendarUrl: 'https://calendar.google.com/render?action=TEMPLATE',
  startDateTime: new Date('2026-07-15T10:00:00.000Z'),
  endDateTime: new Date('2026-07-15T10:45:00.000Z'),
}

const MODIFIED_DATA: AppointmentModifiedData = {
  clientName: 'Ana Pérez',
  originalDate: 'Lunes, 13 de julio de 2026',
  originalTime: '09:00',
  newServiceName: 'Primera visita',
  newDate: 'Miércoles, 15 de julio de 2026',
  newStartTime: '10:00',
  newEndTime: '10:45',
  modality: 'presential',
  address: 'Buenos Aires 1088, Villa Alemana',
  price: 30000,
  professionalName: 'Ps. Stefany Osorio',
  professionalPhone: '+56966898588',
  modifyUrl: 'https://example.com/cita/tok/modificar',
  cancelUrl: 'https://example.com/cita/tok/anular',
  googleCalendarUrl: 'https://calendar.google.com/render?action=TEMPLATE',
  newStartDateTime: new Date('2026-07-15T10:00:00.000Z'),
  newEndDateTime: new Date('2026-07-15T10:45:00.000Z'),
}

beforeEach(() => {
  sendMock.mockReset()
  process.env.RESEND_API_KEY = 're_test_key'
  process.env.RESEND_FROM_EMAIL = 'noreply@mail.int0thesrv.cl'
  process.env.RESEND_FROM_NAME = 'Ps. Stefany Osorio'
})

describe('EmailService — envío base', () => {
  it('sends an email via Resend with the from address, recipient, subject and html', async () => {
    sendMock.mockResolvedValue({ data: { id: 'email-1' }, error: null })

    const emailService = new EmailService()
    await emailService.sendReviewRequest('ana@test.com', REVIEW_DATA)

    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'Ps. Stefany Osorio <noreply@mail.int0thesrv.cl>',
        to: 'ana@test.com',
        subject: '⭐ ¿Cómo fue tu sesión con Ps. Stefany Osorio?',
        html: expect.stringContaining('Ana Pérez'),
      }),
    )
  })

  it('throws after retrying 3 times when Resend keeps returning an error', async () => {
    vi.useFakeTimers()
    sendMock.mockResolvedValue({ data: null, error: { message: 'invalid recipient' } })

    const emailService = new EmailService()
    const promise = emailService.sendReviewRequest('ana@test.com', REVIEW_DATA)
    const assertion = expect(promise).rejects.toThrow('invalid recipient')
    await vi.runAllTimersAsync()
    await assertion

    expect(sendMock).toHaveBeenCalledTimes(3)
    vi.useRealTimers()
  })

  it('succeeds on the second attempt after a transient Resend error', async () => {
    vi.useFakeTimers()
    sendMock
      .mockResolvedValueOnce({ data: null, error: { message: 'timeout' } })
      .mockResolvedValueOnce({ data: { id: 'email-retry' }, error: null })

    const emailService = new EmailService()
    const promise = emailService.sendReviewRequest('ana@test.com', REVIEW_DATA)
    await vi.runAllTimersAsync()
    await promise

    expect(sendMock).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })
})

describe('EmailService — adjunto ICS', () => {
  it('sendAppointmentConfirmation adjunta un archivo cita.ics', async () => {
    sendMock.mockResolvedValue({ data: { id: 'email-2' }, error: null })

    const emailService = new EmailService()
    await emailService.sendAppointmentConfirmation('ana@test.com', CONFIRMATION_DATA)

    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        attachments: [
          expect.objectContaining({ filename: 'cita.ics', content: expect.any(Buffer) }),
        ],
      }),
    )
  })

  it('sendAppointmentConfirmation — el ICS contiene la fecha correcta', async () => {
    sendMock.mockResolvedValue({ data: { id: 'email-3' }, error: null })

    const emailService = new EmailService()
    await emailService.sendAppointmentConfirmation('ana@test.com', CONFIRMATION_DATA)

    const call = sendMock.mock.calls[0][0]
    const icsContent = (call.attachments[0].content as Buffer).toString()
    expect(icsContent).toContain('DTSTART:20260715T100000Z')
    expect(icsContent).toContain('SUMMARY:Primera visita')
    expect(icsContent).toContain('DESCRIPTION:')
    expect(icsContent).toMatch(/DESCRIPTION:.*Ps\. Stefany Osorio/)
  })

  it('sendAppointmentReminder adjunta un archivo cita.ics', async () => {
    sendMock.mockResolvedValue({ data: { id: 'email-4' }, error: null })

    const emailService = new EmailService()
    await emailService.sendAppointmentReminder('ana@test.com', REMINDER_DATA)

    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        attachments: [
          expect.objectContaining({ filename: 'cita.ics', content: expect.any(Buffer) }),
        ],
      }),
    )
  })

  it('sendAppointmentModified adjunta un archivo cita.ics con la nueva fecha', async () => {
    sendMock.mockResolvedValue({ data: { id: 'email-5' }, error: null })

    const emailService = new EmailService()
    await emailService.sendAppointmentModified('ana@test.com', MODIFIED_DATA)

    const call = sendMock.mock.calls[0][0]
    expect(call.attachments).toHaveLength(1)
    expect(call.attachments[0].filename).toBe('cita.ics')
    const icsContent = (call.attachments[0].content as Buffer).toString()
    expect(icsContent).toContain('DTSTART:20260715T100000Z')
  })
})

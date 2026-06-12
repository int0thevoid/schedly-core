import { beforeEach, describe, expect, it, vi } from 'vitest'

const sendMock = vi.fn()

vi.mock('resend', () => ({
  Resend: class {
    emails = { send: sendMock }
  },
}))

import { EmailService } from '../email.service.js'
import type { ReviewRequestData } from '../templates/review-request.js'

const REVIEW_DATA: ReviewRequestData = {
  clientName: 'Ana Pérez',
  serviceName: 'Primera visita',
  professionalName: 'Ps. Stefany Osorio',
}

describe('EmailService', () => {
  beforeEach(() => {
    sendMock.mockReset()
    process.env.RESEND_API_KEY = 're_test_key'
    process.env.RESEND_FROM_EMAIL = 'noreply@mail.int0thesrv.cl'
    process.env.RESEND_FROM_NAME = 'Ps. Stefany Osorio'
  })

  it('sends an email via Resend with the from address, recipient, subject and html', async () => {
    sendMock.mockResolvedValue({ data: { id: 'email-1' }, error: null })

    const emailService = new EmailService()
    await emailService.sendReviewRequest('ana@test.com', REVIEW_DATA)

    expect(sendMock).toHaveBeenCalledWith({
      from: 'Ps. Stefany Osorio <noreply@mail.int0thesrv.cl>',
      to: 'ana@test.com',
      subject: '⭐ ¿Cómo fue tu sesión con Ps. Stefany Osorio?',
      html: expect.stringContaining('Ana Pérez'),
    })
  })

  it('throws when Resend returns an error', async () => {
    sendMock.mockResolvedValue({ data: null, error: { message: 'invalid recipient' } })

    const emailService = new EmailService()
    await expect(emailService.sendReviewRequest('ana@test.com', REVIEW_DATA)).rejects.toThrow('invalid recipient')
  })
})

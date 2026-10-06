import { beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'

vi.mock('../lib/prisma.js', () => ({ prisma: prismaMock }))

const sendAppointmentModified = vi.fn()
const sendProfessionalRescheduleNotice = vi.fn()
vi.mock('../lib/email-service.js', () => ({
  getEmailService: () => ({ sendAppointmentModified, sendProfessionalRescheduleNotice }),
}))

import { prismaMock, resetMocks } from './helpers/prisma-mock.js'
import app from '../app.js'

const SERVICE = { id: 's1', name: 'Terapia individual', professionalId: 'pro1', modality: 'presential', duration: 50, price: 35000 }
const ORIGINAL = {
  id: 'apt1', professionalId: 'pro1', serviceId: 's1',
  clientName: 'Ana Pérez', clientEmail: 'ana@test.com', clientPhone: '+56912345678',
  // 08-10-2026 19:00 en Santiago (UTC-3)
  startDateTime: new Date('2026-10-08T22:00:00Z'), endDateTime: new Date('2026-10-08T22:50:00Z'),
  modality: 'presential', status: 'confirmed', paymentStatus: 'unpaid', paymentMethod: null, notes: null,
  googleEventId: null, appointmentToken: 'tok_valid', tokenExpiresAt: new Date(Date.now() + 86_400_000),
  service: SERVICE,
}
const NEW = { ...ORIGINAL, id: 'apt2', status: 'pending', startDateTime: new Date('2026-10-10T19:00:00Z'), endDateTime: new Date('2026-10-10T19:50:00Z') }

function arrangeReschedule() {
  prismaMock.appointment.findUnique.mockResolvedValue(ORIGINAL)
  prismaMock.$transaction.mockImplementation(async (fn: (tx: typeof prismaMock) => Promise<unknown>) => fn(prismaMock))
  prismaMock.appointment.findFirst.mockResolvedValue(null)
  prismaMock.appointment.create.mockResolvedValue(NEW)
  prismaMock.appointment.update.mockResolvedValue({ ...ORIGINAL, status: 'cancelled' })
  prismaMock.professional.findUnique.mockResolvedValue({
    id: 'pro1', name: 'Ps. Stefany Osorio', email: 'stefany@test.com', phone: '+56966898588', timezone: 'America/Santiago',
  })
}

async function reschedule() {
  const res = await request(app).patch('/api/appointments/token/tok_valid/reschedule').send({ newStartDateTime: '2026-10-10T19:00:00Z' })
  expect(res.status).toBe(200)
  // los correos se envían después de responder
  await vi.waitFor(() => expect(sendProfessionalRescheduleNotice).toHaveBeenCalled())
}

describe('aviso a la profesional al reagendar (US-085)', () => {
  beforeEach(() => {
    resetMocks()
    sendAppointmentModified.mockReset().mockResolvedValue(undefined)
    sendProfessionalRescheduleNotice.mockReset().mockResolvedValue(undefined)
    arrangeReschedule()
  })

  it('envía el aviso a la profesional con la hora anterior y la nueva', async () => {
    await reschedule()
    expect(sendProfessionalRescheduleNotice).toHaveBeenCalledWith('stefany@test.com', expect.objectContaining({
      clientName: 'Ana Pérez',
      clientPhone: '+56912345678',
      serviceName: 'Terapia individual',
      modality: 'presential',
      previousStartTime: '19:00',
      newStartTime: '16:00',
    }))
    const data = sendProfessionalRescheduleNotice.mock.calls[0][1]
    expect(data.previousDate).toMatch(/8 de octubre/)
    expect(data.newDate).toMatch(/10 de octubre/)
    expect(sendAppointmentModified).toHaveBeenCalledWith('ana@test.com', expect.anything())
  })

  it('si falla el aviso a la profesional, la paciente igual recibe su correo', async () => {
    sendProfessionalRescheduleNotice.mockRejectedValue(new Error('resend down'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await reschedule()
    expect(sendAppointmentModified).toHaveBeenCalledWith('ana@test.com', expect.anything())
  })
})

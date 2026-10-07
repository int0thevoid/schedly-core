import { beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'

vi.mock('../lib/prisma.js', () => ({ prisma: prismaMock }))

const sendAppointmentModified = vi.fn()
const sendProfessionalRescheduleNotice = vi.fn()
const sendAppointmentConfirmation = vi.fn()
const sendAppointmentCancelledByPatient = vi.fn()
const sendNewBookingToProfessional = vi.fn()
vi.mock('../lib/email-service.js', () => ({
  getEmailService: () => ({
    sendAppointmentModified,
    sendProfessionalRescheduleNotice,
    sendAppointmentConfirmation,
    sendAppointmentCancelledByPatient,
    sendNewBookingToProfessional,
  }),
}))

import { prismaMock, resetMocks } from './helpers/prisma-mock.js'
import jwt from 'jsonwebtoken'
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

describe('reagendar desde el panel (US-090)', () => {
  const PAID = { ...ORIGINAL, status: 'confirmed', paymentStatus: 'paid', paymentAmount: 35000, paymentMethod: 'transfer' }
  const adminCookie = () => `auth_token=${jwt.sign({ professionalId: 'pro1', role: 'admin' }, 'dev-secret')}`

  beforeEach(() => {
    resetMocks()
    for (const fn of [sendAppointmentModified, sendProfessionalRescheduleNotice, sendAppointmentConfirmation, sendAppointmentCancelledByPatient, sendNewBookingToProfessional]) {
      fn.mockReset().mockResolvedValue(undefined)
    }
    arrangeReschedule()
    prismaMock.appointment.findFirst.mockReset()
    // 1ª llamada: la cita original (del profesional); 2ª: el chequeo de choque dentro de la transacción
    prismaMock.appointment.findFirst.mockResolvedValueOnce(PAID).mockResolvedValueOnce(null)
  })

  async function rescheduleFromPanel(body: Record<string, unknown> = { newStartDateTime: '2026-10-10T19:00:00Z' }) {
    return request(app).post('/api/admin/appointments/apt1/reschedule').set('Cookie', adminCookie()).send(body)
  }

  it('envía un único correo de reagendamiento a la paciente y el aviso a Stefany, sin anulación ni confirmación nueva', async () => {
    const res = await rescheduleFromPanel()
    expect(res.status).toBe(200)
    await vi.waitFor(() => expect(sendProfessionalRescheduleNotice).toHaveBeenCalled())
    expect(sendAppointmentModified).toHaveBeenCalledTimes(1)
    expect(sendAppointmentModified).toHaveBeenCalledWith('ana@test.com', expect.anything())
    expect(sendProfessionalRescheduleNotice).toHaveBeenCalledWith('stefany@test.com', expect.objectContaining({ rescheduledBy: 'admin' }))
    expect(sendAppointmentCancelledByPatient).not.toHaveBeenCalled()
    expect(sendAppointmentConfirmation).not.toHaveBeenCalled()
    expect(sendNewBookingToProfessional).not.toHaveBeenCalled()
  })

  it('crea la nueva y cancela la original, conservando estado y pago', async () => {
    await rescheduleFromPanel()
    expect(prismaMock.appointment.create.mock.calls[0][0].data).toMatchObject({
      startDateTime: new Date('2026-10-10T19:00:00Z'),
      status: 'confirmed',
      paymentStatus: 'paid',
      paymentAmount: 35000,
      paymentMethod: 'transfer',
    })
    expect(prismaMock.appointment.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'apt1' }, data: { status: 'cancelled' } }))
  })

  it('el chequeo de horario ocupado no choca con la propia cita', async () => {
    await rescheduleFromPanel()
    expect(prismaMock.appointment.findFirst.mock.calls[1][0].where).toMatchObject({ id: { not: 'apt1' } })
  })

  it('responde 409 si el horario está ocupado y no envía correos', async () => {
    prismaMock.appointment.findFirst.mockReset().mockResolvedValueOnce(PAID).mockResolvedValueOnce({ id: 'otra' })
    const res = await rescheduleFromPanel()
    expect(res.status).toBe(409)
    expect(prismaMock.appointment.create).not.toHaveBeenCalled()
    expect(sendAppointmentModified).not.toHaveBeenCalled()
  })

  it('no permite reagendar citas de otro profesional ni citas canceladas', async () => {
    prismaMock.appointment.findFirst.mockReset().mockResolvedValueOnce(null)
    expect((await rescheduleFromPanel()).status).toBe(404)
    prismaMock.appointment.findFirst.mockReset().mockResolvedValueOnce({ ...PAID, status: 'cancelled' })
    expect((await rescheduleFromPanel()).status).toBe(409)
  })

  it('requiere sesión de administradora', async () => {
    const res = await request(app).post('/api/admin/appointments/apt1/reschedule').send({ newStartDateTime: '2026-10-10T19:00:00Z' })
    expect(res.status).toBe(401)
  })
})

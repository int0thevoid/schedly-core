import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  buildAppointmentConfirmationData,
  buildAppointmentReminderData,
  buildTransferData,
  type AppointmentWithService,
} from '../lib/notification-data.js'
import type { Professional } from '../generated/prisma/index.js'

const PROFESSIONAL = {
  id: 'pro1',
  name: 'Ps. Stefany Osorio',
  email: 'stefany@example.com',
  phone: '+56966898588',
  timezone: 'America/Santiago',
  transferRut: '12.345.678-9',
  transferBank: 'banco_chile',
  transferAccountType: 'vista',
  transferAccountNumber: '123456789',
  transferEmail: 'pagos@example.com',
} as unknown as Professional

const APPOINTMENT = {
  id: 'apt1',
  clientName: 'Ana Pérez',
  startDateTime: new Date('2026-06-10T14:00:00Z'),
  endDateTime: new Date('2026-06-10T14:45:00Z'),
  modality: 'presential',
  paymentStatus: 'unpaid',
  service: { name: 'Primera visita', price: 30000 },
} as unknown as AppointmentWithService

describe('buildTransferData', () => {
  it('convierte el código de banco a su nombre legible', () => {
    const data = buildTransferData(PROFESSIONAL)
    expect(data?.bank).toBe('Banco de Chile')
  })

  it('retorna undefined si falta algún dato de transferencia', () => {
    const data = buildTransferData({ ...PROFESSIONAL, transferBank: null })
    expect(data).toBeUndefined()
  })
})

describe('confirmAttendanceUrl', () => {
  const ORIGINAL_API_BASE_URL = process.env.API_BASE_URL

  beforeEach(() => {
    process.env.API_BASE_URL = 'https://api.example.com'
  })

  afterEach(() => {
    if (ORIGINAL_API_BASE_URL === undefined) delete process.env.API_BASE_URL
    else process.env.API_BASE_URL = ORIGINAL_API_BASE_URL
  })

  it('buildAppointmentConfirmationData incluye el link de confirmación de asistencia', () => {
    const data = buildAppointmentConfirmationData(APPOINTMENT, PROFESSIONAL)
    expect(data.confirmAttendanceUrl).toBe('https://api.example.com/api/appointments/apt1/confirm-attendance')
  })

  it('buildAppointmentReminderData incluye el link de confirmación en el recordatorio de 24h', () => {
    const data = buildAppointmentReminderData(APPOINTMENT, PROFESSIONAL, 24)
    expect(data.confirmAttendanceUrl).toBe('https://api.example.com/api/appointments/apt1/confirm-attendance')
  })

  it('buildAppointmentReminderData omite el link de confirmación en el recordatorio de 2h', () => {
    const data = buildAppointmentReminderData(APPOINTMENT, PROFESSIONAL, 2)
    expect(data.confirmAttendanceUrl).toBeUndefined()
  })
})

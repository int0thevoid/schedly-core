import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  buildAppointmentConfirmationData,
  buildAppointmentReminderData,
  buildNewBookingForProfessionalData,
  buildAppointmentCancelledByPatientData,
  type AppointmentWithService,
} from '../lib/notification-data.js'
import type { Professional } from '../generated/prisma/index.js'

const PROFESSIONAL = {
  id: 'pro1',
  name: 'Ps. Stefany Osorio',
  email: 'stefany@example.com',
  phone: '+56966898588',
  timezone: 'America/Santiago',
} as unknown as Professional

const APPOINTMENT = {
  id: 'apt1',
  clientName: 'Ana Pérez',
  clientEmail: 'ana@test.com',
  clientPhone: '+56912345678',
  startDateTime: new Date('2026-06-10T14:00:00Z'),
  endDateTime: new Date('2026-06-10T14:45:00Z'),
  modality: 'presential',
  paymentStatus: 'unpaid',
  appointmentToken: 'tok_abc123',
  service: { name: 'Primera visita', price: 30000, duration: 45 },
} as unknown as AppointmentWithService

const ORIGINAL_FRONTEND_URL = process.env.FRONTEND_URL

describe('buildAppointmentConfirmationData', () => {
  beforeEach(() => {
    process.env.FRONTEND_URL = 'https://agenda.example.com'
  })
  afterEach(() => {
    if (ORIGINAL_FRONTEND_URL === undefined) delete process.env.FRONTEND_URL
    else process.env.FRONTEND_URL = ORIGINAL_FRONTEND_URL
  })

  it('includes token-based modify and cancel URLs', () => {
    const data = buildAppointmentConfirmationData(APPOINTMENT, PROFESSIONAL)
    expect(data.modifyUrl).toBe('https://agenda.example.com/cita/tok_abc123/modificar')
    expect(data.cancelUrl).toBe('https://agenda.example.com/cita/tok_abc123/anular')
  })

  it('includes a Google Calendar URL', () => {
    const data = buildAppointmentConfirmationData(APPOINTMENT, PROFESSIONAL)
    expect(data.googleCalendarUrl).toContain('calendar.google.com')
  })

  it('includes start and end times separately', () => {
    const data = buildAppointmentConfirmationData(APPOINTMENT, PROFESSIONAL)
    expect(data.startTime).toBeDefined()
    expect(data.endTime).toBeDefined()
    expect(data.startTime).not.toBe(data.endTime)
  })

  it('sets address for presential modality when PROFESSIONAL_ADDRESS is set', () => {
    process.env.PROFESSIONAL_ADDRESS = 'Buenos Aires 1088, Villa Alemana'
    const data = buildAppointmentConfirmationData(APPOINTMENT, PROFESSIONAL)
    expect(data.address).toBe('Buenos Aires 1088, Villa Alemana')
    delete process.env.PROFESSIONAL_ADDRESS
  })

  it('sets no address for online modality', () => {
    const online = { ...APPOINTMENT, modality: 'online' } as unknown as AppointmentWithService
    const data = buildAppointmentConfirmationData(online, PROFESSIONAL)
    expect(data.address).toBeUndefined()
  })
})

describe('buildAppointmentReminderData', () => {
  it('includes a Google Calendar URL', () => {
    const data = buildAppointmentReminderData(APPOINTMENT, PROFESSIONAL)
    expect(data.googleCalendarUrl).toContain('calendar.google.com')
  })

  it('includes start and end times', () => {
    const data = buildAppointmentReminderData(APPOINTMENT, PROFESSIONAL)
    expect(data.startTime).toBeDefined()
    expect(data.endTime).toBeDefined()
  })
})

describe('buildNewBookingForProfessionalData', () => {
  it('includes all client contact data', () => {
    const data = buildNewBookingForProfessionalData(APPOINTMENT, PROFESSIONAL)
    expect(data.clientName).toBe('Ana Pérez')
    expect(data.clientEmail).toBe('ana@test.com')
    expect(data.clientPhone).toBe('+56912345678')
  })

  it('includes appointment service details', () => {
    const data = buildNewBookingForProfessionalData(APPOINTMENT, PROFESSIONAL)
    expect(data.serviceName).toBe('Primera visita')
    expect(data.price).toBe(30000)
  })
})

describe('buildAppointmentCancelledByPatientData', () => {
  it('includes the booking URL for rescheduling', () => {
    process.env.FRONTEND_URL = 'https://agenda.example.com'
    const data = buildAppointmentCancelledByPatientData(APPOINTMENT, PROFESSIONAL)
    expect(data.bookingUrl).toBe('https://agenda.example.com')
    delete process.env.FRONTEND_URL
  })

  it('includes client name and professional name', () => {
    const data = buildAppointmentCancelledByPatientData(APPOINTMENT, PROFESSIONAL)
    expect(data.clientName).toBe('Ana Pérez')
    expect(data.professionalName).toBe('Ps. Stefany Osorio')
  })
})

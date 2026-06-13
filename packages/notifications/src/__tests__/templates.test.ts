import { describe, expect, it } from 'vitest'
import { appointmentConfirmationTemplate, type AppointmentConfirmationData } from '../templates/appointment-confirmation.js'
import { appointmentReminderTemplate, type AppointmentReminderData } from '../templates/appointment-reminder.js'
import { paymentReminderTemplate, type PaymentReminderData } from '../templates/payment-reminder.js'
import { reviewRequestTemplate, type ReviewRequestData } from '../templates/review-request.js'
import { confirmAttendancePageTemplate } from '../templates/confirm-attendance-page.js'
import { dailyDigestTemplate, type DailyDigestData } from '../templates/daily-digest.js'
import { appointmentCancelledTemplate, type AppointmentCancelledData } from '../templates/appointment-cancelled.js'

const TRANSFER_DATA = {
  rut: '12.345.678-9',
  bank: 'Banco Estado',
  accountType: 'Cuenta Vista',
  accountNumber: '123456789',
  email: 'pagos@example.com',
}

describe('appointmentConfirmationTemplate', () => {
  const baseData: AppointmentConfirmationData = {
    clientName: 'Ana Pérez',
    serviceName: 'Primera visita',
    date: 'Martes 10 de junio de 2026',
    time: '14:00 - 14:45',
    modality: 'presential',
    address: 'Espacio Henko · Buenos Aires 1088, Villa Alemana',
    price: 30000,
    professionalName: 'Ps. Stefany Osorio',
    professionalPhone: '+56966898588',
  }

  it('returns a subject including the service name and date', () => {
    const { subject } = appointmentConfirmationTemplate(baseData)
    expect(subject).toBe('✅ Cita confirmada — Primera visita el Martes 10 de junio de 2026')
  })

  it('includes a Google Maps link for presential appointments', () => {
    const { html } = appointmentConfirmationTemplate(baseData)
    expect(html).toContain('https://www.google.com/maps/search/?api=1&query=')
    expect(html).toContain('Ver en Google Maps')
  })

  it('shows "link próximamente" for online appointments without a meet link', () => {
    const { html } = appointmentConfirmationTemplate({ ...baseData, modality: 'online', address: undefined })
    expect(html).toContain('próximamente')
    expect(html).not.toContain('Ver en Google Maps')
  })

  it('includes transfer instructions when transferData is present', () => {
    const { html } = appointmentConfirmationTemplate({ ...baseData, transferData: TRANSFER_DATA })
    expect(html).toContain('Datos para transferencia')
    expect(html).toContain(TRANSFER_DATA.rut)
    expect(html).toContain(TRANSFER_DATA.accountNumber)
  })

  it('omits transfer instructions when transferData is absent', () => {
    const { html } = appointmentConfirmationTemplate(baseData)
    expect(html).not.toContain('Datos para transferencia')
  })

  it('escapes HTML in client-provided fields', () => {
    const { html } = appointmentConfirmationTemplate({ ...baseData, clientName: '<script>alert(1)</script>' })
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('includes the professional phone in the footer', () => {
    const { html } = appointmentConfirmationTemplate(baseData)
    expect(html).toContain(baseData.professionalPhone)
  })

  it('includes a "Confirmar asistencia" button when confirmAttendanceUrl is present', () => {
    const { html } = appointmentConfirmationTemplate({ ...baseData, confirmAttendanceUrl: 'https://api.example.com/api/appointments/apt1/confirm-attendance' })
    expect(html).toContain('https://api.example.com/api/appointments/apt1/confirm-attendance')
    expect(html).toContain('Confirmar asistencia')
  })

  it('omits the "Confirmar asistencia" button when confirmAttendanceUrl is absent', () => {
    const { html } = appointmentConfirmationTemplate(baseData)
    expect(html).not.toContain('Confirmar asistencia')
  })
})

describe('appointmentReminderTemplate', () => {
  const baseData: AppointmentReminderData = {
    clientName: 'Ana Pérez',
    serviceName: 'Primera visita',
    date: 'Martes 10 de junio de 2026',
    time: '14:00 - 14:45',
    modality: 'online',
    professionalName: 'Ps. Stefany Osorio',
    professionalPhone: '+56966898588',
    hoursUntil: 24,
  }

  it('uses "mañana" in the subject when hoursUntil is 24', () => {
    const { subject } = appointmentReminderTemplate(baseData)
    expect(subject).toBe('⏰ Recordatorio: tu cita es mañana')
  })

  it('uses "en 2 horas" in the subject when hoursUntil is 2', () => {
    const { subject } = appointmentReminderTemplate({ ...baseData, hoursUntil: 2 })
    expect(subject).toBe('⏰ Recordatorio: tu cita es en 2 horas')
  })

  it('does not include payment information', () => {
    const { html } = appointmentReminderTemplate(baseData)
    expect(html).not.toContain('Datos para transferencia')
  })

  it('includes the appointment date and time', () => {
    const { html } = appointmentReminderTemplate(baseData)
    expect(html).toContain(baseData.date)
    expect(html).toContain(baseData.time)
  })

  it('includes a "Confirmar asistencia" button when confirmAttendanceUrl is present', () => {
    const { html } = appointmentReminderTemplate({ ...baseData, confirmAttendanceUrl: 'https://api.example.com/api/appointments/apt1/confirm-attendance' })
    expect(html).toContain('https://api.example.com/api/appointments/apt1/confirm-attendance')
    expect(html).toContain('Confirmar asistencia')
  })

  it('omits the "Confirmar asistencia" button when confirmAttendanceUrl is absent', () => {
    const { html } = appointmentReminderTemplate(baseData)
    expect(html).not.toContain('Confirmar asistencia')
  })
})

describe('paymentReminderTemplate', () => {
  const baseData: PaymentReminderData = {
    clientName: 'Ana Pérez',
    serviceName: 'Primera visita',
    date: 'Martes 10 de junio de 2026',
    time: '14:00 - 14:45',
    price: 30000,
    transferData: TRANSFER_DATA,
    professionalPhone: '+56966898588',
  }

  it('returns a subject including the service name', () => {
    const { subject } = paymentReminderTemplate(baseData)
    expect(subject).toBe('💳 Recordatorio de pago — Primera visita')
  })

  it('includes the transfer instructions', () => {
    const { html } = paymentReminderTemplate(baseData)
    expect(html).toContain(TRANSFER_DATA.rut)
    expect(html).toContain(TRANSFER_DATA.bank)
  })

  it('includes a WhatsApp link to send proof of payment', () => {
    const { html } = paymentReminderTemplate(baseData)
    expect(html).toContain('https://wa.me/56966898588')
  })
})

describe('reviewRequestTemplate', () => {
  const baseData: ReviewRequestData = {
    clientName: 'Ana Pérez',
    serviceName: 'Primera visita',
    professionalName: 'Ps. Stefany Osorio',
  }

  it('returns a subject including the professional name', () => {
    const { subject } = reviewRequestTemplate(baseData)
    expect(subject).toBe('⭐ ¿Cómo fue tu sesión con Ps. Stefany Osorio?')
  })

  it('includes a Google review button when googleReviewLink is present', () => {
    const { html } = reviewRequestTemplate({ ...baseData, googleReviewLink: 'https://g.page/r/example/review' })
    expect(html).toContain('https://g.page/r/example/review')
    expect(html).toContain('Dejar reseña en Google')
  })

  it('falls back to plain text when googleReviewLink is absent', () => {
    const { html } = reviewRequestTemplate(baseData)
    expect(html).not.toContain('Dejar reseña en Google')
  })
})

describe('dailyDigestTemplate', () => {
  const baseData: DailyDigestData = {
    professionalName: 'Ps. Stefany Osorio',
    date: 'Martes 10 de junio de 2026',
    appointments: [
      {
        time: '14:00',
        clientName: 'Ana Pérez',
        serviceName: 'Primera visita',
        modality: 'Online',
        color: '#8FA88B',
        colorLabel: 'Confirmado y pagado',
      },
    ],
    adminUrl: 'https://admin.example.com/admin/agenda',
  }

  it('returns a subject including the date', () => {
    const { subject } = dailyDigestTemplate(baseData)
    expect(subject).toBe('📅 Tu agenda de mañana — Martes 10 de junio de 2026')
  })

  it('includes the appointment time, client and service', () => {
    const { html } = dailyDigestTemplate(baseData)
    expect(html).toContain('14:00')
    expect(html).toContain('Ana Pérez')
    expect(html).toContain('Primera visita')
  })

  it('includes the color legend', () => {
    const { html } = dailyDigestTemplate(baseData)
    expect(html).toContain('Confirmado y pagado')
    expect(html).toContain('Confirmado, pago pendiente')
    expect(html).toContain('Pagado, sin confirmar asistencia')
    expect(html).toContain('Sin confirmar ni pagar')
  })

  it('includes a "Ver agenda completa" button linking to adminUrl', () => {
    const { html } = dailyDigestTemplate(baseData)
    expect(html).toContain(baseData.adminUrl)
    expect(html).toContain('Ver agenda completa')
  })

  it('shows "No tienes citas para mañana" when appointments is empty', () => {
    const { html } = dailyDigestTemplate({ ...baseData, appointments: [] })
    expect(html).toContain('No tienes citas para mañana')
  })
})

describe('appointmentCancelledTemplate', () => {
  const baseData: AppointmentCancelledData = {
    clientName: 'Ana Pérez',
    serviceName: 'Primera visita',
    date: 'Martes 10 de junio de 2026',
    time: '14:00',
    professionalName: 'Ps. Stefany Osorio',
    professionalPhone: '+56966898588',
  }

  it('returns a subject including the service name', () => {
    const { subject } = appointmentCancelledTemplate(baseData)
    expect(subject).toBe('❌ Tu cita ha sido cancelada — Primera visita')
  })

  it('includes the appointment date and time', () => {
    const { html } = appointmentCancelledTemplate(baseData)
    expect(html).toContain(baseData.date)
    expect(html).toContain(baseData.time)
  })

  it('includes instructions to reagendar with the professional phone', () => {
    const { html } = appointmentCancelledTemplate(baseData)
    expect(html).toContain('reagendar')
    expect(html).toContain(baseData.professionalPhone)
  })

  it('escapes HTML in client-provided fields', () => {
    const { html } = appointmentCancelledTemplate({ ...baseData, clientName: '<script>alert(1)</script>' })
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
  })
})

describe('confirmAttendancePageTemplate', () => {
  it('shows a thank-you message for "confirmed"', () => {
    const html = confirmAttendancePageTemplate({ status: 'confirmed', professionalName: 'Ps. Stefany Osorio' })
    expect(html).toContain('¡Gracias por confirmar!')
    expect(html).toContain('Ps. Stefany Osorio')
  })

  it('shows a different message for "already-confirmed"', () => {
    const html = confirmAttendancePageTemplate({ status: 'already-confirmed', professionalName: 'Ps. Stefany Osorio' })
    expect(html).toContain('Ya habías confirmado')
  })

  it('shows a not-found message for "not-found"', () => {
    const html = confirmAttendancePageTemplate({ status: 'not-found' })
    expect(html).toContain('Cita no encontrada')
  })
})

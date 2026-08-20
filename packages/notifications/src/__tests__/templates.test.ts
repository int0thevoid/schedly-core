import { describe, expect, it } from 'vitest'
import { appointmentConfirmationTemplate, type AppointmentConfirmationData } from '../templates/appointment-confirmation.js'
import { appointmentReminderTemplate, type AppointmentReminderData } from '../templates/appointment-reminder.js'
import { professionalNewBookingTemplate, type ProfessionalNewBookingData } from '../templates/professional-new-booking.js'
import { appointmentModifiedTemplate, type AppointmentModifiedData } from '../templates/appointment-modified.js'
import { appointmentCancelledByPatientTemplate, type AppointmentCancelledByPatientData } from '../templates/appointment-cancelled-by-patient.js'
import { professionalCancellationNoticeTemplate, type ProfessionalCancellationNoticeData } from '../templates/professional-cancellation-notice.js'
import { reviewRequestTemplate, type ReviewRequestData } from '../templates/review-request.js'
import { confirmAttendancePageTemplate } from '../templates/confirm-attendance-page.js'
import { dailyDigestTemplate, type DailyDigestData } from '../templates/daily-digest.js'
import { generateGoogleCalendarUrl } from '../utils/google-calendar.js'

describe('appointmentConfirmationTemplate', () => {
  const baseData: AppointmentConfirmationData = {
    clientName: 'Ana Pérez',
    serviceName: 'Primera visita',
    date: 'Martes, 10 de junio de 2026',
    startTime: '14:00',
    endTime: '14:45',
    modality: 'presential',
    address: 'Espacio Henko · Buenos Aires 1088, Villa Alemana',
    price: 30000,
    professionalName: 'Ps. Stefany Osorio',
    professionalPhone: '+56966898588',
    modifyUrl: 'https://agenda.example.com/cita/token123/modificar',
    cancelUrl: 'https://agenda.example.com/cita/token123/anular',
    googleCalendarUrl: 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=Primera+visita',
    startDateTime: new Date('2026-06-10T14:00:00.000Z'),
    endDateTime: new Date('2026-06-10T14:45:00.000Z'),
  }

  it('subject includes service name and date', () => {
    const { subject } = appointmentConfirmationTemplate(baseData)
    expect(subject).toBe('📋 Tu cita ha sido agendada — Primera visita el Martes, 10 de junio de 2026')
  })

  it('includes a Google Maps link for presential appointments', () => {
    const { html } = appointmentConfirmationTemplate(baseData)
    expect(html).toContain('https://www.google.com/maps/search/?api=1&query=')
    expect(html).toContain('Ver en Google Maps')
  })

  it('does not include Google Maps link for online appointments', () => {
    const { html } = appointmentConfirmationTemplate({ ...baseData, modality: 'online', address: undefined })
    expect(html).not.toContain('Ver en Google Maps')
  })

  it('shows start and end times', () => {
    const { html } = appointmentConfirmationTemplate(baseData)
    expect(html).toContain('14:00')
    expect(html).toContain('14:45')
  })

  it('includes modify and cancel buttons', () => {
    const { html } = appointmentConfirmationTemplate(baseData)
    expect(html).toContain('https://agenda.example.com/cita/token123/modificar')
    expect(html).toContain('https://agenda.example.com/cita/token123/anular')
    expect(html).toContain('Modificar cita')
    expect(html).toContain('Anular cita')
  })

  it('includes Google Calendar button', () => {
    const { html } = appointmentConfirmationTemplate(baseData)
    expect(html).toContain('calendar.google.com')
    expect(html).toContain('Agregar a Google Calendar')
  })

  it('includes modification deadline notice (23:00 del día anterior)', () => {
    const { html } = appointmentConfirmationTemplate(baseData)
    expect(html).toContain('23:00')
  })

  it('includes the professional phone in the footer', () => {
    const { html } = appointmentConfirmationTemplate(baseData)
    expect(html).toContain('+56966898588')
  })

  it('escapes HTML in client-provided fields', () => {
    const { html } = appointmentConfirmationTemplate({ ...baseData, clientName: '<script>alert(1)</script>' })
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('does not include address when modality is online', () => {
    const { html } = appointmentConfirmationTemplate({ ...baseData, modality: 'online', address: undefined })
    expect(html).not.toContain('Buenos Aires 1088')
  })
})

describe('appointmentReminderTemplate', () => {
  const baseData: AppointmentReminderData = {
    clientName: 'Ana Pérez',
    serviceName: 'Primera visita',
    date: 'Martes, 10 de junio de 2026',
    startTime: '14:00',
    endTime: '14:45',
    modality: 'online',
    googleCalendarUrl: 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=Primera+visita',
    startDateTime: new Date('2026-06-10T14:00:00.000Z'),
    endDateTime: new Date('2026-06-10T14:45:00.000Z'),
    timing: 'same_day',
    professionalPhone: '+56966898588',
    paymentStatus: 'paid',
    price: 30000,
    transferData: {
      rut: '12.345.678-5',
      bank: 'Banco Estado',
      accountType: 'Cuenta Vista / RUT',
      accountNumber: '12345678',
      email: 'pagos@test.com',
    },
  }

  it('subject is "Todo listo para tu sesión de hoy" cuando timing es same_day', () => {
    const { subject } = appointmentReminderTemplate(baseData)
    expect(subject).toBe('🩵 Todo listo para tu sesión de hoy')
  })

  it('tells the client their session is in 2 hours cuando timing es same_day', () => {
    const { html } = appointmentReminderTemplate(baseData)
    expect(html).toContain('2 horas')
  })

  it('subject y copy cambian a "mañana" cuando timing es day_before', () => {
    const { subject, html } = appointmentReminderTemplate({ ...baseData, timing: 'day_before' })
    expect(subject).toBe('🩵 Recordatorio: tu sesión es mañana')
    expect(html).toContain('mañana')
    expect(html).not.toContain('2 horas')
  })

  it('incluye la sección de pago pendiente + link de WhatsApp cuando paymentStatus es unpaid', () => {
    const { html } = appointmentReminderTemplate({ ...baseData, paymentStatus: 'unpaid' })
    expect(html).toContain('Pago pendiente')
    expect(html).toContain('Enviar comprobante por WhatsApp')
    expect(html).toContain('wa.me')
  })

  it('no incluye la sección de pago pendiente cuando paymentStatus es paid', () => {
    const { html } = appointmentReminderTemplate({ ...baseData, paymentStatus: 'paid' })
    expect(html).not.toContain('Pago pendiente')
    expect(html).not.toContain('Enviar comprobante por WhatsApp')
  })

  it('includes the appointment date and times', () => {
    const { html } = appointmentReminderTemplate(baseData)
    expect(html).toContain(baseData.date)
    expect(html).toContain('14:00')
    expect(html).toContain('14:45')
  })

  it('includes Google Calendar button', () => {
    const { html } = appointmentReminderTemplate(baseData)
    expect(html).toContain('calendar.google.com')
    expect(html).toContain('Agregar a Google Calendar')
  })

  it('includes meet link for online when provided', () => {
    const { html } = appointmentReminderTemplate({ ...baseData, meetLink: 'https://meet.google.com/abc-xyz' })
    expect(html).toContain('https://meet.google.com/abc-xyz')
  })

  it('does not include meet link when absent', () => {
    const { html } = appointmentReminderTemplate(baseData)
    expect(html).not.toContain('meet.google.com')
  })

  it('includes address for presential appointments', () => {
    const { html } = appointmentReminderTemplate({ ...baseData, modality: 'presential', address: 'Buenos Aires 1088, Villa Alemana' })
    expect(html).toContain('Buenos Aires 1088')
  })

  it('does not include address when absent', () => {
    const { html } = appointmentReminderTemplate(baseData)
    expect(html).not.toContain('Buenos Aires')
  })
})

describe('professionalNewBookingTemplate', () => {
  const baseData: ProfessionalNewBookingData = {
    clientName: 'Ana Pérez',
    clientEmail: 'ana@test.com',
    clientPhone: '+56912345678',
    serviceName: 'Primera visita',
    date: 'Martes, 10 de junio de 2026',
    startTime: '14:00',
    endTime: '14:45',
    modality: 'Presencial',
    price: 30000,
    adminUrl: 'https://admin.example.com/admin/agenda',
  }

  it('subject includes client name and date', () => {
    const { subject } = professionalNewBookingTemplate(baseData)
    expect(subject).toBe('🔔 Nueva reserva — Ana Pérez el Martes, 10 de junio de 2026')
  })

  it('includes all client contact data', () => {
    const { html } = professionalNewBookingTemplate(baseData)
    expect(html).toContain('ana@test.com')
    expect(html).toContain('+56912345678')
  })

  it('includes appointment details', () => {
    const { html } = professionalNewBookingTemplate(baseData)
    expect(html).toContain('Primera visita')
    expect(html).toContain('14:00')
    expect(html).toContain('14:45')
  })

  it('includes a link to the admin panel', () => {
    const { html } = professionalNewBookingTemplate(baseData)
    expect(html).toContain('https://admin.example.com/admin/agenda')
    expect(html).toContain('Ver en el panel')
  })

  it('escapes HTML in client-provided fields', () => {
    const { html } = professionalNewBookingTemplate({ ...baseData, clientName: '<script>xss</script>' })
    expect(html).not.toContain('<script>xss</script>')
    expect(html).toContain('&lt;script&gt;')
  })
})

describe('appointmentModifiedTemplate', () => {
  const baseData: AppointmentModifiedData = {
    clientName: 'Ana Pérez',
    originalDate: 'Lunes, 9 de junio de 2026',
    originalTime: '10:00',
    newServiceName: 'Primera visita',
    newDate: 'Martes, 10 de junio de 2026',
    newStartTime: '14:00',
    newEndTime: '14:45',
    modality: 'presential',
    address: 'Buenos Aires 1088, Villa Alemana',
    price: 30000,
    professionalName: 'Ps. Stefany Osorio',
    professionalPhone: '+56966898588',
    modifyUrl: 'https://agenda.example.com/cita/newtoken/modificar',
    cancelUrl: 'https://agenda.example.com/cita/newtoken/anular',
    googleCalendarUrl: 'https://calendar.google.com/calendar/render?action=TEMPLATE',
    newStartDateTime: new Date('2026-06-10T14:00:00.000Z'),
    newEndDateTime: new Date('2026-06-10T14:45:00.000Z'),
  }

  it('subject includes new date', () => {
    const { subject } = appointmentModifiedTemplate(baseData)
    expect(subject).toBe('✏️ Tu cita ha sido modificada — Martes, 10 de junio de 2026')
  })

  it('mentions that the original appointment was cancelled', () => {
    const { html } = appointmentModifiedTemplate(baseData)
    expect(html).toContain('Lunes, 9 de junio de 2026')
    expect(html).toContain('cancelada')
  })

  it('shows the new appointment details', () => {
    const { html } = appointmentModifiedTemplate(baseData)
    expect(html).toContain('Martes, 10 de junio de 2026')
    expect(html).toContain('14:00')
    expect(html).toContain('14:45')
  })

  it('includes modify and cancel buttons with new token URLs', () => {
    const { html } = appointmentModifiedTemplate(baseData)
    expect(html).toContain('https://agenda.example.com/cita/newtoken/modificar')
    expect(html).toContain('https://agenda.example.com/cita/newtoken/anular')
  })

  it('includes Google Calendar button', () => {
    const { html } = appointmentModifiedTemplate(baseData)
    expect(html).toContain(baseData.googleCalendarUrl)
    expect(html).toContain('Agregar a Google Calendar')
  })

  it('includes address for presential appointments', () => {
    const { html } = appointmentModifiedTemplate(baseData)
    expect(html).toContain('Buenos Aires 1088')
  })

  it('does not include address when absent (online)', () => {
    const { html } = appointmentModifiedTemplate({ ...baseData, modality: 'online', address: undefined })
    expect(html).not.toContain('Buenos Aires')
  })
})

describe('appointmentCancelledByPatientTemplate', () => {
  const baseData: AppointmentCancelledByPatientData = {
    clientName: 'Ana Pérez',
    serviceName: 'Primera visita',
    date: 'Martes, 10 de junio de 2026',
    startTime: '14:00',
    professionalName: 'Ps. Stefany Osorio',
    bookingUrl: 'https://agenda.example.com',
  }

  it('subject says "Tu cita ha sido anulada"', () => {
    const { subject } = appointmentCancelledByPatientTemplate(baseData)
    expect(subject).toBe('❌ Tu cita ha sido anulada')
  })

  it('confirms the specific appointment that was cancelled', () => {
    const { html } = appointmentCancelledByPatientTemplate(baseData)
    expect(html).toContain('Ana Pérez')
    expect(html).toContain('Martes, 10 de junio de 2026')
    expect(html).toContain('14:00')
    expect(html).toContain('anulada')
  })

  it('includes a booking link for rescheduling', () => {
    const { html } = appointmentCancelledByPatientTemplate(baseData)
    expect(html).toContain('https://agenda.example.com')
    expect(html).toContain('Agendar nueva cita')
  })

  it('escapes HTML in client name', () => {
    const { html } = appointmentCancelledByPatientTemplate({ ...baseData, clientName: '<b>xss</b>' })
    expect(html).not.toContain('<b>xss</b>')
    expect(html).toContain('&lt;b&gt;')
  })
})

describe('professionalCancellationNoticeTemplate', () => {
  const baseData: ProfessionalCancellationNoticeData = {
    clientName: 'Ana Pérez',
    clientEmail: 'ana@test.com',
    clientPhone: '+56912345678',
    serviceName: 'Primera visita',
    date: 'Martes, 10 de junio de 2026',
    startTime: '14:00',
    adminUrl: 'https://admin.example.com/admin/agenda',
  }

  it('subject includes client name and date', () => {
    const { subject } = professionalCancellationNoticeTemplate(baseData)
    expect(subject).toBe('🔔 Cita anulada — Ana Pérez el Martes, 10 de junio de 2026')
  })

  it('states who cancelled and when', () => {
    const { html } = professionalCancellationNoticeTemplate(baseData)
    expect(html).toContain('Ana Pérez')
    expect(html).toContain('Martes, 10 de junio de 2026')
    expect(html).toContain('14:00')
    expect(html).toContain('anuló')
  })

  it('includes patient contact data', () => {
    const { html } = professionalCancellationNoticeTemplate(baseData)
    expect(html).toContain('ana@test.com')
    expect(html).toContain('+56912345678')
  })

  it('includes a link to the admin panel', () => {
    const { html } = professionalCancellationNoticeTemplate(baseData)
    expect(html).toContain('https://admin.example.com/admin/agenda')
    expect(html).toContain('Ver en el panel')
  })
})

describe('generateGoogleCalendarUrl', () => {
  const params = {
    title: 'Primera visita - Ps. Stefany Osorio',
    startDateTime: new Date('2026-06-10T14:00:00Z'),
    endDateTime: new Date('2026-06-10T14:45:00Z'),
    description: 'Sesión de psicología',
  }

  it('generates a valid Google Calendar URL', () => {
    const url = generateGoogleCalendarUrl(params)
    expect(url).toContain('https://calendar.google.com/calendar/render')
    expect(url).toContain('action=TEMPLATE')
    expect(url).toContain('20260610T140000Z')
    expect(url).toContain('20260610T144500Z')
  })

  it('includes the title', () => {
    const url = generateGoogleCalendarUrl(params)
    expect(url).toContain('Primera+visita')
  })

  it('includes the description', () => {
    const url = generateGoogleCalendarUrl(params)
    expect(url).toContain('Sesi%C3%B3n+de+psicolog%C3%ADa')
  })

  it('includes location when provided', () => {
    const url = generateGoogleCalendarUrl({ ...params, location: 'Buenos Aires 1088, Villa Alemana' })
    expect(url).toContain('location=')
    expect(url).toContain('Villa+Alemana')
  })

  it('does not include location when absent', () => {
    const url = generateGoogleCalendarUrl(params)
    expect(url).not.toContain('location=')
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

  it('includes appointment data', () => {
    const { html } = dailyDigestTemplate(baseData)
    expect(html).toContain('14:00')
    expect(html).toContain('Ana Pérez')
  })

  it('shows "No tienes citas para mañana" when appointments is empty', () => {
    const { html } = dailyDigestTemplate({ ...baseData, appointments: [] })
    expect(html).toContain('No tienes citas para mañana')
  })
})

describe('confirmAttendancePageTemplate', () => {
  it('shows a thank-you message for "confirmed"', () => {
    const html = confirmAttendancePageTemplate({ status: 'confirmed', professionalName: 'Ps. Stefany Osorio' })
    expect(html).toContain('¡Gracias por confirmar!')
  })

  it('shows a not-found message for "not-found"', () => {
    const html = confirmAttendancePageTemplate({ status: 'not-found' })
    expect(html).toContain('Cita no encontrada')
  })
})

import type {
  AppointmentConfirmationData,
  AppointmentModifiedData,
  AppointmentReminderData,
  AppointmentCancelledByPatientData,
  ProfessionalCancellationNoticeData,
  ProfessionalNewBookingData,
  DailyDigestAppointment,
  DailyDigestData,
} from '@schedly/notifications'
import type { Appointment, Professional, Service } from '../generated/prisma/index.js'
import { generateGoogleCalendarUrl } from '@schedly/notifications'

export type AppointmentWithService = Appointment & { service: Service }

export function formatAppointmentDate(date: Date, timezone: string): string {
  const weekday = new Intl.DateTimeFormat('es-CL', { timeZone: timezone, weekday: 'long' }).format(date)
  const rest = new Intl.DateTimeFormat('es-CL', { timeZone: timezone, day: 'numeric', month: 'long', year: 'numeric' }).format(date)
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)}, ${rest}`
}

export function formatAppointmentTime(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('es-CL', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false }).format(date)
}

export function formatAppointmentTimeRange(start: Date, end: Date, timezone: string): string {
  const fmt = new Intl.DateTimeFormat('es-CL', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false })
  return `${fmt.format(start)} - ${fmt.format(end)}`
}

function toModality(modality: string): 'presential' | 'online' {
  return modality === 'online' ? 'online' : 'presential'
}

function buildAdminAgendaUrl(): string {
  const base = process.env.ADMIN_URL ?? 'http://localhost:5173'
  return `${base}/admin/agenda`
}

function buildTokenUrl(token: string, action: 'modificar' | 'anular'): string {
  const base = process.env.FRONTEND_URL ?? 'http://localhost:5173'
  return `${base}/cita/${token}/${action}`
}

function buildBookingUrl(): string {
  return process.env.FRONTEND_URL ?? 'http://localhost:5173'
}

function buildGoogleCalendarUrl(appointment: AppointmentWithService, professional: Professional): string {
  const modality = toModality(appointment.modality)
  const location = modality === 'presential' ? (process.env.PROFESSIONAL_ADDRESS ?? undefined) : undefined
  return generateGoogleCalendarUrl({
    title: `${appointment.service.name} — ${professional.name}`,
    startDateTime: appointment.startDateTime,
    endDateTime: appointment.endDateTime,
    description: `Sesión de psicología con ${professional.name}`,
    location,
  })
}

export function getAppointmentColorInfo(appointment: {
  paymentStatus: string
  attendanceConfirmed: boolean
}): { color: string; colorLabel: string } {
  const paid = appointment.paymentStatus === 'paid'
  if (appointment.attendanceConfirmed) {
    return paid
      ? { color: '#8FA88B', colorLabel: 'Confirmado y pagado' }
      : { color: '#6B9BC3', colorLabel: 'Confirmado, pago pendiente' }
  }
  return paid
    ? { color: '#E9C46A', colorLabel: 'Pagado, sin confirmar asistencia' }
    : { color: '#E76F51', colorLabel: 'Sin confirmar ni pagar' }
}

export function buildAppointmentConfirmationData(
  appointment: AppointmentWithService,
  professional: Professional,
): AppointmentConfirmationData {
  const modality = toModality(appointment.modality)
  const token = appointment.appointmentToken ?? ''
  return {
    clientName: appointment.clientName,
    serviceName: appointment.service.name,
    date: formatAppointmentDate(appointment.startDateTime, professional.timezone),
    startTime: formatAppointmentTime(appointment.startDateTime, professional.timezone),
    endTime: formatAppointmentTime(appointment.endDateTime, professional.timezone),
    modality,
    address: modality === 'presential' ? process.env.PROFESSIONAL_ADDRESS : undefined,
    price: appointment.service.price,
    professionalName: professional.name,
    professionalPhone: professional.phone ?? '',
    modifyUrl: buildTokenUrl(token, 'modificar'),
    cancelUrl: buildTokenUrl(token, 'anular'),
    googleCalendarUrl: buildGoogleCalendarUrl(appointment, professional),
  }
}

export function buildAppointmentReminderData(
  appointment: AppointmentWithService,
  professional: Professional,
): AppointmentReminderData {
  const modality = toModality(appointment.modality)
  return {
    clientName: appointment.clientName,
    serviceName: appointment.service.name,
    date: formatAppointmentDate(appointment.startDateTime, professional.timezone),
    startTime: formatAppointmentTime(appointment.startDateTime, professional.timezone),
    endTime: formatAppointmentTime(appointment.endDateTime, professional.timezone),
    modality,
    address: modality === 'presential' ? process.env.PROFESSIONAL_ADDRESS : undefined,
    googleCalendarUrl: buildGoogleCalendarUrl(appointment, professional),
  }
}

export function buildNewBookingForProfessionalData(
  appointment: AppointmentWithService,
  professional: Professional,
): ProfessionalNewBookingData {
  const modality = toModality(appointment.modality)
  return {
    clientName: appointment.clientName,
    clientEmail: appointment.clientEmail,
    clientPhone: appointment.clientPhone,
    serviceName: appointment.service.name,
    date: formatAppointmentDate(appointment.startDateTime, professional.timezone),
    startTime: formatAppointmentTime(appointment.startDateTime, professional.timezone),
    endTime: formatAppointmentTime(appointment.endDateTime, professional.timezone),
    modality: modality === 'presential' ? 'Presencial' : 'Online',
    price: appointment.service.price,
    adminUrl: buildAdminAgendaUrl(),
  }
}

export function buildAppointmentModifiedData(
  originalAppointment: AppointmentWithService,
  newAppointment: AppointmentWithService,
  professional: Professional,
): AppointmentModifiedData {
  const modality = toModality(newAppointment.modality)
  const newToken = newAppointment.appointmentToken ?? ''
  return {
    clientName: newAppointment.clientName,
    originalDate: formatAppointmentDate(originalAppointment.startDateTime, professional.timezone),
    originalTime: formatAppointmentTime(originalAppointment.startDateTime, professional.timezone),
    newServiceName: newAppointment.service.name,
    newDate: formatAppointmentDate(newAppointment.startDateTime, professional.timezone),
    newStartTime: formatAppointmentTime(newAppointment.startDateTime, professional.timezone),
    newEndTime: formatAppointmentTime(newAppointment.endDateTime, professional.timezone),
    modality,
    address: modality === 'presential' ? process.env.PROFESSIONAL_ADDRESS : undefined,
    price: newAppointment.service.price,
    professionalName: professional.name,
    professionalPhone: professional.phone ?? '',
    modifyUrl: buildTokenUrl(newToken, 'modificar'),
    cancelUrl: buildTokenUrl(newToken, 'anular'),
    googleCalendarUrl: buildGoogleCalendarUrl(newAppointment, professional),
  }
}

export function buildAppointmentCancelledByPatientData(
  appointment: AppointmentWithService,
  professional: Professional,
): AppointmentCancelledByPatientData {
  return {
    clientName: appointment.clientName,
    serviceName: appointment.service.name,
    date: formatAppointmentDate(appointment.startDateTime, professional.timezone),
    startTime: formatAppointmentTime(appointment.startDateTime, professional.timezone),
    professionalName: professional.name,
    bookingUrl: buildBookingUrl(),
  }
}

export function buildProfessionalCancellationNoticeData(
  appointment: AppointmentWithService,
  professional: Professional,
): ProfessionalCancellationNoticeData {
  return {
    clientName: appointment.clientName,
    clientEmail: appointment.clientEmail,
    clientPhone: appointment.clientPhone,
    serviceName: appointment.service.name,
    date: formatAppointmentDate(appointment.startDateTime, professional.timezone),
    startTime: formatAppointmentTime(appointment.startDateTime, professional.timezone),
    adminUrl: buildAdminAgendaUrl(),
  }
}

export function buildDailyDigestData(
  appointments: AppointmentWithService[],
  professional: Professional,
  date: string,
): DailyDigestData {
  const digestAppointments: DailyDigestAppointment[] = appointments
    .filter((a) => a.status !== 'cancelled')
    .map((a) => {
      const { color, colorLabel } = getAppointmentColorInfo(a)
      return {
        time: formatAppointmentTime(a.startDateTime, professional.timezone),
        clientName: a.clientName,
        serviceName: a.service.name,
        modality: toModality(a.modality) === 'online' ? 'Online' : 'Presencial',
        color,
        colorLabel,
      }
    })

  return {
    professionalName: professional.name,
    date,
    appointments: digestAppointments,
    adminUrl: buildAdminAgendaUrl(),
  }
}

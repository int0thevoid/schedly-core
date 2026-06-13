import type {
  AppointmentCancelledData,
  AppointmentConfirmationData,
  AppointmentReminderData,
  DailyDigestAppointment,
  DailyDigestData,
  PaymentReminderData,
  TransferData,
} from '@schedly/notifications'
import type { Appointment, Professional, Service } from '../generated/prisma/index.js'
import { getBankName } from '../data/banks.js'

export type AppointmentWithService = Appointment & { service: Service }

/** Formatea una fecha como "Martes 10 de junio de 2026" en la zona horaria del profesional. */
export function formatAppointmentDate(date: Date, timezone: string): string {
  const weekday = new Intl.DateTimeFormat('es-CL', { timeZone: timezone, weekday: 'long' }).format(date)
  const rest = new Intl.DateTimeFormat('es-CL', { timeZone: timezone, day: 'numeric', month: 'long', year: 'numeric' }).format(date)
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} ${rest}`
}

/** Formatea un rango horario como "14:00 - 14:45" en la zona horaria del profesional. */
export function formatAppointmentTimeRange(start: Date, end: Date, timezone: string): string {
  const fmt = new Intl.DateTimeFormat('es-CL', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false })
  return `${fmt.format(start)} - ${fmt.format(end)}`
}

/** Formatea una hora como "14:00" en la zona horaria del profesional. */
export function formatAppointmentTime(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('es-CL', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false }).format(date)
}

function toModality(modality: string): 'presential' | 'online' {
  return modality === 'online' ? 'online' : 'presential'
}

/** Construye la URL pública (sin autenticación) que el cliente usa para confirmar su asistencia. */
function buildConfirmAttendanceUrl(appointmentId: string): string {
  const base = process.env.API_BASE_URL ?? 'http://localhost:3001'
  return `${base}/api/appointments/${appointmentId}/confirm-attendance`
}

/** Construye la URL al panel de administración (agenda) usada en el resumen diario. */
function buildAdminAgendaUrl(): string {
  const base = process.env.ADMIN_URL ?? 'http://localhost:5173'
  return `${base}/admin/agenda`
}

/**
 * Determina el color y la etiqueta de una cita según su estado de pago y de
 * confirmación de asistencia, para usar en el resumen diario del profesional.
 */
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

/** Construye los datos de transferencia del profesional, o undefined si no están todos configurados. */
export function buildTransferData(professional: Professional): TransferData | undefined {
  const { transferRut, transferBank, transferAccountType, transferAccountNumber, transferEmail } = professional
  if (!transferRut || !transferBank || !transferAccountType || !transferAccountNumber || !transferEmail) {
    return undefined
  }
  return {
    rut: transferRut,
    bank: getBankName(transferBank),
    accountType: transferAccountType,
    accountNumber: transferAccountNumber,
    email: transferEmail,
  }
}

export function buildAppointmentConfirmationData(
  appointment: AppointmentWithService,
  professional: Professional
): AppointmentConfirmationData {
  const modality = toModality(appointment.modality)
  return {
    clientName: appointment.clientName,
    serviceName: appointment.service.name,
    date: formatAppointmentDate(appointment.startDateTime, professional.timezone),
    time: formatAppointmentTimeRange(appointment.startDateTime, appointment.endDateTime, professional.timezone),
    modality,
    address: modality === 'presential' ? process.env.PROFESSIONAL_ADDRESS : undefined,
    price: appointment.service.price,
    professionalName: professional.name,
    professionalPhone: professional.phone ?? '',
    transferData: appointment.paymentStatus === 'unpaid' ? buildTransferData(professional) : undefined,
    confirmAttendanceUrl: buildConfirmAttendanceUrl(appointment.id),
  }
}

export function buildAppointmentReminderData(
  appointment: AppointmentWithService,
  professional: Professional,
  hoursUntil: number
): AppointmentReminderData {
  const modality = toModality(appointment.modality)
  return {
    clientName: appointment.clientName,
    serviceName: appointment.service.name,
    date: formatAppointmentDate(appointment.startDateTime, professional.timezone),
    time: formatAppointmentTimeRange(appointment.startDateTime, appointment.endDateTime, professional.timezone),
    modality,
    address: modality === 'presential' ? process.env.PROFESSIONAL_ADDRESS : undefined,
    professionalName: professional.name,
    professionalPhone: professional.phone ?? '',
    hoursUntil,
    confirmAttendanceUrl: hoursUntil === 24 ? buildConfirmAttendanceUrl(appointment.id) : undefined,
  }
}

/** Retorna null si el profesional no tiene configurados los datos de transferencia. */
export function buildPaymentReminderData(appointment: AppointmentWithService, professional: Professional): PaymentReminderData | null {
  const transferData = buildTransferData(professional)
  if (!transferData) return null

  return {
    clientName: appointment.clientName,
    serviceName: appointment.service.name,
    date: formatAppointmentDate(appointment.startDateTime, professional.timezone),
    time: formatAppointmentTimeRange(appointment.startDateTime, appointment.endDateTime, professional.timezone),
    price: appointment.service.price,
    transferData,
    professionalPhone: professional.phone ?? '',
  }
}

/** Construye los datos del resumen diario a partir de las citas (no canceladas) del día siguiente. */
export function buildDailyDigestData(
  appointments: AppointmentWithService[],
  professional: Professional,
  date: string
): DailyDigestData {
  const digestAppointments: DailyDigestAppointment[] = appointments
    .filter((appointment) => appointment.status !== 'cancelled')
    .map((appointment) => {
      const { color, colorLabel } = getAppointmentColorInfo(appointment)
      return {
        time: formatAppointmentTime(appointment.startDateTime, professional.timezone),
        clientName: appointment.clientName,
        serviceName: appointment.service.name,
        modality: toModality(appointment.modality) === 'online' ? 'Online' : 'Presencial',
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

export function buildAppointmentCancelledData(appointment: AppointmentWithService, professional: Professional): AppointmentCancelledData {
  return {
    clientName: appointment.clientName,
    serviceName: appointment.service.name,
    date: formatAppointmentDate(appointment.startDateTime, professional.timezone),
    time: formatAppointmentTimeRange(appointment.startDateTime, appointment.endDateTime, professional.timezone),
    professionalName: professional.name,
    professionalPhone: professional.phone ?? '',
  }
}

import type {
  AppointmentConfirmationData,
  AppointmentReminderData,
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

function toModality(modality: string): 'presential' | 'online' {
  return modality === 'online' ? 'online' : 'presential'
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

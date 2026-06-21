import { EmailService, getAppointmentsNeedingReminder, type AppointmentForReminder } from '@schedly/notifications'
import { prisma } from '../lib/prisma.js'
import {
  buildAppointmentAutoCancelledData,
  buildAppointmentReminderData,
  buildDailyDigestData,
  buildPaymentReminderData,
  formatAppointmentDate,
  type AppointmentWithService,
} from '../lib/notification-data.js'
import { addDaysToDateStr, dayRangeInTZ, nowMinutesInTZ, timeStrToMinutes, todayInTZ } from '../lib/date.js'
import type { Professional } from '../generated/prisma/index.js'

const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000
const DIGEST_WINDOW_MINUTES = 15

/**
 * Revisa las citas pendientes/confirmadas de las próximas 48h y envía los
 * recordatorios (24h, 2h, pago) que correspondan, marcando los campos
 * `*SentAt` para no enviar duplicados.
 */
export async function runNotificationsJob(): Promise<void> {
  const professionalId = process.env.PROFESSIONAL_ID ?? ''
  const professional = await prisma.professional.findUnique({ where: { id: professionalId } })
  if (!professional) {
    console.error('[notifications] professional not found, skipping job')
    return
  }

  const now = new Date()
  const windowEnd = new Date(now.getTime() + FORTY_EIGHT_HOURS_MS)

  const appointments = await prisma.appointment.findMany({
    where: {
      professionalId,
      status: { in: ['pending', 'confirmed'] },
      startDateTime: { gte: now, lte: windowEnd },
    },
    include: { service: true },
  })

  const forReminder: AppointmentForReminder[] = appointments.map((a) => ({
    id: a.id,
    startDateTime: a.startDateTime,
    status: a.status,
    paymentStatus: a.paymentStatus,
    reminderSentAt: a.reminderSentAt,
    reminder2hSentAt: a.reminder2hSentAt,
    paymentReminderSentAt: a.paymentReminderSentAt,
  }))

  const { reminder24h, reminder2h, paymentReminder } = getAppointmentsNeedingReminder(forReminder, now, professional.timezone)

  const byId = new Map<string, AppointmentWithService>(appointments.map((a) => [a.id, a]))
  const emailService = new EmailService()

  for (const { id } of reminder24h) {
    const appointment = byId.get(id)
    if (!appointment) continue
    try {
      await emailService.sendAppointmentReminder(appointment.clientEmail, buildAppointmentReminderData(appointment, professional, 24))
      await prisma.appointment.update({ where: { id }, data: { reminderSentAt: now } })
    } catch (err) {
      console.error(`[notifications] failed to send 24h reminder for appointment ${id}`, err)
    }
  }

  for (const { id } of reminder2h) {
    const appointment = byId.get(id)
    if (!appointment) continue
    try {
      await emailService.sendAppointmentReminder(appointment.clientEmail, buildAppointmentReminderData(appointment, professional, 2))
      await prisma.appointment.update({ where: { id }, data: { reminder2hSentAt: now } })
    } catch (err) {
      console.error(`[notifications] failed to send 2h reminder for appointment ${id}`, err)
    }
  }

  for (const { id } of paymentReminder) {
    const appointment = byId.get(id)
    if (!appointment) continue
    const data = buildPaymentReminderData(appointment, professional)
    if (!data) {
      console.error(`[notifications] missing transfer data for professional ${professional.id}, skipping payment reminder for appointment ${id}`)
      continue
    }
    try {
      await emailService.sendPaymentReminder(appointment.clientEmail, data)
      await prisma.appointment.update({ where: { id }, data: { paymentReminderSentAt: now } })
    } catch (err) {
      console.error(`[notifications] failed to send payment reminder for appointment ${id}`, err)
    }
  }

  await sendDailyDigestIfNeeded(professional, emailService)
}

/**
 * Cancela automáticamente las citas pendientes cuyo plazo de pago ya venció
 * (paymentDeadline < now) y envía un email al cliente explicando la anulación.
 */
export async function autoCancelUnpaidAppointments(): Promise<void> {
  const professionalId = process.env.PROFESSIONAL_ID ?? ''
  const professional = await prisma.professional.findUnique({ where: { id: professionalId } })
  if (!professional) return

  const now = new Date()

  const overdue = await prisma.appointment.findMany({
    where: {
      professionalId,
      status: 'pending',
      paymentStatus: 'unpaid',
      paymentDeadline: { lt: now },
    },
    include: { service: true },
  })

  const emailService = new EmailService()

  for (const appointment of overdue) {
    try {
      await prisma.appointment.update({
        where: { id: appointment.id },
        data: { status: 'cancelled', autoCancelledAt: now },
      })
      await emailService.sendAppointmentAutoCancelled(
        appointment.clientEmail,
        buildAppointmentAutoCancelledData(appointment as AppointmentWithService, professional),
      )
    } catch (err) {
      console.error(`[notifications] failed to auto-cancel appointment ${appointment.id}`, err)
    }
  }
}

/**
 * Si la hora actual (en la zona horaria del profesional) cae dentro de la
 * ventana de `dailyDigestTime` y el resumen no se ha enviado hoy, envía al
 * profesional las citas del día siguiente y marca `lastDailyDigestSentDate`.
 */
export async function sendDailyDigestIfNeeded(professional: Professional, emailService: EmailService): Promise<void> {
  const tz = professional.timezone
  const today = todayInTZ(tz)
  if (professional.lastDailyDigestSentDate === today) return

  const windowStart = timeStrToMinutes(professional.dailyDigestTime)
  const currentMinutes = nowMinutesInTZ(tz)
  if (currentMinutes < windowStart || currentMinutes >= windowStart + DIGEST_WINDOW_MINUTES) return

  const tomorrow = addDaysToDateStr(today, 1)
  const { gte, lte } = dayRangeInTZ(tomorrow, tz)

  const appointments = await prisma.appointment.findMany({
    where: {
      professionalId: professional.id,
      status: { not: 'cancelled' },
      startDateTime: { gte, lte },
    },
    include: { service: true },
    orderBy: { startDateTime: 'asc' },
  })

  const date = formatAppointmentDate(new Date(`${tomorrow}T12:00:00Z`), tz)
  const data = buildDailyDigestData(appointments as AppointmentWithService[], professional, date)

  try {
    await emailService.sendDailyDigest(professional.email, data)
    await prisma.professional.update({ where: { id: professional.id }, data: { lastDailyDigestSentDate: today } })
  } catch (err) {
    console.error(`[notifications] failed to send daily digest for professional ${professional.id}`, err)
  }
}

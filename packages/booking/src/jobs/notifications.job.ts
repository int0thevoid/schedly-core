import { EmailService, getAppointmentsNeedingReminder, type AppointmentForReminder } from '@schedly/notifications'
import { prisma } from '../lib/prisma.js'
import { buildAppointmentReminderData, buildDailyDigestData, formatAppointmentDate, type AppointmentWithService } from '../lib/notification-data.js'
import { addDaysToDateStr, dayRangeInTZ, nowMinutesInTZ, timeStrToMinutes, todayInTZ } from '../lib/date.js'
import type { Professional } from '../generated/prisma/index.js'

const DIGEST_WINDOW_MINUTES = 15

/**
 * Recordatorio único por cita: a las 10:00 del día calendario anterior, o 2 horas antes si la cita
 * es hoy (agendada el mismo día, sin ventana de "día anterior" disponible). Incluye el aviso de pago
 * pendiente + link de WhatsApp cuando corresponde (ver buildAppointmentReminderData).
 */
export async function runNotificationsJob(): Promise<void> {
  const professionalId = process.env.PROFESSIONAL_ID ?? ''
  const professional = await prisma.professional.findUnique({ where: { id: professionalId } })
  if (!professional) {
    console.error('[notifications] professional not found, skipping job')
    return
  }

  const now = new Date()
  const tomorrow = addDaysToDateStr(todayInTZ(professional.timezone), 1)
  const windowEnd = dayRangeInTZ(tomorrow, professional.timezone).lte

  const appointments = await prisma.appointment.findMany({
    where: {
      professionalId,
      status: { not: 'cancelled' },
      startDateTime: { gt: now, lte: windowEnd },
      reminderSentAt: null,
    },
    include: { service: true },
  })

  const { reminder } = getAppointmentsNeedingReminder(
    appointments as unknown as AppointmentForReminder[],
    now,
    professional.timezone,
  )

  const emailService = new EmailService()

  for (const { appointment, timing } of reminder) {
    const fullAppointment = appointments.find(a => a.id === appointment.id) as AppointmentWithService
    try {
      const data = buildAppointmentReminderData(fullAppointment, professional, timing)
      await emailService.sendAppointmentReminder(fullAppointment.clientEmail, data)
      await prisma.appointment.update({ where: { id: appointment.id }, data: { reminderSentAt: now } })
    } catch (err) {
      console.error(`[notifications] failed to send reminder for appointment ${appointment.id}`, err)
    }
  }
}

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

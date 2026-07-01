import { EmailService } from '@schedly/notifications'
import { prisma } from '../lib/prisma.js'
import { buildAppointmentReminderData, buildDailyDigestData, formatAppointmentDate, type AppointmentWithService } from '../lib/notification-data.js'
import { addDaysToDateStr, dayRangeInTZ, nowMinutesInTZ, timeStrToMinutes, todayInTZ } from '../lib/date.js'
import type { Professional } from '../generated/prisma/index.js'

const TWO_HOURS_MS = 2 * 60 * 60 * 1000
const DIGEST_WINDOW_MINUTES = 15

export async function runNotificationsJob(): Promise<void> {
  const professionalId = process.env.PROFESSIONAL_ID ?? ''
  const professional = await prisma.professional.findUnique({ where: { id: professionalId } })
  if (!professional) {
    console.error('[notifications] professional not found, skipping job')
    return
  }

  const now = new Date()
  const windowEnd = new Date(now.getTime() + TWO_HOURS_MS)

  const appointments = await prisma.appointment.findMany({
    where: {
      professionalId,
      status: { not: 'cancelled' },
      startDateTime: { gt: now, lte: windowEnd },
      reminder2hSentAt: null,
    },
    include: { service: true },
  })

  const emailService = new EmailService()

  for (const appointment of appointments) {
    try {
      const data = buildAppointmentReminderData(appointment as AppointmentWithService, professional)
      await emailService.sendAppointmentReminder(appointment.clientEmail, data)
      await prisma.appointment.update({ where: { id: appointment.id }, data: { reminder2hSentAt: now } })
    } catch (err) {
      console.error(`[notifications] failed to send 2h reminder for appointment ${appointment.id}`, err)
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

import { EmailService, getAppointmentsNeedingReminder, type AppointmentForReminder } from '@schedly/notifications'
import { prisma } from '../lib/prisma.js'
import { buildAppointmentReminderData, buildPaymentReminderData, type AppointmentWithService } from '../lib/notification-data.js'

const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000

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
}

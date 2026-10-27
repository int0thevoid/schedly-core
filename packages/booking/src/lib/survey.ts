import { randomUUID } from 'node:crypto'
import { prisma } from './prisma.js'
import { getEmailService } from './email-service.js'

// Encuesta post-sesión (US-100): se envía cuando Stefany marca la sesión como "Asistió", si la
// paciente la aceptó al agendar (US-099), no se dio de baja y no recibió encuesta ni dejó reseña en
// los últimos 30 días.

const SURVEY_COOLDOWN_DAYS = 30

type SurveyResult = 'sent' | 'not_eligible' | 'opted_out' | 'recent' | 'failed'

function frontendUrl(path: string): string {
  return `${process.env.FRONTEND_URL ?? 'http://localhost:5173'}${path}`
}

/** "martes 20 de octubre" (para el asunto: "¿Qué te pareció tu sesión del martes 20 de octubre?"). */
function shortSessionDate(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('es-CL', { timeZone: timezone, weekday: 'long', day: 'numeric', month: 'long' })
    .format(date)
    .replace(',', '')
}

export function newReviewToken(): string {
  return `rev_${randomUUID()}`
}

async function isOptedOut(email: string): Promise<boolean> {
  const row = await prisma.surveyOptOut.findUnique({ where: { email: email.toLowerCase() } })
  return Boolean(row)
}

/** ¿Recibió una encuesta o dejó una reseña en los últimos 30 días? (regla "máximo 1 vez al mes") */
async function hasRecentSurveyOrReview(email: string, excludeAppointmentId: string): Promise<boolean> {
  const since = new Date(Date.now() - SURVEY_COOLDOWN_DAYS * 24 * 60 * 60 * 1000)
  const sameEmail = { equals: email, mode: 'insensitive' as const }
  const recentSurvey = await prisma.appointment.findFirst({
    where: { clientEmail: sameEmail, id: { not: excludeAppointmentId }, surveySentAt: { gte: since } },
    select: { id: true },
  })
  if (recentSurvey) return true
  const appointments = await prisma.appointment.findMany({ where: { clientEmail: sameEmail }, select: { id: true } })
  if (appointments.length === 0) return false
  const recentReview = await prisma.review.findFirst({
    where: { appointmentId: { in: appointments.map((a) => a.id) }, createdAt: { gte: since } },
    select: { id: true },
  })
  return Boolean(recentReview)
}

export async function sendPostSessionSurveyIfEligible(appointmentId: string): Promise<SurveyResult> {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: { service: true, professional: true },
  })
  if (
    !appointment ||
    appointment.status === 'cancelled' ||
    appointment.outcome !== 'attended' ||
    !appointment.surveyOptIn ||
    appointment.surveySentAt
  ) {
    return 'not_eligible'
  }
  if (await isOptedOut(appointment.clientEmail)) return 'opted_out'
  if (await hasRecentSurveyOrReview(appointment.clientEmail, appointment.id)) return 'recent'

  // Se "reserva" el envío antes de mandar el correo: si Stefany cambia el resultado dos veces
  // seguidas, solo una petición gana y la paciente recibe un solo correo.
  const token = appointment.reviewToken ?? newReviewToken()
  const claimed = await prisma.appointment.updateMany({
    where: { id: appointment.id, surveySentAt: null },
    data: { surveySentAt: new Date(), reviewToken: token },
  })
  if (claimed.count === 0) return 'not_eligible'

  try {
    await getEmailService().sendReviewRequest(appointment.clientEmail, {
      clientName: appointment.clientName.trim().split(/\s+/)[0] ?? appointment.clientName,
      serviceName: appointment.service.name,
      professionalName: appointment.professional.name,
      sessionDate: shortSessionDate(appointment.startDateTime, appointment.professional.timezone),
      reviewUrl: frontendUrl(`/resena/${token}`),
      unsubscribeUrl: frontendUrl(`/encuestas/baja/${token}`),
      googleReviewLink: process.env.GOOGLE_REVIEW_LINK || undefined,
    })
    return 'sent'
  } catch (err) {
    console.error(`[survey] failed to send survey for appointment ${appointment.id}`, err)
    await prisma.appointment.update({ where: { id: appointment.id }, data: { surveySentAt: null } })
    return 'failed'
  }
}

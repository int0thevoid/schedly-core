import type { Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma.js'
import { fail, ok } from '../../lib/response.js'
import { initials } from '../../lib/review-name.js'
import { newReviewToken } from '../../lib/survey.js'

// Moderación de reseñas (US-073), enlace de reseña por sesión (US-072) e importación única desde
// Agify (US-097).

const listSchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
})

const statusSchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected']),
})

const replySchema = z.object({
  reply: z.string().trim().max(1500).nullable(),
})

const agifyImportSchema = z.object({
  profileId: z.string().uuid(),
})

export async function listAdminReviews(req: Request, res: Response): Promise<void> {
  const parsed = listSchema.safeParse(req.query)
  if (!parsed.success) {
    fail(res, 'Parámetros inválidos', 400)
    return
  }
  const professionalId = req.professionalId ?? ''
  const [reviews, grouped] = await Promise.all([
    prisma.review.findMany({
      where: { professionalId, ...(parsed.data.status ? { status: parsed.data.status } : {}) },
      orderBy: { reviewedAt: 'desc' },
    }),
    prisma.review.groupBy({ by: ['status'], where: { professionalId }, _count: { _all: true } }),
  ])

  // Trazabilidad: sesión evaluada y paciente (nombre real), para verificar antes de aprobar.
  const appointmentIds = reviews.map((r) => r.appointmentId).filter((id): id is string => Boolean(id))
  const appointments = appointmentIds.length
    ? await prisma.appointment.findMany({
        where: { id: { in: appointmentIds } },
        select: { id: true, startDateTime: true, clientName: true, clientEmail: true },
      })
    : []
  const byId = new Map(appointments.map((a) => [a.id, a]))

  const counts = { pending: 0, approved: 0, rejected: 0 }
  for (const g of grouped) {
    if (g.status in counts) counts[g.status as keyof typeof counts] = g._count._all
  }

  ok(res, {
    items: reviews.map((r) => ({ ...r, appointment: r.appointmentId ? byId.get(r.appointmentId) ?? null : null })),
    counts,
  })
}

async function findOwnReview(req: Request) {
  const { id } = req.params as { id: string }
  return prisma.review.findFirst({ where: { id, professionalId: req.professionalId ?? '' } })
}

export async function updateReviewStatus(req: Request, res: Response): Promise<void> {
  const parsed = statusSchema.safeParse(req.body)
  if (!parsed.success) {
    fail(res, 'Estado inválido', 400)
    return
  }
  const review = await findOwnReview(req)
  if (!review) {
    fail(res, 'Reseña no encontrada', 404)
    return
  }
  const updated = await prisma.review.update({
    where: { id: review.id },
    data: { status: parsed.data.status, moderatedAt: parsed.data.status === 'pending' ? null : new Date() },
  })
  ok(res, updated)
}

export async function updateReviewReply(req: Request, res: Response): Promise<void> {
  const parsed = replySchema.safeParse(req.body)
  if (!parsed.success) {
    fail(res, 'Respuesta inválida', 400)
    return
  }
  const review = await findOwnReview(req)
  if (!review) {
    fail(res, 'Reseña no encontrada', 404)
    return
  }
  const reply = parsed.data.reply || null
  const updated = await prisma.review.update({
    where: { id: review.id },
    data: { publicReply: reply, repliedAt: reply ? new Date() : null },
  })
  ok(res, updated)
}

function reviewUrl(token: string): string {
  const base = process.env.FRONTEND_URL ?? 'http://localhost:5173'
  return `${base}/resena/${token}`
}

/** Enlace para que la paciente evalúe esta sesión (para enviarlo por WhatsApp). Solo sesiones a las que asistió. */
export async function getAppointmentReviewLink(req: Request, res: Response): Promise<void> {
  const { id } = req.params as { id: string }
  const appointment = await prisma.appointment.findFirst({
    where: { id, professionalId: req.professionalId ?? '' },
    select: { id: true, status: true, outcome: true, reviewToken: true },
  })
  if (!appointment) {
    fail(res, 'Appointment not found', 404)
    return
  }
  if (appointment.status === 'cancelled' || appointment.outcome !== 'attended') {
    fail(res, 'Solo se puede pedir reseña de una sesión marcada como asistida', 409)
    return
  }
  let token = appointment.reviewToken
  if (!token) {
    token = newReviewToken()
    await prisma.appointment.update({ where: { id }, data: { reviewToken: token } })
  }
  const reviewed = await prisma.review.findUnique({ where: { appointmentId: id }, select: { id: true } })
  ok(res, { url: reviewUrl(token), alreadyReviewed: Boolean(reviewed) })
}

type AgifyEvaluation = {
  id: string
  date: string
  evaluation: number
  comment?: string | null
  isAnonymous: boolean
  client?: { name?: string | null; lastName?: string | null } | null
  service?: { name?: string | null } | null
}

/**
 * Importa (una vez; es idempotente) las evaluaciones públicas del perfil de Agify. Solo se guardan
 * estrellas, texto, fecha, servicio e iniciales: la API pública de Agify también expone email,
 * teléfono y RUT de las pacientes, que se descartan aquí. Se publican aprobadas (DEF-04).
 */
export async function importAgifyReviews(req: Request, res: Response): Promise<void> {
  const parsed = agifyImportSchema.safeParse(req.body)
  if (!parsed.success) {
    fail(res, 'profileId inválido', 400)
    return
  }
  let evaluations: AgifyEvaluation[]
  try {
    const response = await fetch(`https://api.agify.cl/api/p/evaluation/professional/${parsed.data.profileId}`, {
      signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    evaluations = (await response.json()) as AgifyEvaluation[]
    if (!Array.isArray(evaluations)) throw new Error('Respuesta inesperada')
  } catch (err) {
    console.error('[reviews] Agify import failed', err)
    fail(res, 'No se pudo leer Agify', 502)
    return
  }

  const professionalId = req.professionalId ?? ''
  const now = new Date()
  const data = evaluations
    .filter((e) => typeof e.id === 'string' && Number.isInteger(e.evaluation) && e.evaluation >= 1 && e.evaluation <= 5)
    .map((e) => {
      const fullName = `${e.client?.name ?? ''} ${e.client?.lastName ?? ''}`.trim()
      const displayName = e.isAnonymous || !fullName ? null : initials(fullName)
      return {
        professionalId,
        source: 'agify',
        externalId: e.id,
        rating: e.evaluation,
        comment: e.comment?.trim() || null,
        isAnonymous: displayName === null,
        displayName,
        status: 'approved',
        moderatedAt: now,
        serviceName: e.service?.name ?? null,
        reviewedAt: new Date(e.date),
      }
    })
  const result = await prisma.review.createMany({ data, skipDuplicates: true })
  ok(res, { found: evaluations.length, imported: result.count, skipped: data.length - result.count })
}

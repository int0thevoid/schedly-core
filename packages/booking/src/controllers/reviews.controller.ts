import type { Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { fail, ok } from '../lib/response.js'
import { displayNameMatches } from '../lib/review-name.js'

// Reseñas públicas (US-072/101): listado de las aprobadas y formulario por enlace de sesión.

const listSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})

const submitSchema = z
  .object({
    rating: z.number().int().min(1).max(5),
    comment: z.string().trim().min(10, 'La reseña debe tener al menos 10 caracteres').max(1500),
    isAnonymous: z.boolean(),
    displayName: z.string().trim().max(60).optional(),
  })
  .refine((d) => d.isAnonymous || (d.displayName?.length ?? 0) >= 2, {
    message: 'Escribe tu nombre o elige publicar como anónima',
    path: ['displayName'],
  })

const PUBLIC_SELECT = {
  id: true,
  rating: true,
  comment: true,
  isAnonymous: true,
  displayName: true,
  source: true,
  serviceName: true,
  reviewedAt: true,
  publicReply: true,
  repliedAt: true,
} as const

function professionalId(): string {
  return process.env.PROFESSIONAL_ID ?? ''
}

export async function listPublicReviews(req: Request, res: Response): Promise<void> {
  const parsed = listSchema.safeParse(req.query)
  if (!parsed.success) {
    fail(res, 'Parámetros inválidos', 400)
    return
  }
  const where = { professionalId: professionalId(), status: 'approved' }
  const [items, stats] = await Promise.all([
    prisma.review.findMany({
      where,
      select: PUBLIC_SELECT,
      orderBy: { reviewedAt: 'desc' },
      take: parsed.data.limit,
      skip: parsed.data.offset,
    }),
    prisma.review.aggregate({ where, _avg: { rating: true }, _count: { _all: true } }),
  ])
  ok(res, {
    items: items.map((r) => ({ ...r, displayName: r.isAnonymous ? null : r.displayName })),
    count: stats._count._all,
    average: stats._avg.rating === null ? null : Math.round(stats._avg.rating * 10) / 10,
  })
}

type ReviewableAppointment = {
  id: string
  status: string
  outcome: string | null
  startDateTime: Date
  clientName: string
  clientEmail: string
  professionalId: string
  service: { name: string }
}

async function findByReviewToken(token: string): Promise<ReviewableAppointment | null> {
  return prisma.appointment.findUnique({
    where: { reviewToken: token },
    select: {
      id: true,
      status: true,
      outcome: true,
      startDateTime: true,
      clientName: true,
      clientEmail: true,
      professionalId: true,
      service: { select: { name: true } },
    },
  })
}

/** Por qué no se puede reseñar esta sesión (null si se puede). Solo pacientes que asistieron. */
async function blockReason(appointment: ReviewableAppointment): Promise<'cancelled' | 'not_attended' | 'already_reviewed' | null> {
  if (appointment.status === 'cancelled') return 'cancelled'
  if (appointment.outcome !== 'attended') return 'not_attended'
  const existing = await prisma.review.findUnique({ where: { appointmentId: appointment.id }, select: { id: true } })
  return existing ? 'already_reviewed' : null
}

export async function getReviewInvitation(req: Request, res: Response): Promise<void> {
  const { token } = req.params as { token: string }
  const appointment = await findByReviewToken(token)
  if (!appointment) {
    fail(res, 'Enlace no válido', 404)
    return
  }
  const reason = await blockReason(appointment)
  ok(res, {
    serviceName: appointment.service.name,
    sessionDate: appointment.startDateTime,
    clientFirstName: appointment.clientName.trim().split(/\s+/)[0] ?? '',
    canReview: reason === null,
    reason,
  })
}

export async function submitReview(req: Request, res: Response): Promise<void> {
  const { token } = req.params as { token: string }
  const parsed = submitSchema.safeParse(req.body)
  if (!parsed.success) {
    fail(res, parsed.error.issues[0]?.message ?? 'Datos inválidos', 400)
    return
  }
  const appointment = await findByReviewToken(token)
  if (!appointment) {
    fail(res, 'Enlace no válido', 404)
    return
  }
  const reason = await blockReason(appointment)
  if (reason === 'already_reviewed') {
    fail(res, 'Ya dejaste una reseña para esta sesión', 409)
    return
  }
  if (reason) {
    fail(res, 'Esta sesión no se puede evaluar', 403)
    return
  }

  const { rating, comment, isAnonymous, displayName } = parsed.data
  const client = await prisma.client.findUnique({ where: { email: appointment.clientEmail }, select: { id: true, name: true } })
  const realName = client?.name ?? appointment.clientName
  const name = isAnonymous ? null : (displayName ?? null)

  try {
    const review = await prisma.review.create({
      data: {
        professionalId: appointment.professionalId,
        source: 'web',
        appointmentId: appointment.id,
        clientId: client?.id ?? null,
        rating,
        comment,
        isAnonymous,
        displayName: name,
        nameMismatch: name !== null && !displayNameMatches(name, realName),
        serviceName: appointment.service.name,
        status: 'pending',
      },
      select: { id: true, status: true },
    })
    ok(res, review, 201)
  } catch (err) {
    // Doble envío simultáneo: la restricción única de appointmentId gana.
    if ((err as { code?: string }).code === 'P2002') {
      fail(res, 'Ya dejaste una reseña para esta sesión', 409)
      return
    }
    throw err
  }
}

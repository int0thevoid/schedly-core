import type { Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma.js'
import { fail, ok } from '../../lib/response.js'

const querySchema = z.object({
  q: z.string().min(1).optional(),
  field: z.enum(['name', 'email', 'rut', 'phone']).optional(),
  email: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
})

const updateSchema = z.object({
  treatmentType: z.string().nullable(),
})

const saveSchema = z.object({
  name: z.string().trim().min(1),
  email: z.string().trim().email(),
  phone: z.string().trim().optional(),
  rut: z.string().trim().optional(),
})

// Tope solo para búsquedas (buscador del formulario de cita manual); la lista completa de
// Pacientes trae todos.
const SEARCH_LIMIT = 20

const CLIENT_SELECT = {
  id: true,
  name: true,
  email: true,
  phone: true,
  rut: true,
  treatmentType: true,
  dataConsentGiven: true,
  createdAt: true,
} as const

export async function listClients(req: Request, res: Response): Promise<void> {
  const parsed = querySchema.safeParse(req.query)
  if (!parsed.success) {
    res.status(400).json({ success: false, error: 'Parámetros inválidos' })
    return
  }

  const { q, field, email, name } = parsed.data

  let where: Record<string, unknown> = {}

  if (q) {
    const searchField = field ?? 'name'
    where = { [searchField]: { contains: q, mode: 'insensitive' } }
  } else {
    if (email) where = { ...where, email: { contains: email, mode: 'insensitive' } }
    if (name) where = { ...where, name: { contains: name, mode: 'insensitive' } }
  }

  const isSearch = Boolean(q || email || name)
  const clients = await prisma.client.findMany({
    where,
    select: CLIENT_SELECT,
    orderBy: { name: 'asc' },
    ...(isSearch ? { take: SEARCH_LIMIT } : {}),
  })

  res.json({ success: true, data: clients })
}

export async function getClient(req: Request, res: Response): Promise<void> {
  const { id } = req.params

  const client = await prisma.client.findUnique({
    where: { id },
    select: CLIENT_SELECT,
  })

  if (!client) {
    fail(res, 'Cliente no encontrado', 404)
    return
  }

  ok(res, client)
}

export async function getClientStats(req: Request, res: Response): Promise<void> {
  const { id } = req.params
  const professionalId = req.professionalId ?? ''

  const client = await prisma.client.findUnique({ where: { id }, select: { email: true } })
  if (!client) {
    fail(res, 'Cliente no encontrado', 404)
    return
  }

  const appointments = await prisma.appointment.findMany({
    where: { clientEmail: client.email, professionalId },
    select: { startDateTime: true, status: true, outcome: true, service: { select: { name: true } } },
    orderBy: { startDateTime: 'desc' },
  })

  const lastAppointment = appointments[0]?.startDateTime?.toISOString() ?? null
  const totalCompleted = appointments.filter((a) => a.outcome === 'attended').length
  const totalCancelled = appointments.filter((a) => a.status === 'cancelled').length
  const servicesUsed = [...new Set(appointments.map((a) => a.service.name))]

  ok(res, { lastAppointment, totalCompleted, totalCancelled, servicesUsed })
}

export async function updateClient(req: Request, res: Response): Promise<void> {
  const { id } = req.params
  const parsed = updateSchema.safeParse(req.body)
  if (!parsed.success) {
    fail(res, parsed.error.issues[0]?.message ?? 'Cuerpo inválido', 400)
    return
  }

  const existing = await prisma.client.findUnique({ where: { id } })
  if (!existing) {
    fail(res, 'Cliente no encontrado', 404)
    return
  }

  const client = await prisma.client.update({
    where: { id },
    data: { treatmentType: parsed.data.treatmentType },
    select: CLIENT_SELECT,
  })

  ok(res, client)
}

/**
 * Guarda o actualiza la ficha de un paciente desde una cita manual del panel (US-083), para que el
 * buscador lo encuentre la próxima vez. Busca por correo sin distinguir mayúsculas para no duplicar.
 * Nunca toca el consentimiento: un paciente nuevo queda sin consentimiento y uno existente lo conserva.
 */
export async function saveClient(req: Request, res: Response): Promise<void> {
  const parsed = saveSchema.safeParse(req.body)
  if (!parsed.success) {
    fail(res, parsed.error.issues[0]?.message ?? 'Cuerpo inválido', 400)
    return
  }
  const { name, email, phone, rut } = parsed.data

  const existing = await prisma.client.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    select: { id: true },
  })

  const client = existing
    ? await prisma.client.update({
        where: { id: existing.id },
        data: { name, ...(phone ? { phone } : {}), ...(rut ? { rut } : {}) },
        select: CLIENT_SELECT,
      })
    : await prisma.client.create({
        data: { email, name, phone: phone || null, rut: rut || null, dataConsentGiven: false },
        select: CLIENT_SELECT,
      })

  ok(res, client, existing ? 200 : 201)
}

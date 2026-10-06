import type { Request, Response } from 'express'
import { prisma } from '../../lib/prisma.js'
import { fail, ok } from '../../lib/response.js'

const HISTORY_LIMIT = 200

const HISTORY_SELECT = {
  id: true,
  createdAt: true,
  actorType: true,
  action: true,
  entity: true,
  entityId: true,
  changes: true,
  source: true,
} as const

/** Historial de una cita del profesional autenticado (US-089). */
export async function getAppointmentHistory(req: Request, res: Response): Promise<void> {
  const id = String(req.params.id)
  const appointment = await prisma.appointment.findFirst({
    where: { id, professionalId: req.professionalId ?? '' },
    select: { id: true },
  })
  if (!appointment) {
    fail(res, 'Appointment not found', 404)
    return
  }

  const history = await prisma.auditLog.findMany({
    where: { entity: 'Appointment', entityId: id },
    select: HISTORY_SELECT,
    orderBy: { createdAt: 'desc' },
    take: HISTORY_LIMIT,
  })
  ok(res, history)
}

/** Historial de un paciente: su ficha y las citas que tiene con el profesional autenticado (US-089). */
export async function getClientHistory(req: Request, res: Response): Promise<void> {
  const id = String(req.params.id)
  const client = await prisma.client.findUnique({ where: { id }, select: { email: true } })
  if (!client) {
    fail(res, 'Cliente no encontrado', 404)
    return
  }

  const appointments = await prisma.appointment.findMany({
    where: { clientEmail: client.email, professionalId: req.professionalId ?? '' },
    select: { id: true },
  })

  const history = await prisma.auditLog.findMany({
    where: {
      OR: [
        { entity: 'Client', entityId: id },
        { entity: 'Appointment', entityId: { in: appointments.map((a) => a.id) } },
      ],
    },
    select: HISTORY_SELECT,
    orderBy: { createdAt: 'desc' },
    take: HISTORY_LIMIT,
  })
  ok(res, history)
}

import type { Request, Response } from 'express'
import { z } from 'zod'
import type { EventPayment, EventRegistration, Prisma } from '../../generated/prisma/index.js'
import { prisma } from '../../lib/prisma.js'
import { fail, ok } from '../../lib/response.js'
import { recordAuditEvent } from '../../lib/audit.js'
import { formatAnswer, parseEventConfig, type Answers, type EventField, type EventPaymentOption } from '../../lib/events.js'
import {
  eventAvailability,
  paidAmount,
  recomputeStatus,
  sendStatusEmail,
} from '../../lib/event-registrations.js'
import { toCsv, toXlsx, type Cell, type Table } from '../../lib/spreadsheet.js'

/**
 * Panel → Vitrina → evento → Inscritos (US-123).
 * Los datos de salud solo los ve la cuenta principal de la profesional (no las cuentas adicionales).
 */

function canSeeSensitive(req: Request): boolean {
  return !req.adminUserId
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendiente de pago',
  reserved: 'Reserva confirmada (pago parcial)',
  paid: 'Pagado completo',
  cancelled: 'Cancelada',
  waitlist: 'Lista de espera',
}

type RegistrationRow = EventRegistration & { payments: EventPayment[] }

function serializeRegistration(reg: RegistrationRow, includeSensitive: boolean, now: Date) {
  const paid = paidAmount(reg.payments)
  const option = reg.paymentSnapshot as unknown as EventPaymentOption
  return {
    id: reg.id,
    token: reg.token,
    status: reg.status,
    name: reg.name,
    email: reg.email,
    phone: reg.phone,
    answers: reg.answers,
    sensitiveAnswers: includeSensitive ? (reg.sensitiveAnswers ?? {}) : null,
    sensitivePurgedAt: reg.sensitivePurgedAt,
    formSnapshot: reg.formSnapshot,
    paymentOption: option,
    totalAmount: reg.totalAmount,
    paid,
    balance: Math.max(0, reg.totalAmount - paid),
    acceptedTerms: reg.acceptedTerms,
    holdExpiresAt: reg.holdExpiresAt,
    holdExpired: reg.status === 'pending' && reg.holdExpiresAt !== null && reg.holdExpiresAt <= now,
    notes: reg.notes,
    cancelledAt: reg.cancelledAt,
    createdAt: reg.createdAt,
    payments: reg.payments
      .slice()
      .sort((a, b) => a.paidAt.getTime() - b.paidAt.getTime())
      .map((p) => ({ id: p.id, amount: p.amount, paidAt: p.paidAt, method: p.method, note: p.note })),
  }
}

async function findEvent(req: Request) {
  return prisma.product.findFirst({ where: { id: String(req.params.id), professionalId: req.professionalId ?? '', type: 'event' } })
}

async function findRegistration(req: Request) {
  return prisma.eventRegistration.findFirst({
    where: { id: String(req.params.registrationId), professionalId: req.professionalId ?? '' },
    include: { payments: true },
  })
}

export async function listEventRegistrations(req: Request, res: Response): Promise<void> {
  const event = await findEvent(req)
  if (!event) {
    fail(res, 'Evento no encontrado', 404)
    return
  }
  const now = new Date()
  const regs = await prisma.eventRegistration.findMany({
    where: { productId: event.id },
    include: { payments: true },
    orderBy: { createdAt: 'asc' },
  })
  const includeSensitive = canSeeSensitive(req)
  ok(res, {
    event: { id: event.id, name: event.name, slug: event.slug, isPublished: event.isPublished },
    config: parseEventConfig(event.eventConfig),
    availability: await eventAvailability(event, now),
    canSeeSensitive: includeSensitive,
    registrations: regs.map((r) => serializeRegistration(r, includeSensitive, now)),
  })
}

const updateSchema = z.object({
  status: z.enum(['cancelled', 'active', 'waitlist']).optional(),
  notes: z.string().max(5000).optional(),
  /** Renueva la reserva provisional por las horas configuradas en el evento. */
  renewHold: z.boolean().optional(),
})

export async function updateEventRegistration(req: Request, res: Response): Promise<void> {
  const parsed = updateSchema.safeParse(req.body)
  if (!parsed.success) {
    fail(res, parsed.error.issues[0]?.message ?? 'Invalid body', 400)
    return
  }
  const reg = await findRegistration(req)
  if (!reg) {
    fail(res, 'Inscripción no encontrada', 404)
    return
  }
  const product = await prisma.product.findUniqueOrThrow({ where: { id: reg.productId } })
  const config = parseEventConfig(product.eventConfig)
  const now = new Date()
  const data: Prisma.EventRegistrationUncheckedUpdateInput = {}
  if (parsed.data.notes !== undefined) data.notes = parsed.data.notes
  if (parsed.data.status === 'cancelled') {
    data.status = 'cancelled'
    data.cancelledAt = now
  } else if (parsed.data.status === 'waitlist') {
    data.status = 'waitlist'
    data.holdExpiresAt = null
  } else if (parsed.data.status === 'active' && (reg.status === 'cancelled' || reg.status === 'waitlist')) {
    // Reactivar o pasar desde la lista de espera: vuelve como pendiente con una reserva nueva.
    data.status = 'pending'
    data.cancelledAt = null
    data.holdExpiresAt = new Date(now.getTime() + config.holdHours * 3_600_000)
  }
  if (parsed.data.renewHold && (reg.status === 'pending' || data.status === 'pending')) {
    data.holdExpiresAt = new Date(now.getTime() + config.holdHours * 3_600_000)
  }
  await prisma.eventRegistration.update({ where: { id: reg.id }, data })
  if (data.status === 'pending') await recomputeStatus(reg.id)
  const updated = await prisma.eventRegistration.findUniqueOrThrow({ where: { id: reg.id }, include: { payments: true } })
  ok(res, serializeRegistration(updated, canSeeSensitive(req), now))
}

export async function deleteEventRegistration(req: Request, res: Response): Promise<void> {
  const reg = await findRegistration(req)
  if (!reg) {
    fail(res, 'Inscripción no encontrada', 404)
    return
  }
  await prisma.eventRegistration.delete({ where: { id: reg.id } })
  ok(res, { id: reg.id })
}

const paymentSchema = z.object({
  amount: z.number().int().min(1, 'El monto debe ser mayor que 0'),
  paidAt: z.string().datetime({ offset: true }),
  method: z.string().trim().max(120).default(''),
  note: z.string().trim().max(1000).default(''),
  /** Avisar por correo si el abono confirma el cupo o completa el pago (por defecto sí). */
  notify: z.boolean().default(true),
})

export async function addEventPayment(req: Request, res: Response): Promise<void> {
  const parsed = paymentSchema.safeParse(req.body)
  if (!parsed.success) {
    fail(res, parsed.error.issues[0]?.message ?? 'Invalid body', 400)
    return
  }
  const reg = await findRegistration(req)
  if (!reg) {
    fail(res, 'Inscripción no encontrada', 404)
    return
  }
  if (reg.status === 'cancelled') {
    fail(res, 'La inscripción está cancelada: reactívala antes de registrar un pago', 400)
    return
  }
  const { notify, paidAt, ...rest } = parsed.data
  await prisma.eventPayment.create({ data: { ...rest, paidAt: new Date(paidAt), registrationId: reg.id } })
  if (reg.status === 'waitlist') {
    // Un pago registrado a alguien en lista de espera significa que entró al evento.
    await prisma.eventRegistration.update({ where: { id: reg.id }, data: { status: 'pending' } })
  }
  const change = await recomputeStatus(reg.id)
  if (notify && change && (change.to === 'reserved' || change.to === 'paid')) void sendStatusEmail(reg.id, change.to)
  const updated = await prisma.eventRegistration.findUniqueOrThrow({ where: { id: reg.id }, include: { payments: true } })
  ok(res, serializeRegistration(updated, canSeeSensitive(req), new Date()), 201)
}

export async function deleteEventPayment(req: Request, res: Response): Promise<void> {
  const reg = await findRegistration(req)
  const payment = reg?.payments.find((p) => p.id === String(req.params.paymentId))
  if (!reg || !payment) {
    fail(res, 'Pago no encontrado', 404)
    return
  }
  await prisma.eventPayment.delete({ where: { id: payment.id } })
  await recomputeStatus(reg.id)
  const updated = await prisma.eventRegistration.findUniqueOrThrow({ where: { id: reg.id }, include: { payments: true } })
  ok(res, serializeRegistration(updated, canSeeSensitive(req), new Date()))
}

// ── Exportaciones ────────────────────────────────────────────────────────────

const EXPORT_KINDS = ['general', 'logistics', 'sensitive'] as const
type ExportKind = (typeof EXPORT_KINDS)[number]

const fmtDate = (d: Date | null) => (d ? d.toLocaleString('es-CL', { timeZone: 'America/Santiago' }) : '')

/** Columnas de respuestas de una categoría, en el orden del formulario actual (y luego las de versiones viejas). */
function answerColumns(regs: RegistrationRow[], currentFields: EventField[], category: ExportKind): EventField[] {
  const columns = new Map<string, EventField>()
  const wanted = (f: EventField) => f.type !== 'section' && !f.role && f.category === category
  for (const f of currentFields) if (wanted(f)) columns.set(f.id, f)
  for (const r of regs) for (const f of r.formSnapshot as unknown as EventField[]) if (wanted(f) && !columns.has(f.id)) columns.set(f.id, f)
  return [...columns.values()]
}

export function buildExportTable(kind: ExportKind, regs: RegistrationRow[], currentFields: EventField[]): Table {
  const columns = answerColumns(regs, currentFields, kind)
  const base = ['Nombre', 'Correo', 'Teléfono', 'Estado']
  if (kind === 'general') {
    const headers = [...base, 'Modalidad de pago', 'Total', 'Pagado', 'Saldo', 'Abonos', 'Fecha de inscripción', ...columns.map((c) => c.label), 'Notas']
    const rows = regs.map((r): Cell[] => {
      const paid = paidAmount(r.payments)
      const answers = r.answers as unknown as Answers
      return [
        r.name,
        r.email,
        r.phone,
        STATUS_LABELS[r.status] ?? r.status,
        (r.paymentSnapshot as unknown as EventPaymentOption).label,
        r.totalAmount,
        paid,
        Math.max(0, r.totalAmount - paid),
        r.payments
          .slice()
          .sort((a, b) => a.paidAt.getTime() - b.paidAt.getTime())
          .map((p) => `${fmtDate(p.paidAt).split(',')[0]}: $${p.amount.toLocaleString('es-CL')}${p.method ? ` (${p.method})` : ''}`)
          .join(' · '),
        fmtDate(r.createdAt),
        ...columns.map((c) => formatAnswer(answers[c.id])),
        r.notes,
      ]
    })
    return { headers, rows }
  }
  const source = (r: RegistrationRow) => ((kind === 'sensitive' ? r.sensitiveAnswers : r.answers) ?? {}) as unknown as Answers
  return {
    headers: [...base, ...columns.map((c) => c.label)],
    rows: regs.map((r) => [r.name, r.email, r.phone, STATUS_LABELS[r.status] ?? r.status, ...columns.map((c) => formatAnswer(source(r)[c.id]))]),
  }
}

export async function exportEventRegistrations(req: Request, res: Response): Promise<void> {
  const kind = (EXPORT_KINDS as readonly string[]).includes(String(req.query.kind)) ? (String(req.query.kind) as ExportKind) : 'general'
  const format = req.query.format === 'csv' ? 'csv' : 'xlsx'
  if (kind === 'sensitive' && !canSeeSensitive(req)) {
    fail(res, 'Solo la cuenta principal puede exportar los datos de salud', 403)
    return
  }
  const event = await findEvent(req)
  if (!event) {
    fail(res, 'Evento no encontrado', 404)
    return
  }
  const includeCancelled = req.query.includeCancelled === 'true'
  const regs = await prisma.eventRegistration.findMany({
    where: { productId: event.id, ...(includeCancelled ? {} : { status: { not: 'cancelled' } }) },
    include: { payments: true },
    orderBy: { createdAt: 'asc' },
  })
  const table = buildExportTable(kind, regs, parseEventConfig(event.eventConfig).fields)
  const suffix = { general: 'inscritos', logistics: 'logistica', sensitive: 'salud' }[kind]
  const filename = `${event.slug}-${suffix}.${format}`
  await recordAuditEvent({ action: 'export', entity: 'EventRegistration', entityId: event.id, changes: { kind, format, rows: regs.length } })
  res.set({ 'Content-Disposition': `attachment; filename="${filename}"`, 'Cache-Control': 'no-store' })
  if (format === 'csv') {
    res.type('text/csv; charset=utf-8').send(toCsv(table))
    return
  }
  res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(toXlsx(table, suffix))
}

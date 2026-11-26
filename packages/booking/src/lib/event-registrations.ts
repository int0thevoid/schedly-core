import type { EventPayment, EventRegistration, Product } from '../generated/prisma/index.js'
import type { EventPaymentSummary } from '@schedly/notifications'
import { prisma } from './prisma.js'
import { getEmailService } from './email-service.js'
import {
  eventPublishProblems,
  formatAnswer,
  occupiesSeat,
  parseEventConfig,
  registrationAvailability,
  statusFromPayments,
  type Answers,
  type EventConfig,
  type EventField,
  type EventPaymentOption,
} from './events.js'

const TIMEZONE = 'America/Santiago'

function frontendUrl(path: string): string {
  return `${process.env.FRONTEND_URL ?? 'http://localhost:5173'}${path}`
}

/** "22 de diciembre de 2026" en hora de Chile. */
function formatLongDate(iso: string | Date): string {
  return new Date(iso).toLocaleDateString('es-CL', { timeZone: TIMEZONE, day: 'numeric', month: 'long', year: 'numeric' })
}

/** "22 al 24 de enero de 2027" · "22 de enero de 2027". */
export function eventDateText(config: Pick<EventConfig, 'startsAt' | 'endsAt'>): string {
  if (!config.startsAt) return ''
  const start = formatLongDate(config.startsAt)
  if (!config.endsAt || formatLongDate(config.endsAt) === start) return start
  const s = new Date(config.startsAt)
  const e = new Date(config.endsAt)
  const part = (d: Date, opts: Intl.DateTimeFormatOptions) => d.toLocaleDateString('es-CL', { timeZone: TIMEZONE, ...opts })
  if (part(s, { month: 'numeric', year: 'numeric' }) === part(e, { month: 'numeric', year: 'numeric' })) {
    return `${part(s, { day: 'numeric' })} al ${formatLongDate(e)}`
  }
  return `${start} al ${formatLongDate(e)}`
}

export function paidAmount(payments: Pick<EventPayment, 'amount'>[]): number {
  return payments.reduce((sum, p) => sum + p.amount, 0)
}

/** Cupos ocupados ahora (reservas, pagos y pendientes con reserva provisional vigente). */
export async function takenSeats(productId: string, now: Date = new Date(), client: Pick<typeof prisma, 'eventRegistration'> = prisma): Promise<number> {
  const rows = await client.eventRegistration.findMany({
    where: { productId, status: { in: ['pending', 'reserved', 'paid'] } },
    select: { status: true, holdExpiresAt: true },
  })
  return rows.filter((r) => occupiesSeat(r, now)).length
}

export async function eventAvailability(product: Pick<Product, 'id' | 'eventConfig' | 'price'>, now: Date = new Date()) {
  const config = parseEventConfig(product.eventConfig)
  const taken = await takenSeats(product.id, now)
  const ready = eventPublishProblems(config, product.price).length === 0
  return { ...registrationAvailability(config, taken, now, ready), capacity: config.capacity, taken }
}

export function paymentSummary(option: EventPaymentOption, paid: number): EventPaymentSummary {
  return {
    optionLabel: option.label,
    total: option.installments.reduce((s, i) => s + i.amount, 0),
    paid,
    installments: option.installments.map((i) => ({
      label: i.label,
      amount: i.amount,
      dueText: i.dueDate ? formatLongDate(i.dueDate) : 'Al inscribirte',
      link: i.link || undefined,
    })),
    instructions: option.instructions || undefined,
    link: option.link || undefined,
    linkLabel: option.linkLabel || undefined,
  }
}

export interface AcceptedTerms {
  acceptedAt: string
  consents: { id: string; text: string; accepted: boolean }[]
  documents: { terms: string; cancellation: string; privacy: string }
}

type RegistrationWithRelations = EventRegistration & { payments: EventPayment[]; product: Product }

/** Recalcula el estado según los abonos (no toca canceladas ni lista de espera). Devuelve el cambio, si hubo. */
export async function recomputeStatus(registrationId: string): Promise<{ from: string; to: string } | null> {
  const reg = await prisma.eventRegistration.findUnique({ where: { id: registrationId }, include: { payments: true } })
  if (!reg || reg.status === 'cancelled' || reg.status === 'waitlist') return null
  const option = reg.paymentSnapshot as unknown as EventPaymentOption
  const next = statusFromPayments(paidAmount(reg.payments), reg.totalAmount, option.installments[0]?.amount ?? reg.totalAmount)
  if (next === reg.status) return null
  await prisma.eventRegistration.update({ where: { id: reg.id }, data: { status: next } })
  return { from: reg.status, to: next }
}

function emailBase(reg: RegistrationWithRelations, config: EventConfig) {
  return {
    eventName: reg.product.name,
    dateText: eventDateText(config),
    location: config.location || undefined,
    participantName: reg.name,
    signature: config.emails.signature || undefined,
    accentColor: config.accentColor || undefined,
    receiptUrl: frontendUrl(`/vitrina/inscripcion/${reg.token}`),
  }
}

function logEmailError(what: string) {
  return (err: unknown) => console.error(`[events] no se pudo enviar ${what}`, err)
}

/** Correos al inscribirse: comprobante a la participante y aviso (sin datos de salud) a la profesional. */
export function sendRegistrationEmails(registrationId: string): Promise<void> {
  return registrationEmails(registrationId).catch(logEmailError('los correos de inscripción'))
}

async function registrationEmails(registrationId: string): Promise<void> {
  const reg = await prisma.eventRegistration.findUnique({ where: { id: registrationId }, include: { payments: true, product: true } })
  if (!reg) return
  const config = parseEventConfig(reg.product.eventConfig)
  const option = reg.paymentSnapshot as unknown as EventPaymentOption
  const accepted = reg.acceptedTerms as unknown as AcceptedTerms
  const waitlist = reg.status === 'waitlist'

  await getEmailService()
    .sendEventRegistrationReceived(reg.email, {
      ...emailBase(reg, config),
      subject: config.emails.receivedSubject || undefined,
      intro: config.emails.receivedIntro || undefined,
      waitlist,
      payment: reg.totalAmount > 0 ? paymentSummary(option, paidAmount(reg.payments)) : null,
      holdHours: config.holdHours,
      acceptedConsents: accepted.consents.filter((c) => c.accepted).map((c) => c.text),
      acceptedAt: new Date(accepted.acceptedAt).toLocaleString('es-CL', { timeZone: TIMEZONE }),
    })
    .catch(logEmailError('el comprobante de inscripción'))

  const professional = await prisma.professional.findUnique({ where: { id: reg.professionalId }, select: { email: true } })
  const to = config.emails.notifyEmail || professional?.email
  if (!to) return
  const fields = reg.formSnapshot as unknown as EventField[]
  const answers = reg.answers as unknown as Answers
  await getEmailService()
    .sendEventRegistrationToProfessional(to, {
      eventName: reg.product.name,
      participantName: reg.name,
      email: reg.email,
      phone: reg.phone,
      optionLabel: option.label,
      total: reg.totalAmount,
      waitlist,
      answers: fields
        .filter((f) => f.type !== 'section' && f.category !== 'sensitive' && answers[f.id] !== undefined && !f.role)
        .map((f) => ({ label: f.label, value: formatAnswer(answers[f.id]) })),
      adminUrl: frontendUrl(`/admin/vitrina/${reg.productId}/inscritos`),
      registeredCount: await takenSeats(reg.productId),
      capacity: config.capacity,
    })
    .catch(logEmailError('el aviso de inscripción'))
}

/** Correo cuando un abono confirma el cupo o completa el pago. */
export function sendStatusEmail(registrationId: string, kind: 'reserved' | 'paid'): Promise<void> {
  return statusEmail(registrationId, kind).catch(logEmailError('el correo de estado'))
}

async function statusEmail(registrationId: string, kind: 'reserved' | 'paid'): Promise<void> {
  const reg = await prisma.eventRegistration.findUnique({ where: { id: registrationId }, include: { payments: true, product: true } })
  if (!reg) return
  const config = parseEventConfig(reg.product.eventConfig)
  const option = reg.paymentSnapshot as unknown as EventPaymentOption
  await getEmailService()
    .sendEventRegistrationStatus(reg.email, {
      ...emailBase(reg, config),
      subject: (kind === 'paid' ? config.emails.paidSubject : config.emails.reservedSubject) || undefined,
      intro: (kind === 'paid' ? config.emails.paidIntro : config.emails.reservedIntro) || undefined,
      kind,
      payment: paymentSummary(option, paidAmount(reg.payments)),
    })
    .catch(logEmailError(`el correo de ${kind === 'paid' ? 'pago completo' : 'reserva confirmada'}`))
}

/**
 * Conservación (US-123): borra los datos de salud de las inscripciones de eventos terminados hace más
 * de N días, según cada evento. Devuelve cuántas inscripciones se limpiaron.
 */
export async function purgeExpiredSensitiveData(now: Date = new Date()): Promise<number> {
  const events = await prisma.product.findMany({ where: { type: 'event' }, select: { id: true, eventConfig: true } })
  let purged = 0
  for (const event of events) {
    const config = parseEventConfig(event.eventConfig)
    const end = config.endsAt ?? config.startsAt
    if (config.sensitiveRetentionDays === null || !end) continue
    const limit = new Date(new Date(end).getTime() + config.sensitiveRetentionDays * 86_400_000)
    if (limit > now) continue
    const regs = await prisma.eventRegistration.findMany({
      where: { productId: event.id, sensitivePurgedAt: null },
      select: { id: true },
    })
    for (const r of regs) {
      await prisma.eventRegistration.update({ where: { id: r.id }, data: { sensitiveAnswers: {}, sensitivePurgedAt: now } })
      purged++
    }
  }
  return purged
}

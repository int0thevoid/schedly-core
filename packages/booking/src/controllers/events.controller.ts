import { randomBytes } from 'node:crypto'
import type { Request, Response } from 'express'
import { prisma, type TransactionClient } from '../lib/prisma.js'
import { fail, ok } from '../lib/response.js'
import {
  availablePaymentOptions,
  installmentsTotal,
  parseEventConfig,
  registrationAvailability,
  validateAnswers,
  type EventPaymentOption,
} from '../lib/events.js'
import {
  eventDateText,
  paidAmount,
  paymentSummary,
  sendRegistrationEmails,
  takenSeats,
  type AcceptedTerms,
} from '../lib/event-registrations.js'

function professionalId(): string {
  return process.env.PROFESSIONAL_ID ?? ''
}

function isSerializationConflict(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code: unknown }).code === 'P2034'
}

async function runSerializable<T>(fn: (tx: TransactionClient) => Promise<T>, attempts = 3): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await prisma.$transaction(fn, { isolationLevel: 'Serializable' })
    } catch (err) {
      if (isSerializationConflict(err) && attempt < attempts) continue
      throw err
    }
  }
}

class RegistrationClosedError extends Error {}

/** Evento gratis sin modalidades: una "modalidad" de $0 para que el comprobante sea uniforme. */
const FREE_OPTION: EventPaymentOption = {
  id: 'gratis',
  label: 'Gratis',
  description: '',
  instructions: '',
  link: '',
  linkLabel: '',
  availableUntil: null,
  installments: [{ id: 'gratis', label: 'Inscripción', amount: 0, dueDate: null, link: '' }],
}

const CLOSED_MESSAGES: Record<string, string> = {
  closed: 'Las inscripciones para este evento están cerradas.',
  full: 'El evento está completo.',
  not_started: 'Las inscripciones aún no están abiertas.',
}

/** POST /api/products/:slug/registrations — inscripción desde la web (US-123). */
export async function createEventRegistration(req: Request, res: Response): Promise<void> {
  const body = (req.body ?? {}) as Record<string, unknown>
  // Campo trampa: las personas no lo ven; los bots lo llenan.
  if (typeof body.website === 'string' && body.website.trim() !== '') {
    fail(res, 'No se pudo enviar la inscripción', 400)
    return
  }
  const product = await prisma.product.findFirst({
    where: { slug: String(req.params.slug), professionalId: professionalId(), isPublished: true, type: 'event' },
  })
  if (!product) {
    fail(res, 'Evento no encontrado', 404)
    return
  }
  const config = parseEventConfig(product.eventConfig)
  const now = new Date()

  const { answers, sensitive, errors } = validateAnswers(config.fields, body.answers)
  const consentsInput = (body.consents && typeof body.consents === 'object' ? body.consents : {}) as Record<string, unknown>
  for (const consent of config.consents) {
    if (consent.required && consentsInput[consent.id] !== true) errors[consent.id] = 'Debes aceptar esta condición'
  }

  const offered = availablePaymentOptions(config, now)
  let option: EventPaymentOption | undefined
  if (config.paymentOptions.length === 0 && product.price === 0) option = FREE_OPTION
  else option = offered.find((o) => o.id === body.paymentOptionId)
  if (!option) errors.paymentOptionId = 'Elige una modalidad de pago'

  if (Object.keys(errors).length > 0 || !option) {
    res.status(400).json({ success: false, error: 'Revisa los datos marcados en el formulario', fieldErrors: errors })
    return
  }

  const roleValue = (role: 'name' | 'email' | 'phone') => {
    const field = config.fields.find((f) => f.role === role)
    const value = field ? answers[field.id] ?? sensitive[field.id] : undefined
    return typeof value === 'string' ? value : ''
  }
  const name = roleValue('name')
  const email = roleValue('email').toLowerCase()
  if (!name || !email) {
    fail(res, 'El evento no está bien configurado (faltan nombre o correo). Avísale a la organizadora.', 400)
    return
  }

  const chosen = option
  const total = installmentsTotal(chosen)
  const acceptedTerms: AcceptedTerms = {
    acceptedAt: now.toISOString(),
    consents: config.consents.map((c) => ({ id: c.id, text: c.text, accepted: consentsInput[c.id] === true })),
    documents: config.documents,
  }

  try {
    const registration = await runSerializable(async (tx) => {
      const duplicate = await tx.eventRegistration.findFirst({
        where: { productId: product.id, email, status: { not: 'cancelled' } },
        select: { id: true },
      })
      if (duplicate) throw new RegistrationClosedError('Ya existe una inscripción con este correo. Si necesitas cambiar algo, escríbenos.')
      const taken = await takenSeats(product.id, now, tx)
      const availability = registrationAvailability(config, taken, now)
      if (availability.status !== 'open' && availability.status !== 'waitlist') {
        throw new RegistrationClosedError(CLOSED_MESSAGES[availability.status] ?? 'Las inscripciones están cerradas.')
      }
      const waitlist = availability.status === 'waitlist'
      return tx.eventRegistration.create({
        data: {
          professionalId: product.professionalId,
          productId: product.id,
          token: randomBytes(24).toString('base64url'),
          status: waitlist ? 'waitlist' : total === 0 ? 'paid' : 'pending',
          name,
          email,
          phone: roleValue('phone'),
          answers,
          sensitiveAnswers: sensitive,
          formSnapshot: config.fields,
          paymentOptionId: chosen.id,
          paymentSnapshot: chosen,
          totalAmount: total,
          acceptedTerms: acceptedTerms as unknown as object,
          holdExpiresAt: waitlist || total === 0 ? null : new Date(now.getTime() + config.holdHours * 3_600_000),
        },
      })
    })
    void sendRegistrationEmails(registration.id)
    ok(res, { token: registration.token, status: registration.status }, 201)
  } catch (err) {
    if (err instanceof RegistrationClosedError) {
      fail(res, err.message, 409)
      return
    }
    throw err
  }
}

/** GET /api/event-registrations/:token — comprobante (sin datos de salud). */
export async function getEventRegistrationReceipt(req: Request, res: Response): Promise<void> {
  const reg = await prisma.eventRegistration.findUnique({
    where: { token: String(req.params.token) },
    include: { payments: { orderBy: { paidAt: 'asc' } }, product: true },
  })
  if (!reg || reg.professionalId !== professionalId()) {
    fail(res, 'Inscripción no encontrada', 404)
    return
  }
  const config = parseEventConfig(reg.product.eventConfig)
  const option = reg.paymentSnapshot as unknown as EventPaymentOption
  const accepted = reg.acceptedTerms as unknown as AcceptedTerms
  const paid = paidAmount(reg.payments)
  ok(res, {
    status: reg.status,
    name: reg.name,
    email: reg.email,
    createdAt: reg.createdAt,
    holdExpiresAt: reg.holdExpiresAt,
    event: {
      name: reg.product.name,
      slug: reg.product.slug,
      dateText: eventDateText(config),
      location: config.location,
      scheduleNotes: config.scheduleNotes,
      accentColor: config.accentColor,
    },
    payment: paymentSummary(option, paid),
    payments: reg.payments.map((p) => ({ amount: p.amount, paidAt: p.paidAt })),
    accepted,
  })
}

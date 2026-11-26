import { z } from 'zod'

/**
 * Eventos de la vitrina (US-123).
 *
 * Todo lo del evento es configuración editable desde el panel (Product.eventConfig): datos, formulario,
 * consentimientos, documentos, modalidades de pago con sus cuotas y links, cupos, plazos, textos de
 * los correos y conservación de datos. Nada de un evento en particular vive en el código.
 */

const FIELD_TYPES = [
  'section',
  'short_text',
  'long_text',
  'email',
  'phone',
  'number',
  'date',
  'yes_no',
  'single_choice',
  'multi_choice',
  'checkbox',
] as const
type FieldType = (typeof FIELD_TYPES)[number]

/** general: datos de contacto/inscripción · logistics: alimentación, accesibilidad · sensitive: salud. */
const FIELD_CATEGORIES = ['general', 'logistics', 'sensitive'] as const
const FIELD_ROLES = ['name', 'email', 'phone'] as const

const ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,59}$/
const idSchema = z.string().regex(ID_PATTERN, 'Identificador inválido (minúsculas, números, - y _)')
const isoDate = z.string().datetime({ offset: true })
const httpsUrl = z.string().trim().max(2000).refine((v) => v === '' || /^https:\/\/\S+$/.test(v), 'Los links deben empezar con https://')
const text = (max: number) => z.string().max(max)

const fieldSchema = z.object({
  id: idSchema,
  type: z.enum(FIELD_TYPES),
  label: z.string().trim().min(1, 'Cada pregunta necesita un texto').max(500),
  help: text(2000).default(''),
  required: z.boolean().default(false),
  options: z.array(z.string().trim().min(1).max(200)).max(50).default([]),
  min: z.number().nullable().default(null),
  max: z.number().nullable().default(null),
  /** Mensaje cuando el número queda fuera de min/max (ej. "Debes tener 18 años o más"). */
  rangeMessage: text(300).default(''),
  role: z.enum(FIELD_ROLES).nullable().default(null),
  category: z.enum(FIELD_CATEGORIES).default('general'),
  /** Mostrar solo si la respuesta a otra pregunta (anterior) es alguno de estos valores. */
  showIf: z
    .object({ fieldId: idSchema, values: z.array(z.string().max(200)).min(1).max(50) })
    .nullable()
    .default(null),
})
export type EventField = z.infer<typeof fieldSchema>

const consentSchema = z.object({
  id: idSchema,
  text: z.string().trim().min(1).max(1000),
  required: z.boolean().default(true),
})
type EventConsent = z.infer<typeof consentSchema>

const installmentSchema = z.object({
  id: idSchema,
  label: z.string().trim().min(1).max(120),
  amount: z.number().int().min(0),
  /** null = se paga al inscribirse. */
  dueDate: isoDate.nullable().default(null),
  /** Link de pago propio de esta cuota; si está vacío se usa el de la modalidad. */
  link: httpsUrl.default(''),
})

const paymentOptionSchema = z.object({
  id: idSchema,
  label: z.string().trim().min(1).max(120),
  description: text(2000).default(''),
  instructions: text(4000).default(''),
  link: httpsUrl.default(''),
  linkLabel: text(80).default(''),
  /** Después de esta fecha la modalidad ya no se ofrece (ej. cuotas). null = siempre. */
  availableUntil: isoDate.nullable().default(null),
  installments: z.array(installmentSchema).min(1, 'Cada modalidad necesita al menos un pago').max(24),
})
export type EventPaymentOption = z.infer<typeof paymentOptionSchema>

const emailTextsSchema = z.object({
  /** Correo que recibe el aviso de cada inscripción; vacío = el correo de la profesional. */
  notifyEmail: z.union([z.string().trim().email().max(200), z.literal('')]).default(''),
  receivedSubject: text(200).default(''),
  receivedIntro: text(4000).default(''),
  reservedSubject: text(200).default(''),
  reservedIntro: text(4000).default(''),
  paidSubject: text(200).default(''),
  paidIntro: text(4000).default(''),
  signature: text(500).default(''),
})

export const eventConfigSchema = z.object({
  startsAt: isoDate.nullable().default(null),
  endsAt: isoDate.nullable().default(null),
  location: text(300).default(''),
  modality: z.enum(['presential', 'online', 'hybrid']).default('presential'),
  audience: text(500).default(''),
  includes: text(4000).default(''),
  scheduleNotes: text(2000).default(''),
  /** Color de la identidad del evento en la web y los correos (#rrggbb). */
  accentColor: z.union([z.string().regex(/^#[0-9a-fA-F]{6}$/), z.literal('')]).default(''),

  capacity: z.number().int().min(1).nullable().default(null),
  /** La web muestra «Quedan X cupos» solo cuando quedan N o menos. null = nunca muestra el número. */
  showRemainingAt: z.number().int().min(0).nullable().default(null),
  holdHours: z.number().int().min(1).max(24 * 14).default(24),
  registrationClosesAt: isoDate.nullable().default(null),
  waitlistEnabled: z.boolean().default(false),

  fields: z.array(fieldSchema).max(150).default([]),
  consents: z.array(consentSchema).max(30).default([]),
  documents: z
    .object({
      terms: text(30_000).default(''),
      cancellation: text(30_000).default(''),
      privacy: text(30_000).default(''),
    })
    .default({ terms: '', cancellation: '', privacy: '' }),
  /** Los datos de salud se borran N días después del término del evento. null = no se borran solos. */
  sensitiveRetentionDays: z.number().int().min(0).max(3650).nullable().default(null),

  paymentOptions: z.array(paymentOptionSchema).max(10).default([]),
  emails: emailTextsSchema.default({
    notifyEmail: '',
    receivedSubject: '',
    receivedIntro: '',
    reservedSubject: '',
    reservedIntro: '',
    paidSubject: '',
    paidIntro: '',
    signature: '',
  }),
})
export type EventConfig = z.infer<typeof eventConfigSchema>

export function parseEventConfig(value: unknown): EventConfig {
  return eventConfigSchema.parse(value ?? {})
}

/** Configuración con la que parte un evento nuevo: solo lo mínimo para identificar a quien se inscribe. */
export function defaultEventConfig(startsAt: string | null = null): EventConfig {
  const base = { help: '', options: [], min: null, max: null, rangeMessage: '', category: 'general' as const, showIf: null }
  return eventConfigSchema.parse({
    startsAt,
    fields: [
      { ...base, id: 'nombre', type: 'short_text', label: 'Nombre completo', required: true, role: 'name' },
      { ...base, id: 'correo', type: 'email', label: 'Correo electrónico', required: true, role: 'email' },
      { ...base, id: 'whatsapp', type: 'phone', label: 'WhatsApp', required: true, role: 'phone' },
    ],
  })
}

export function installmentsTotal(option: Pick<EventPaymentOption, 'installments'>): number {
  return option.installments.reduce((sum, i) => sum + i.amount, 0)
}

/**
 * Lo que falta para abrir las inscripciones. El evento se puede publicar igual: mientras falte algo, la
 * web lo muestra con «Inscripciones próximamente» y sin formulario.
 */
export function eventPublishProblems(config: EventConfig, price: number): string[] {
  const problems: string[] = []
  if (!config.startsAt) problems.push('Falta la fecha de inicio del evento')
  if (config.startsAt && config.endsAt && new Date(config.endsAt) < new Date(config.startsAt)) {
    problems.push('La fecha de término es anterior a la de inicio')
  }
  const inputs = config.fields.filter((f) => f.type !== 'section')
  if (!inputs.some((f) => f.role === 'name')) problems.push('El formulario necesita una pregunta marcada como «Nombre»')
  if (!inputs.some((f) => f.role === 'email' && f.type === 'email')) {
    problems.push('El formulario necesita una pregunta de tipo correo marcada como «Correo»')
  }
  for (const role of FIELD_ROLES) {
    const withRole = inputs.filter((f) => f.role === role)
    if (withRole.length > 1) problems.push(`Hay más de una pregunta marcada como «${role}»`)
    if (withRole.some((f) => !f.required || f.showIf)) problems.push(`La pregunta marcada como «${role}» debe ser obligatoria y siempre visible`)
  }
  const ids = new Set<string>()
  const seen = new Map<string, EventField>()
  for (const f of config.fields) {
    if (ids.has(f.id)) problems.push(`El identificador «${f.id}» está repetido`)
    ids.add(f.id)
    if ((f.type === 'single_choice' || f.type === 'multi_choice') && f.options.length === 0) {
      problems.push(`«${f.label}» no tiene opciones`)
    }
    if (f.showIf) {
      const ref = seen.get(f.showIf.fieldId)
      if (!ref) problems.push(`«${f.label}» depende de una pregunta que no está antes en el formulario`)
      else if (ref.category === 'sensitive' && f.category !== 'sensitive') {
        problems.push(`«${f.label}» depende de una pregunta de salud: márcala también como salud`)
      }
    }
    seen.set(f.id, f)
  }
  const consentIds = new Set<string>()
  for (const c of config.consents) {
    if (consentIds.has(c.id) || ids.has(c.id)) problems.push(`El identificador «${c.id}» está repetido`)
    consentIds.add(c.id)
  }
  if (price > 0) {
    if (config.paymentOptions.length === 0) problems.push('Falta al menos una modalidad de pago')
    const optionIds = new Set<string>()
    for (const o of config.paymentOptions) {
      if (optionIds.has(o.id)) problems.push(`La modalidad «${o.id}» está repetida`)
      optionIds.add(o.id)
      if (installmentsTotal(o) <= 0) problems.push(`La modalidad «${o.label}» suma $0`)
      if (!o.link && !o.instructions.trim() && o.installments.every((i) => !i.link)) {
        problems.push(`La modalidad «${o.label}» no tiene link ni instrucciones de pago`)
      }
    }
  }
  return [...new Set(problems)]
}

// ── Disponibilidad ────────────────────────────────────────────────────────────

type RegistrationAvailability = 'open' | 'full' | 'waitlist' | 'closed' | 'not_started'

interface OccupancyRow {
  status: string
  holdExpiresAt: Date | null
}

/** Ocupan cupo: reservas y pagos confirmados, y pendientes cuya reserva provisional no ha vencido. */
export function occupiesSeat(row: OccupancyRow, now: Date): boolean {
  if (row.status === 'reserved' || row.status === 'paid') return true
  return row.status === 'pending' && row.holdExpiresAt !== null && row.holdExpiresAt > now
}

export function registrationAvailability(
  config: EventConfig,
  taken: number,
  now: Date = new Date(),
  ready = true,
): { status: RegistrationAvailability; remaining: number | null } {
  const remaining = config.capacity === null ? null : Math.max(0, config.capacity - taken)
  const closesAt = config.registrationClosesAt ?? config.startsAt
  if (!config.startsAt || !ready) return { status: 'not_started', remaining }
  if (closesAt && new Date(closesAt) <= now) return { status: 'closed', remaining }
  if (remaining === 0) return { status: config.waitlistEnabled ? 'waitlist' : 'full', remaining }
  return { status: 'open', remaining }
}

/** Modalidades que se ofrecen hoy (las con fecha límite pasada ya no). */
export function availablePaymentOptions(config: EventConfig, now: Date = new Date()): EventPaymentOption[] {
  return config.paymentOptions.filter((o) => !o.availableUntil || new Date(o.availableUntil) > now)
}

// ── Estado de una inscripción ────────────────────────────────────────────────

/** Estado según lo abonado: el primer pago confirma el cupo; el total, el pago completo. */
export function statusFromPayments(paid: number, total: number, firstInstallment: number): 'pending' | 'reserved' | 'paid' {
  if (total > 0 && paid >= total) return 'paid'
  if (total === 0) return 'paid'
  if (paid > 0 && paid >= Math.min(firstInstallment, total)) return 'reserved'
  return 'pending'
}

// ── Respuestas ───────────────────────────────────────────────────────────────

export type AnswerValue = string | number | boolean | string[]
export type Answers = Record<string, AnswerValue>

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_PATTERN = /^\+?[0-9\s()-]{8,20}$/
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function isFilled(value: AnswerValue | undefined): boolean {
  if (value === undefined || value === null) return false
  if (typeof value === 'string') return value.trim() !== ''
  if (Array.isArray(value)) return value.length > 0
  return true
}

/** Valor comparable para las condiciones: sí/no se guarda como booleano y se compara como 'yes'/'no'. */
function conditionValues(value: AnswerValue | undefined): string[] {
  if (value === undefined) return []
  if (typeof value === 'boolean') return [value ? 'yes' : 'no']
  if (Array.isArray(value)) return value
  return [String(value)]
}

/** Preguntas visibles con estas respuestas: una sección oculta esconde todo lo que viene hasta la siguiente. */
export function visibleFields(fields: EventField[], answers: Answers): EventField[] {
  const visible: EventField[] = []
  const visibleIds = new Set<string>()
  let sectionHidden = false
  for (const field of fields) {
    const conditionOk =
      !field.showIf ||
      (visibleIds.has(field.showIf.fieldId) &&
        conditionValues(answers[field.showIf.fieldId]).some((v) => field.showIf?.values.includes(v)))
    if (field.type === 'section') {
      sectionHidden = !conditionOk
      if (!sectionHidden) visible.push(field)
      continue
    }
    if (sectionHidden || !conditionOk) continue
    visible.push(field)
    visibleIds.add(field.id)
  }
  return visible
}

interface ValidatedAnswers {
  answers: Answers
  sensitive: Answers
  errors: Record<string, string>
}

/** Valida y normaliza las respuestas. Las de preguntas ocultas se descartan. */
export function validateAnswers(fields: EventField[], raw: unknown): ValidatedAnswers {
  const input: Record<string, unknown> = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  const answers: Answers = {}
  const sensitive: Answers = {}
  const errors: Record<string, string> = {}

  // Primero se normalizan todas, para evaluar las condiciones con valores limpios.
  const normalized: Answers = {}
  for (const field of fields) {
    if (field.type === 'section') continue
    const value = input[field.id]
    if (value === undefined || value === null || value === '') continue
    switch (field.type) {
      case 'number': {
        const n = typeof value === 'number' ? value : Number(String(value).replace(',', '.'))
        if (Number.isFinite(n)) normalized[field.id] = n
        else errors[field.id] = 'Debe ser un número'
        break
      }
      case 'yes_no':
      case 'checkbox':
        if (typeof value === 'boolean') normalized[field.id] = value
        else if (value === 'yes' || value === 'no') normalized[field.id] = value === 'yes'
        else errors[field.id] = 'Respuesta inválida'
        break
      case 'multi_choice':
        if (Array.isArray(value) && value.every((v) => typeof v === 'string')) normalized[field.id] = [...new Set(value as string[])]
        else errors[field.id] = 'Respuesta inválida'
        break
      default:
        if (typeof value === 'string') normalized[field.id] = value.trim().slice(0, field.type === 'long_text' ? 5000 : 500)
        else errors[field.id] = 'Respuesta inválida'
    }
  }

  for (const field of visibleFields(fields, normalized)) {
    if (field.type === 'section' || errors[field.id]) continue
    const value = normalized[field.id]
    const filled = isFilled(value) && !(field.type === 'checkbox' && value === false)
    if (!filled) {
      if (field.required) errors[field.id] = field.type === 'checkbox' ? 'Debes marcar esta casilla' : 'Esta pregunta es obligatoria'
      continue
    }
    if (field.type === 'email' && !EMAIL_PATTERN.test(String(value))) errors[field.id] = 'Correo inválido'
    if (field.type === 'phone' && !PHONE_PATTERN.test(String(value))) errors[field.id] = 'Teléfono inválido'
    if (field.type === 'date' && !DATE_PATTERN.test(String(value))) errors[field.id] = 'Fecha inválida'
    if (field.type === 'number') {
      const n = value as number
      if ((field.min !== null && n < field.min) || (field.max !== null && n > field.max)) {
        errors[field.id] = field.rangeMessage || `Debe estar entre ${field.min ?? '…'} y ${field.max ?? '…'}`
      }
    }
    if (field.type === 'single_choice' && !field.options.includes(String(value))) errors[field.id] = 'Opción inválida'
    if (field.type === 'multi_choice' && !(value as string[]).every((v) => field.options.includes(v))) errors[field.id] = 'Opción inválida'
    if (errors[field.id]) continue
    if (field.category === 'sensitive') sensitive[field.id] = value
    else answers[field.id] = value
  }
  return { answers, sensitive, errors }
}

/** Texto legible de una respuesta (correos, exportaciones). */
export function formatAnswer(value: AnswerValue | undefined): string {
  if (value === undefined) return ''
  if (typeof value === 'boolean') return value ? 'Sí' : 'No'
  if (Array.isArray(value)) return value.join(', ')
  return String(value)
}

/** Configuración visible en la web: sin el correo interno de avisos ni el cupo total. */
export function publicEventConfig(config: EventConfig, now: Date = new Date()) {
  const { emails, ...rest } = config
  void emails
  return { ...rest, capacity: null, paymentOptions: availablePaymentOptions(config, now) }
}

/**
 * Cupos que ve la web: el número de cupos libres solo cuando quedan N o menos (showRemainingAt);
 * el cupo total y los ocupados nunca. El estado (abierto, agotado, lista de espera…) siempre.
 */
export function publicAvailability<T extends { status: RegistrationAvailability; remaining: number | null }>(
  availability: T,
  config: Pick<EventConfig, 'showRemainingAt'>,
) {
  const show =
    availability.remaining !== null && config.showRemainingAt !== null && availability.remaining <= config.showRemainingAt
  return { status: availability.status, remaining: show ? availability.remaining : null, capacity: null, taken: null }
}

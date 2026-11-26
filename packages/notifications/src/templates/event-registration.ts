import { COLORS, escapeHtml, formatCLP, renderLayout, type EmailTemplate } from './layout.js'

/**
 * Correos de inscripción a eventos de la vitrina (US-123). Los textos de saludo/asunto vienen de la
 * configuración del evento (editable en el panel); estas plantillas solo arman el resumen.
 * Nunca incluyen datos de salud.
 */

export interface EventEmailInstallment {
  label: string
  amount: number
  /** "Al inscribirte" o "22 de diciembre de 2026". */
  dueText: string
  link?: string
}

export interface EventEmailBase {
  eventName: string
  /** "22 al 24 de enero de 2027" */
  dateText: string
  location?: string
  participantName: string
  /** Asunto e introducción configurados en el evento; vacío = texto por defecto. */
  subject?: string
  intro?: string
  signature?: string
  accentColor?: string
  receiptUrl: string
}

export interface EventPaymentSummary {
  optionLabel: string
  total: number
  paid: number
  installments: EventEmailInstallment[]
  instructions?: string
  link?: string
  linkLabel?: string
}

export interface EventRegistrationReceivedData extends EventEmailBase {
  waitlist: boolean
  payment: EventPaymentSummary | null
  holdHours: number
  acceptedConsents: string[]
  acceptedAt: string
}

export interface EventRegistrationStatusData extends EventEmailBase {
  kind: 'reserved' | 'paid'
  payment: EventPaymentSummary
}

export interface EventRegistrationProfessionalData {
  eventName: string
  participantName: string
  email: string
  phone: string
  optionLabel: string
  total: number
  waitlist: boolean
  /** Respuestas no sensibles (etiqueta → respuesta). */
  answers: { label: string; value: string }[]
  adminUrl: string
  registeredCount: number
  capacity: number | null
}

const P = 'word-wrap:break-word;overflow-wrap:break-word;max-width:100%;'

/** Texto libre del panel → párrafos HTML escapados. */
function paragraphs(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p style="${P}margin:0 0 16px;font-size:15px;">${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('')
}

function button(url: string, label: string, color: string): string {
  return `<p style="${P}margin:16px 0;text-align:center;">
    <a href="${escapeHtml(url)}" style="display:inline-block;background-color:${color};color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 24px;border-radius:8px;">${escapeHtml(label)}</a>
  </p>`
}

function eventBox(data: EventEmailBase, color: string): string {
  return `<div style="${P}background-color:${COLORS.primaryFaint};border-left:4px solid ${color};border-radius:8px;padding:16px;margin:0 0 20px;">
    <p style="${P}margin:0 0 4px;font-size:17px;font-weight:600;">${escapeHtml(data.eventName)}</p>
    <p style="${P}margin:0;font-size:14px;color:${COLORS.muted};">${escapeHtml(data.dateText)}${data.location ? ` · ${escapeHtml(data.location)}` : ''}</p>
  </div>`
}

function paymentHtml(payment: EventPaymentSummary, color: string): string {
  const rows = payment.installments
    .map(
      (i) => `<tr>
        <td style="padding:6px 0;font-size:14px;">${escapeHtml(i.label)}<br><span style="color:${COLORS.muted};font-size:12px;">${escapeHtml(i.dueText)}</span></td>
        <td style="padding:6px 0;font-size:14px;text-align:right;white-space:nowrap;">${formatCLP(i.amount)}${
          i.link ? `<br><a href="${escapeHtml(i.link)}" style="color:${color};font-size:12px;">Pagar</a>` : ''
        }</td>
      </tr>`,
    )
    .join('')
  const balance = Math.max(0, payment.total - payment.paid)
  return `
    <p style="${P}margin:0 0 8px;font-size:15px;"><strong>Modalidad de pago:</strong> ${escapeHtml(payment.optionLabel)}</p>
    <table role="presentation" style="width:100%;border-collapse:collapse;margin:0 0 8px;">${rows}</table>
    <p style="${P}margin:0 0 16px;font-size:14px;">Total ${formatCLP(payment.total)} · Pagado ${formatCLP(payment.paid)} · <strong>Saldo ${formatCLP(balance)}</strong></p>
    ${payment.instructions ? paragraphs(payment.instructions) : ''}
    ${payment.link && balance > 0 ? button(payment.link, payment.linkLabel || 'Ir a pagar', color) : ''}
  `
}

function signatureHtml(signature?: string): string {
  return signature ? `<p style="${P}margin:24px 0 0;font-size:15px;">${escapeHtml(signature).replace(/\n/g, '<br>')}</p>` : ''
}

export function eventRegistrationReceivedTemplate(data: EventRegistrationReceivedData): EmailTemplate {
  const color = data.accentColor || COLORS.primary
  const subject = data.subject || (data.waitlist ? `Quedaste en lista de espera: ${data.eventName}` : `Recibimos tu inscripción: ${data.eventName}`)
  const defaultIntro = data.waitlist
    ? 'El evento está completo, así que quedaste en la lista de espera. Si se libera un cupo te avisaremos.'
    : 'Recibimos tu formulario de inscripción. Tu cupo queda confirmado cuando se registre tu primer pago.'
  const holdText =
    !data.waitlist && data.payment
      ? `<p style="${P}margin:0 0 16px;font-size:14px;color:${COLORS.muted};">Te guardamos el cupo por ${data.holdHours} horas mientras realizas el primer pago. Abrir el link de pago no confirma la inscripción: se confirma cuando el pago se registra.</p>`
      : ''
  const consents = data.acceptedConsents.length
    ? `<p style="${P}margin:24px 0 8px;font-size:13px;font-weight:600;">Condiciones aceptadas el ${escapeHtml(data.acceptedAt)}:</p>
       <ul style="margin:0 0 16px;padding-left:20px;font-size:13px;color:${COLORS.muted};">${data.acceptedConsents.map((c) => `<li style="${P}">${escapeHtml(c)}</li>`).join('')}</ul>`
    : ''
  const bodyHtml = `
    <p style="${P}margin:0 0 16px;font-size:16px;">¡Hola ${escapeHtml(data.participantName)}!</p>
    ${paragraphs(data.intro || defaultIntro)}
    ${eventBox(data, color)}
    ${data.payment && !data.waitlist ? paymentHtml(data.payment, color) : ''}
    ${holdText}
    ${button(data.receiptUrl, 'Ver mi inscripción', color)}
    ${consents}
    ${signatureHtml(data.signature)}
  `
  return { subject, html: renderLayout({ bodyHtml }) }
}

export function eventRegistrationStatusTemplate(data: EventRegistrationStatusData): EmailTemplate {
  const color = data.accentColor || COLORS.primary
  const subject =
    data.subject || (data.kind === 'paid' ? `Pago completo: ${data.eventName}` : `Tu cupo está confirmado: ${data.eventName}`)
  const defaultIntro =
    data.kind === 'paid'
      ? '¡Registramos el pago completo de tu inscripción! Ya no tienes saldo pendiente.'
      : '¡Registramos tu primer pago y tu cupo quedó confirmado! Abajo está el detalle de lo que queda por pagar.'
  const bodyHtml = `
    <p style="${P}margin:0 0 16px;font-size:16px;">¡Hola ${escapeHtml(data.participantName)}!</p>
    ${paragraphs(data.intro || defaultIntro)}
    ${eventBox(data, color)}
    ${paymentHtml(data.payment, color)}
    ${button(data.receiptUrl, 'Ver mi inscripción', color)}
    ${signatureHtml(data.signature)}
  `
  return { subject, html: renderLayout({ bodyHtml }) }
}

export function eventRegistrationProfessionalTemplate(data: EventRegistrationProfessionalData): EmailTemplate {
  const subject = `${data.waitlist ? 'Lista de espera' : 'Nueva inscripción'}: ${data.eventName} — ${data.participantName}`
  const rows = data.answers
    .map(
      (a) => `<tr><td style="padding:4px 8px 4px 0;font-size:13px;color:${COLORS.muted};vertical-align:top;">${escapeHtml(a.label)}</td><td style="padding:4px 0;font-size:13px;${P}">${escapeHtml(a.value)}</td></tr>`,
    )
    .join('')
  const count = data.capacity === null ? `${data.registeredCount} cupos ocupados` : `${data.registeredCount} de ${data.capacity} cupos ocupados`
  const bodyHtml = `
    <p style="${P}margin:0 0 16px;font-size:16px;"><strong>${escapeHtml(data.participantName)}</strong> se ${data.waitlist ? 'anotó en la lista de espera de' : 'inscribió en'} <strong>${escapeHtml(data.eventName)}</strong>.</p>
    <p style="${P}margin:0 0 4px;font-size:14px;">Correo: ${escapeHtml(data.email)}</p>
    <p style="${P}margin:0 0 4px;font-size:14px;">Teléfono: ${escapeHtml(data.phone || '—')}</p>
    <p style="${P}margin:0 0 16px;font-size:14px;">Modalidad: ${escapeHtml(data.optionLabel)} · ${formatCLP(data.total)}</p>
    <p style="${P}margin:0 0 16px;font-size:14px;color:${COLORS.muted};">${escapeHtml(count)} (incluye reservas provisionales). Los datos de salud solo se ven en el panel.</p>
    ${rows ? `<table role="presentation" style="width:100%;border-collapse:collapse;margin:0 0 16px;">${rows}</table>` : ''}
    ${button(data.adminUrl, 'Ver inscritos en el panel', COLORS.primary)}
  `
  return { subject, html: renderLayout({ bodyHtml }) }
}

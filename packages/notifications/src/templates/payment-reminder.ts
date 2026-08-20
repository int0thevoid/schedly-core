import { COLORS, contactFooter, escapeHtml, formatCLP, renderLayout, whatsAppLink, type EmailTemplate } from './layout.js'

export interface TransferData {
  rut: string
  bank: string
  accountType: string
  accountNumber: string
  email: string
}

export interface PaymentReminderData {
  clientName: string
  serviceName: string
  date: string
  time: string
  price: number
  transferData: TransferData
  professionalPhone: string
}

/**
 * Sección de "pago pendiente" reutilizable — se usa tanto en el email de recordatorio de pago
 * standalone (`paymentReminderTemplate`, hoy sin uso directo) como incrustada dentro del
 * recordatorio de cita unificado cuando la cita sigue sin marcarse como pagada.
 */
export function renderPaymentDueSection(data: {
  serviceName: string
  date: string
  time: string
  price: number
  transferData: TransferData
  professionalPhone: string
}): string {
  const whatsappMessage = `Hola, te envío el comprobante de pago de mi cita de ${data.serviceName} del ${data.date} a las ${data.time}.`
  const whatsappHref = whatsAppLink(data.professionalPhone, whatsappMessage)

  return `
    <div style="background-color:${COLORS.accentFaint};border-radius:8px;padding:20px;margin:0 0 24px;">
      <p style="word-wrap:break-word;overflow-wrap:break-word;max-width:100%;margin:0 0 12px;font-size:15px;font-weight:600;color:${COLORS.text};">💳 Pago pendiente — Datos para transferencia (${formatCLP(data.price)})</p>
      <table role="presentation" style="width:100%;border-collapse:collapse;font-size:14px;">
        <tr><td style="word-wrap:break-word;overflow-wrap:break-word;max-width:100%;padding:4px 0;color:${COLORS.muted};width:140px;">RUT</td><td style="word-wrap:break-word;overflow-wrap:break-word;max-width:100%;padding:4px 0;font-weight:600;">${escapeHtml(data.transferData.rut)}</td></tr>
        <tr><td style="word-wrap:break-word;overflow-wrap:break-word;max-width:100%;padding:4px 0;color:${COLORS.muted};">Banco</td><td style="word-wrap:break-word;overflow-wrap:break-word;max-width:100%;padding:4px 0;font-weight:600;">${escapeHtml(data.transferData.bank)}</td></tr>
        <tr><td style="word-wrap:break-word;overflow-wrap:break-word;max-width:100%;padding:4px 0;color:${COLORS.muted};">Tipo de cuenta</td><td style="word-wrap:break-word;overflow-wrap:break-word;max-width:100%;padding:4px 0;font-weight:600;">${escapeHtml(data.transferData.accountType)}</td></tr>
        <tr><td style="word-wrap:break-word;overflow-wrap:break-word;max-width:100%;padding:4px 0;color:${COLORS.muted};">N° de cuenta</td><td style="word-wrap:break-word;overflow-wrap:break-word;max-width:100%;padding:4px 0;font-weight:600;">${escapeHtml(data.transferData.accountNumber)}</td></tr>
        <tr><td style="word-wrap:break-word;overflow-wrap:break-word;max-width:100%;padding:4px 0;color:${COLORS.muted};">Email</td><td style="word-wrap:break-word;overflow-wrap:break-word;max-width:100%;padding:4px 0;font-weight:600;">${escapeHtml(data.transferData.email)}</td></tr>
      </table>
      <p style="word-wrap:break-word;overflow-wrap:break-word;max-width:100%;margin:16px 0;font-size:14px;">Una vez realizada la transferencia, envíanos el comprobante por WhatsApp:</p>
      <p style="word-wrap:break-word;overflow-wrap:break-word;max-width:100%;margin:0;text-align:center;">
        <a href="${whatsappHref}" style="display:inline-block;background-color:${COLORS.primary};color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 24px;border-radius:8px;">Enviar comprobante por WhatsApp</a>
      </p>
    </div>`
}

export function paymentReminderTemplate(data: PaymentReminderData): EmailTemplate {
  const subject = `💳 Recordatorio de pago — ${data.serviceName}`

  const bodyHtml = `
    <p style="word-wrap:break-word;overflow-wrap:break-word;max-width:100%;margin:0 0 16px;font-size:16px;">¡Hola ${escapeHtml(data.clientName)}!</p>
    <p style="word-wrap:break-word;overflow-wrap:break-word;max-width:100%;margin:0 0 24px;font-size:16px;">
      Te recordamos que tu cita de <strong>${escapeHtml(data.serviceName)}</strong> el ${escapeHtml(data.date)}
      a las ${escapeHtml(data.time)} aún tiene el pago pendiente.
    </p>

    ${renderPaymentDueSection(data)}
  `

  return {
    subject,
    html: renderLayout({
      bodyHtml,
      footerHtml: contactFooter(data.professionalPhone),
    }),
  }
}

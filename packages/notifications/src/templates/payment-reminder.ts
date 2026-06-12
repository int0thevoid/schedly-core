import { COLORS, contactFooter, escapeHtml, formatCLP, renderLayout, whatsAppLink, type EmailTemplate } from './layout.js'
import type { TransferData } from './appointment-confirmation.js'

export interface PaymentReminderData {
  clientName: string
  serviceName: string
  date: string
  time: string
  price: number
  transferData: TransferData
  professionalPhone: string
}

export function paymentReminderTemplate(data: PaymentReminderData): EmailTemplate {
  const subject = `💳 Recordatorio de pago — ${data.serviceName}`

  const whatsappMessage = `Hola, te envío el comprobante de pago de mi cita de ${data.serviceName} del ${data.date} a las ${data.time}.`
  const whatsappHref = whatsAppLink(data.professionalPhone, whatsappMessage)

  const bodyHtml = `
    <p style="margin:0 0 16px;font-size:16px;">¡Hola ${escapeHtml(data.clientName)}!</p>
    <p style="margin:0 0 24px;font-size:16px;">
      Te recordamos que tu cita de <strong>${escapeHtml(data.serviceName)}</strong> el ${escapeHtml(data.date)}
      a las ${escapeHtml(data.time)} aún tiene el pago pendiente.
    </p>

    <div style="background-color:${COLORS.accentFaint};border-radius:8px;padding:20px;margin-bottom:24px;">
      <p style="margin:0 0 12px;font-size:15px;font-weight:600;color:${COLORS.text};">Datos para transferencia (${formatCLP(data.price)})</p>
      <table role="presentation" style="width:100%;border-collapse:collapse;font-size:14px;">
        <tr><td style="padding:4px 0;color:${COLORS.muted};width:140px;">RUT</td><td style="padding:4px 0;font-weight:600;">${escapeHtml(data.transferData.rut)}</td></tr>
        <tr><td style="padding:4px 0;color:${COLORS.muted};">Banco</td><td style="padding:4px 0;font-weight:600;">${escapeHtml(data.transferData.bank)}</td></tr>
        <tr><td style="padding:4px 0;color:${COLORS.muted};">Tipo de cuenta</td><td style="padding:4px 0;font-weight:600;">${escapeHtml(data.transferData.accountType)}</td></tr>
        <tr><td style="padding:4px 0;color:${COLORS.muted};">N° de cuenta</td><td style="padding:4px 0;font-weight:600;">${escapeHtml(data.transferData.accountNumber)}</td></tr>
        <tr><td style="padding:4px 0;color:${COLORS.muted};">Email</td><td style="padding:4px 0;font-weight:600;">${escapeHtml(data.transferData.email)}</td></tr>
      </table>
    </div>

    <p style="margin:0 0 16px;font-size:15px;">Una vez realizada la transferencia, puedes enviarnos el comprobante por WhatsApp:</p>
    <p style="margin:0 0 8px;text-align:center;">
      <a href="${whatsappHref}" style="display:inline-block;background-color:${COLORS.primary};color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 24px;border-radius:8px;">Enviar comprobante por WhatsApp</a>
    </p>
  `

  return {
    subject,
    html: renderLayout({
      bodyHtml,
      footerHtml: contactFooter(data.professionalPhone),
    }),
  }
}

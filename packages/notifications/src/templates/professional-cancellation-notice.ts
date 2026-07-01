import { COLORS, escapeHtml, renderLayout, type EmailTemplate } from './layout.js'

export interface ProfessionalCancellationNoticeData {
  clientName: string
  clientEmail: string
  clientPhone: string
  serviceName: string
  date: string
  startTime: string
  adminUrl: string
}

export function professionalCancellationNoticeTemplate(data: ProfessionalCancellationNoticeData): EmailTemplate {
  const subject = `🔔 Cita anulada — ${data.clientName} el ${data.date}`

  const bodyHtml = `
    <p style="margin:0 0 20px;font-size:16px;">
      <strong>${escapeHtml(data.clientName)}</strong> anuló su cita del
      <strong>${escapeHtml(data.date)}</strong> a las <strong>${escapeHtml(data.startTime)}</strong>.
    </p>

    <div style="background-color:${COLORS.primaryFaint};border-radius:8px;padding:20px;margin-bottom:28px;">
      <p style="margin:0 0 12px;font-size:14px;font-weight:600;color:${COLORS.muted};text-transform:uppercase;letter-spacing:.5px;">Datos de contacto</p>
      <table role="presentation" style="width:100%;border-collapse:collapse;font-size:15px;">
        <tr><td style="padding:4px 0;color:${COLORS.muted};width:110px;">Email</td><td style="padding:4px 0;">${escapeHtml(data.clientEmail)}</td></tr>
        <tr><td style="padding:4px 0;color:${COLORS.muted};">Teléfono</td><td style="padding:4px 0;">${escapeHtml(data.clientPhone)}</td></tr>
        <tr><td style="padding:4px 0;color:${COLORS.muted};">Servicio</td><td style="padding:4px 0;">${escapeHtml(data.serviceName)}</td></tr>
      </table>
    </div>

    <div style="text-align:center;">
      <a href="${escapeHtml(data.adminUrl)}" style="display:inline-block;background-color:${COLORS.primary};color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 24px;border-radius:8px;">Ver en el panel</a>
    </div>
  `

  return {
    subject,
    html: renderLayout({ bodyHtml }),
  }
}

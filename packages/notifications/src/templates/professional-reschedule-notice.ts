import { COLORS, escapeHtml, renderLayout, type EmailTemplate } from './layout.js'

export interface ProfessionalRescheduleNoticeData {
  clientName: string
  clientEmail: string
  clientPhone: string
  serviceName: string
  modality: 'presential' | 'online'
  previousDate: string
  previousStartTime: string
  newDate: string
  newStartTime: string
  adminUrl: string
}

export function professionalRescheduleNoticeTemplate(data: ProfessionalRescheduleNoticeData): EmailTemplate {
  const subject = `🔁 Cita reagendada — ${data.clientName}: ${data.previousDate} → ${data.newDate}`
  const modality = data.modality === 'online' ? 'Online' : 'Presencial'

  const bodyHtml = `
    <p style="margin:0 0 20px;font-size:16px;">
      <strong>${escapeHtml(data.clientName)}</strong> reagendó su cita.
    </p>

    <div style="background-color:${COLORS.primaryFaint};border-radius:8px;padding:20px;margin-bottom:20px;">
      <table role="presentation" style="width:100%;border-collapse:collapse;font-size:15px;">
        <tr><td style="padding:4px 0;color:${COLORS.muted};width:110px;">Antes</td><td style="padding:4px 0;text-decoration:line-through;">${escapeHtml(data.previousDate)}, ${escapeHtml(data.previousStartTime)}</td></tr>
        <tr><td style="padding:4px 0;color:${COLORS.muted};">Ahora</td><td style="padding:4px 0;"><strong>${escapeHtml(data.newDate)}, ${escapeHtml(data.newStartTime)}</strong></td></tr>
        <tr><td style="padding:4px 0;color:${COLORS.muted};">Servicio</td><td style="padding:4px 0;">${escapeHtml(data.serviceName)} · ${modality}</td></tr>
      </table>
    </div>

    <div style="background-color:${COLORS.primaryFaint};border-radius:8px;padding:20px;margin-bottom:28px;">
      <p style="margin:0 0 12px;font-size:14px;font-weight:600;color:${COLORS.muted};text-transform:uppercase;letter-spacing:.5px;">Datos de contacto</p>
      <table role="presentation" style="width:100%;border-collapse:collapse;font-size:15px;">
        <tr><td style="padding:4px 0;color:${COLORS.muted};width:110px;">Email</td><td style="padding:4px 0;">${escapeHtml(data.clientEmail)}</td></tr>
        <tr><td style="padding:4px 0;color:${COLORS.muted};">Teléfono</td><td style="padding:4px 0;">${escapeHtml(data.clientPhone)}</td></tr>
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

import { COLORS, escapeHtml, formatCLP, renderLayout, type EmailTemplate } from './layout.js'

export interface ProfessionalNewBookingData {
  clientName: string
  clientEmail: string
  clientPhone: string
  serviceName: string
  date: string
  startTime: string
  endTime: string
  modality: string
  meetLink?: string
  price: number
  adminUrl: string
}

export function professionalNewBookingTemplate(data: ProfessionalNewBookingData): EmailTemplate {
  const subject = `🔔 Nueva reserva — ${data.clientName} el ${data.date}`

  const bodyHtml = `
    <p style="margin:0 0 20px;font-size:18px;font-weight:600;">Nueva reserva recibida</p>

    <div style="background-color:${COLORS.primaryFaint};border-radius:8px;padding:20px;margin-bottom:24px;">
      <p style="margin:0 0 12px;font-size:14px;font-weight:600;color:${COLORS.muted};text-transform:uppercase;letter-spacing:.5px;">Paciente</p>
      <table role="presentation" style="width:100%;border-collapse:collapse;font-size:15px;">
        <tr><td style="padding:4px 0;color:${COLORS.muted};width:1%;vertical-align:top;white-space:nowrap;padding-right:12px;">Nombre</td><td style="padding:4px 0;font-weight:600;vertical-align:top;word-break:break-word;">${escapeHtml(data.clientName)}</td></tr>
        <tr><td style="padding:4px 0;color:${COLORS.muted};width:1%;vertical-align:top;white-space:nowrap;padding-right:12px;">Email</td><td style="padding:4px 0;vertical-align:top;overflow-wrap:anywhere;word-break:break-all;">${escapeHtml(data.clientEmail)}</td></tr>
        <tr><td style="padding:4px 0;color:${COLORS.muted};width:1%;vertical-align:top;white-space:nowrap;padding-right:12px;">Teléfono</td><td style="padding:4px 0;vertical-align:top;word-break:break-word;">${escapeHtml(data.clientPhone)}</td></tr>
      </table>
    </div>

    <div style="background-color:${COLORS.accentFaint};border-radius:8px;padding:20px;margin-bottom:28px;">
      <p style="margin:0 0 12px;font-size:14px;font-weight:600;color:${COLORS.muted};text-transform:uppercase;letter-spacing:.5px;">Cita</p>
      <table role="presentation" style="width:100%;border-collapse:collapse;font-size:15px;">
        <tr><td style="padding:4px 0;color:${COLORS.muted};width:1%;vertical-align:top;white-space:nowrap;padding-right:12px;">Servicio</td><td style="padding:4px 0;font-weight:600;vertical-align:top;word-break:break-word;">${escapeHtml(data.serviceName)}</td></tr>
        <tr><td style="padding:4px 0;color:${COLORS.muted};width:1%;vertical-align:top;white-space:nowrap;padding-right:12px;">Fecha</td><td style="padding:4px 0;font-weight:600;vertical-align:top;word-break:break-word;">${escapeHtml(data.date)}</td></tr>
        <tr><td style="padding:4px 0;color:${COLORS.muted};width:1%;vertical-align:top;white-space:nowrap;padding-right:12px;">Horario</td><td style="padding:4px 0;font-weight:600;vertical-align:top;word-break:break-word;">${escapeHtml(data.startTime)} – ${escapeHtml(data.endTime)}</td></tr>
        <tr><td style="padding:4px 0;color:${COLORS.muted};width:1%;vertical-align:top;white-space:nowrap;padding-right:12px;">Modalidad</td><td style="padding:4px 0;vertical-align:top;word-break:break-word;">${escapeHtml(data.modality)}</td></tr>
        <tr><td style="padding:4px 0;color:${COLORS.muted};width:1%;vertical-align:top;white-space:nowrap;padding-right:12px;">Valor</td><td style="padding:4px 0;font-weight:600;vertical-align:top;word-break:break-word;">${formatCLP(data.price)}</td></tr>
        ${data.meetLink ? `<tr><td style="padding:4px 0;color:${COLORS.muted};width:1%;vertical-align:top;white-space:nowrap;padding-right:12px;">Meet</td><td style="padding:4px 0;vertical-align:top;word-break:break-word;"><a href="${escapeHtml(data.meetLink)}" style="color:${COLORS.primary};text-decoration:underline;">Unirse a la videollamada</a></td></tr>` : ''}
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

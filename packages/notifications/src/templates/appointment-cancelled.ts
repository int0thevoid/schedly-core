import { COLORS, contactFooter, escapeHtml, renderLayout, type EmailTemplate } from './layout.js'

export interface AppointmentCancelledData {
  clientName: string
  serviceName: string
  date: string
  time: string
  professionalName: string
  professionalPhone: string
}

export function appointmentCancelledTemplate(data: AppointmentCancelledData): EmailTemplate {
  const subject = `❌ Tu cita ha sido cancelada — ${data.serviceName}`

  const bodyHtml = `
    <p style="word-wrap:break-word;overflow-wrap:break-word;max-width:100%;margin:0 0 16px;font-size:16px;">Hola ${escapeHtml(data.clientName)}, tu cita ha sido cancelada.</p>

    <div style="background-color:${COLORS.accentFaint};border-radius:8px;padding:20px;margin-bottom:24px;">
      <table role="presentation" style="width:100%;border-collapse:collapse;font-size:15px;">
        <tr><td style="word-wrap:break-word;overflow-wrap:break-word;max-width:100%;padding:6px 0;color:${COLORS.muted};width:120px;">Servicio</td><td style="word-wrap:break-word;overflow-wrap:break-word;max-width:100%;padding:6px 0;font-weight:600;">${escapeHtml(data.serviceName)}</td></tr>
        <tr><td style="word-wrap:break-word;overflow-wrap:break-word;max-width:100%;padding:6px 0;color:${COLORS.muted};">Fecha</td><td style="word-wrap:break-word;overflow-wrap:break-word;max-width:100%;padding:6px 0;font-weight:600;">${escapeHtml(data.date)}</td></tr>
        <tr><td style="word-wrap:break-word;overflow-wrap:break-word;max-width:100%;padding:6px 0;color:${COLORS.muted};">Hora</td><td style="word-wrap:break-word;overflow-wrap:break-word;max-width:100%;padding:6px 0;font-weight:600;">${escapeHtml(data.time)}</td></tr>
      </table>
    </div>

    <p style="word-wrap:break-word;overflow-wrap:break-word;max-width:100%;margin:0 0 24px;font-size:15px;">Para reagendar comunícate al <strong>${escapeHtml(data.professionalPhone)}</strong>.</p>
  `

  return {
    subject,
    html: renderLayout({
      professionalName: data.professionalName,
      bodyHtml,
      footerHtml: contactFooter(data.professionalPhone),
    }),
  }
}

import { COLORS, escapeHtml, renderLayout, type EmailTemplate } from './layout.js'

export interface AppointmentCancelledByPatientData {
  clientName: string
  serviceName: string
  date: string
  startTime: string
  professionalName: string
  bookingUrl: string
}

export function appointmentCancelledByPatientTemplate(data: AppointmentCancelledByPatientData): EmailTemplate {
  const subject = '❌ Tu cita ha sido anulada'

  const bodyHtml = `
    <p style="margin:0 0 16px;font-size:16px;">¡Hola ${escapeHtml(data.clientName)}!</p>
    <p style="margin:0 0 24px;font-size:16px;">
      Tu cita del <strong>${escapeHtml(data.date)}</strong> a las <strong>${escapeHtml(data.startTime)}</strong>
      con ${escapeHtml(data.professionalName)} ha sido <strong>anulada</strong>.
    </p>
    <p style="margin:0 0 28px;font-size:15px;color:${COLORS.muted};">
      Si deseas agendar una nueva cita puedes hacerlo aquí:
    </p>
    <div style="text-align:center;">
      <a href="${escapeHtml(data.bookingUrl)}" style="display:inline-block;background-color:${COLORS.primary};color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 24px;border-radius:8px;">Agendar nueva cita</a>
    </div>
  `

  return {
    subject,
    html: renderLayout({ bodyHtml }),
  }
}

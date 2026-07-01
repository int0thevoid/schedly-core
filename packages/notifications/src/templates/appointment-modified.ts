import { COLORS, contactFooter, escapeHtml, formatCLP, googleMapsLink, renderLayout, type EmailTemplate } from './layout.js'

export interface AppointmentModifiedData {
  clientName: string
  originalDate: string
  originalTime: string
  newServiceName: string
  newDate: string
  newStartTime: string
  newEndTime: string
  modality: 'presential' | 'online'
  address?: string
  price: number
  professionalName: string
  professionalPhone: string
  modifyUrl: string
  cancelUrl: string
  googleCalendarUrl: string
}

function renderLocation(data: AppointmentModifiedData): string {
  if (data.modality === 'presential' && data.address) {
    return `
      <p style="margin:0 0 4px;font-size:15px;">📍 <strong>Ubicación:</strong> ${escapeHtml(data.address)}</p>
      <p style="margin:0 0 24px;font-size:14px;">
        <a href="${googleMapsLink(data.address)}" style="color:${COLORS.primary};text-decoration:underline;">Ver en Google Maps</a>
      </p>`
  }
  return `<p style="margin:0 0 24px;font-size:15px;">💻 Sesión online. Recibirás el link de videollamada próximamente.</p>`
}

export function appointmentModifiedTemplate(data: AppointmentModifiedData): EmailTemplate {
  const subject = `✏️ Tu cita ha sido modificada — ${data.newDate}`

  const bodyHtml = `
    <p style="margin:0 0 16px;font-size:16px;">¡Hola ${escapeHtml(data.clientName)}!</p>

    <div style="background-color:#fef3f2;border-left:4px solid ${COLORS.accent};border-radius:4px;padding:16px;margin-bottom:24px;">
      <p style="margin:0;font-size:15px;color:${COLORS.accent};">
        Tu cita del <strong>${escapeHtml(data.originalDate)}</strong> a las <strong>${escapeHtml(data.originalTime)}</strong> ha sido <strong>cancelada</strong>.
      </p>
    </div>

    <p style="margin:0 0 16px;font-size:16px;">Tu nueva cita queda agendada para:</p>

    <div style="background-color:${COLORS.primaryFaint};border-radius:8px;padding:20px;margin-bottom:24px;">
      <table role="presentation" style="width:100%;border-collapse:collapse;font-size:15px;">
        <tr><td style="padding:6px 0;color:${COLORS.muted};width:120px;">Servicio</td><td style="padding:6px 0;font-weight:600;">${escapeHtml(data.newServiceName)}</td></tr>
        <tr><td style="padding:6px 0;color:${COLORS.muted};">Fecha</td><td style="padding:6px 0;font-weight:600;">${escapeHtml(data.newDate)}</td></tr>
        <tr><td style="padding:6px 0;color:${COLORS.muted};">Horario</td><td style="padding:6px 0;font-weight:600;">${escapeHtml(data.newStartTime)} – ${escapeHtml(data.newEndTime)}</td></tr>
        <tr><td style="padding:6px 0;color:${COLORS.muted};">Modalidad</td><td style="padding:6px 0;font-weight:600;">${data.modality === 'presential' ? 'Presencial' : 'Online'}</td></tr>
        <tr><td style="padding:6px 0;color:${COLORS.muted};">Valor</td><td style="padding:6px 0;font-weight:600;">${formatCLP(data.price)}</td></tr>
      </table>
    </div>

    ${renderLocation(data)}

    <p style="margin:0 0 24px;font-size:14px;color:${COLORS.muted};">Puedes modificar o anular tu nueva cita hasta las <strong>23:00 del día anterior</strong>.</p>

    <div style="margin:0 0 12px;text-align:center;">
      <a href="${escapeHtml(data.modifyUrl)}" style="display:inline-block;background-color:${COLORS.primary};color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:10px 20px;border-radius:8px;margin:4px;">✏️ Modificar cita</a>
      <a href="${escapeHtml(data.cancelUrl)}" style="display:inline-block;background-color:#fff;color:${COLORS.accent};text-decoration:none;font-weight:600;font-size:14px;padding:10px 20px;border-radius:8px;margin:4px;border:1px solid ${COLORS.accent};">❌ Anular cita</a>
    </div>
    <div style="text-align:center;">
      <a href="${escapeHtml(data.googleCalendarUrl)}" style="display:inline-block;background-color:#fff;color:${COLORS.primary};text-decoration:none;font-weight:600;font-size:14px;padding:10px 20px;border-radius:8px;border:1px solid ${COLORS.primary};">📅 Agregar a Google Calendar</a>
    </div>
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

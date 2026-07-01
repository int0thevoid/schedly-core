import { COLORS, escapeHtml, googleMapsLink, renderLayout, type EmailTemplate } from './layout.js'

export interface AppointmentReminderData {
  clientName: string
  serviceName: string
  date: string
  startTime: string
  endTime: string
  modality: 'presential' | 'online'
  address?: string
  meetLink?: string
  googleCalendarUrl: string
}

function renderLocation(data: AppointmentReminderData): string {
  if (data.modality === 'presential' && data.address) {
    return `
      <p style="margin:0 0 24px;font-size:15px;">
        📍 ${escapeHtml(data.address)} —
        <a href="${googleMapsLink(data.address)}" style="color:${COLORS.primary};text-decoration:underline;">Ver en Google Maps</a>
      </p>`
  }

  const meetLinkHtml = data.meetLink
    ? ` <a href="${escapeHtml(data.meetLink)}" style="color:${COLORS.primary};text-decoration:underline;">Unirse a la videollamada</a>`
    : ''

  return `<p style="margin:0 0 24px;font-size:15px;">💻 Sesión online.${meetLinkHtml}</p>`
}

export function appointmentReminderTemplate(data: AppointmentReminderData): EmailTemplate {
  const subject = '🩵 Todo listo para tu sesión de hoy'

  const bodyHtml = `
    <p style="margin:0 0 16px;font-size:16px;">¡Hola ${escapeHtml(data.clientName)}!</p>
    <p style="margin:0 0 24px;font-size:16px;">Tu sesión es en <strong>2 horas</strong>. Aquí un recordatorio:</p>

    <div style="background-color:${COLORS.primaryFaint};border-radius:8px;padding:20px;margin-bottom:24px;">
      <table role="presentation" style="width:100%;border-collapse:collapse;font-size:15px;">
        <tr><td style="padding:6px 0;color:${COLORS.muted};width:120px;">Servicio</td><td style="padding:6px 0;font-weight:600;">${escapeHtml(data.serviceName)}</td></tr>
        <tr><td style="padding:6px 0;color:${COLORS.muted};">Fecha</td><td style="padding:6px 0;font-weight:600;">${escapeHtml(data.date)}</td></tr>
        <tr><td style="padding:6px 0;color:${COLORS.muted};">Horario</td><td style="padding:6px 0;font-weight:600;">${escapeHtml(data.startTime)} – ${escapeHtml(data.endTime)}</td></tr>
        <tr><td style="padding:6px 0;color:${COLORS.muted};">Modalidad</td><td style="padding:6px 0;font-weight:600;">${data.modality === 'presential' ? 'Presencial' : 'Online'}</td></tr>
      </table>
    </div>

    ${renderLocation(data)}

    <p style="margin:0 0 24px;font-size:14px;color:${COLORS.muted};">Llega / conéctate unos minutos antes para comenzar puntual.</p>

    <div style="text-align:center;">
      <a href="${escapeHtml(data.googleCalendarUrl)}" style="display:inline-block;background-color:#fff;color:${COLORS.primary};text-decoration:none;font-weight:600;font-size:14px;padding:10px 20px;border-radius:8px;border:1px solid ${COLORS.primary};">📅 Agregar a Google Calendar</a>
    </div>
  `

  return {
    subject,
    html: renderLayout({ bodyHtml }),
  }
}

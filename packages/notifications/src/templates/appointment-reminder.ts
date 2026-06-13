import { COLORS, contactFooter, escapeHtml, googleMapsLink, renderLayout, type EmailTemplate } from './layout.js'

export interface AppointmentReminderData {
  clientName: string
  serviceName: string
  date: string
  time: string
  modality: 'presential' | 'online'
  address?: string
  meetLink?: string
  professionalName: string
  professionalPhone: string
  hoursUntil: number
}

function renderLocation(data: AppointmentReminderData): string {
  if (data.modality === 'presential') {
    if (!data.address) return ''
    return `
      <p style="word-wrap:break-word;overflow-wrap:break-word;max-width:100%;margin:0 0 24px;font-size:15px;">
        📍 ${escapeHtml(data.address)} —
        <a href="${googleMapsLink(data.address)}" style="color:${COLORS.primary};text-decoration:underline;">Ver en Google Maps</a>
      </p>`
  }

  const meetLinkHtml = data.meetLink
    ? ` <a href="${escapeHtml(data.meetLink)}" style="color:${COLORS.primary};text-decoration:underline;">Unirse a la videollamada</a>`
    : ''

  return `<p style="word-wrap:break-word;overflow-wrap:break-word;max-width:100%;margin:0 0 24px;font-size:15px;">💻 Sesión online.${meetLinkHtml}</p>`
}

export function appointmentReminderTemplate(data: AppointmentReminderData): EmailTemplate {
  const whenText = data.hoursUntil === 24 ? 'mañana' : 'en 2 horas'
  const subject = `⏰ Recordatorio: tu cita es ${whenText}`

  const bodyHtml = `
    <p style="word-wrap:break-word;overflow-wrap:break-word;max-width:100%;margin:0 0 16px;font-size:16px;">¡Hola ${escapeHtml(data.clientName)}!</p>
    <p style="word-wrap:break-word;overflow-wrap:break-word;max-width:100%;margin:0 0 24px;font-size:16px;">Te recordamos que tu cita es <strong>${whenText}</strong>:</p>

    <div style="background-color:${COLORS.primaryFaint};border-radius:8px;padding:20px;margin-bottom:24px;">
      <table role="presentation" style="width:100%;border-collapse:collapse;font-size:15px;">
        <tr><td style="word-wrap:break-word;overflow-wrap:break-word;max-width:100%;padding:6px 0;color:${COLORS.muted};width:120px;">Servicio</td><td style="word-wrap:break-word;overflow-wrap:break-word;max-width:100%;padding:6px 0;font-weight:600;">${escapeHtml(data.serviceName)}</td></tr>
        <tr><td style="word-wrap:break-word;overflow-wrap:break-word;max-width:100%;padding:6px 0;color:${COLORS.muted};">Fecha</td><td style="word-wrap:break-word;overflow-wrap:break-word;max-width:100%;padding:6px 0;font-weight:600;">${escapeHtml(data.date)}</td></tr>
        <tr><td style="word-wrap:break-word;overflow-wrap:break-word;max-width:100%;padding:6px 0;color:${COLORS.muted};">Hora</td><td style="word-wrap:break-word;overflow-wrap:break-word;max-width:100%;padding:6px 0;font-weight:600;">${escapeHtml(data.time)}</td></tr>
        <tr><td style="word-wrap:break-word;overflow-wrap:break-word;max-width:100%;padding:6px 0;color:${COLORS.muted};">Modalidad</td><td style="word-wrap:break-word;overflow-wrap:break-word;max-width:100%;padding:6px 0;font-weight:600;">${data.modality === 'presential' ? 'Presencial' : 'Online'}</td></tr>
      </table>
    </div>

    ${renderLocation(data)}
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

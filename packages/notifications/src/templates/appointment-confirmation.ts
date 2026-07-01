import { COLORS, contactFooter, escapeHtml, formatCLP, googleMapsLink, renderLayout, type EmailTemplate } from './layout.js'

export interface AppointmentConfirmationData {
  clientName: string
  serviceName: string
  date: string
  startTime: string
  endTime: string
  modality: 'presential' | 'online'
  address?: string
  price: number
  professionalName: string
  professionalPhone: string
  modifyUrl: string
  cancelUrl: string
  googleCalendarUrl: string
}

function renderLocation(data: AppointmentConfirmationData): string {
  if (data.modality === 'presential' && data.address) {
    return `
      <p style="margin:0 0 4px;font-size:15px;">📍 <strong>Ubicación:</strong> ${escapeHtml(data.address)}</p>
      <p style="margin:0 0 24px;font-size:14px;">
        <a href="${googleMapsLink(data.address)}" style="color:${COLORS.primary};text-decoration:underline;">Ver en Google Maps</a>
      </p>`
  }
  return `<p style="margin:0 0 24px;font-size:15px;">💻 Sesión online. Recibirás el link de videollamada próximamente.</p>`
}

function renderActionButtons(data: AppointmentConfirmationData): string {
  return `
    <div style="margin:28px 0 0;text-align:center;">
      <a href="${escapeHtml(data.modifyUrl)}" style="display:inline-block;background-color:${COLORS.primary};color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:10px 20px;border-radius:8px;margin:4px;">✏️ Modificar cita</a>
      <a href="${escapeHtml(data.cancelUrl)}" style="display:inline-block;background-color:#fff;color:${COLORS.accent};text-decoration:none;font-weight:600;font-size:14px;padding:10px 20px;border-radius:8px;margin:4px;border:1px solid ${COLORS.accent};">❌ Anular cita</a>
    </div>
    <div style="margin:12px 0 0;text-align:center;">
      <a href="${escapeHtml(data.googleCalendarUrl)}" style="display:inline-block;background-color:#fff;color:${COLORS.primary};text-decoration:none;font-weight:600;font-size:14px;padding:10px 20px;border-radius:8px;border:1px solid ${COLORS.primary};">📅 Agregar a Google Calendar</a>
    </div>`
}

export function appointmentConfirmationTemplate(data: AppointmentConfirmationData): EmailTemplate {
  const subject = `📋 Tu cita ha sido agendada — ${data.serviceName} el ${data.date}`

  const bodyHtml = `
    <p style="margin:0 0 16px;font-size:16px;">¡Hola ${escapeHtml(data.clientName)}!</p>
    <p style="margin:0 0 24px;font-size:16px;">Tu cita ha sido agendada. Aquí los detalles:</p>

    <div style="background-color:${COLORS.primaryFaint};border-radius:8px;padding:20px;margin-bottom:24px;">
      <table role="presentation" style="width:100%;border-collapse:collapse;font-size:15px;">
        <tr><td style="padding:6px 0;color:${COLORS.muted};width:120px;">Servicio</td><td style="padding:6px 0;font-weight:600;">${escapeHtml(data.serviceName)}</td></tr>
        <tr><td style="padding:6px 0;color:${COLORS.muted};">Fecha</td><td style="padding:6px 0;font-weight:600;">${escapeHtml(data.date)}</td></tr>
        <tr><td style="padding:6px 0;color:${COLORS.muted};">Horario</td><td style="padding:6px 0;font-weight:600;">${escapeHtml(data.startTime)} – ${escapeHtml(data.endTime)}</td></tr>
        <tr><td style="padding:6px 0;color:${COLORS.muted};">Modalidad</td><td style="padding:6px 0;font-weight:600;">${data.modality === 'presential' ? 'Presencial' : 'Online'}</td></tr>
        <tr><td style="padding:6px 0;color:${COLORS.muted};">Valor</td><td style="padding:6px 0;font-weight:600;">${formatCLP(data.price)}</td></tr>
      </table>
    </div>

    ${renderLocation(data)}

    <p style="margin:0 0 8px;font-size:14px;color:${COLORS.muted};">Procura llegar unos minutos antes de tu sesión.</p>
    <p style="margin:0 0 24px;font-size:14px;color:${COLORS.muted};">Puedes modificar o anular tu cita hasta las <strong>23:00 del día anterior</strong> a tu sesión.</p>

    ${renderActionButtons(data)}
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

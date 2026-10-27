import { COLORS, escapeHtml, renderLayout, type EmailTemplate } from './layout.js'

export interface DailyDigestAppointment {
  time: string
  clientName: string
  serviceName: string
  modality: string
  /** Color hex asociado al estado de pago/confirmación de la cita. */
  color: string
  /** Etiqueta legible del estado, ej. "Confirmado y pagado". */
  colorLabel: string
}

/** Sesión pasada sin "Asistió/No asistió" (US-100: al marcar "Asistió" sale la encuesta). */
export interface DailyDigestUnmarkedSession {
  date: string
  time: string
  clientName: string
}

export interface DailyDigestData {
  professionalName: string
  date: string
  appointments: DailyDigestAppointment[]
  adminUrl: string
  unmarkedSessions?: DailyDigestUnmarkedSession[]
}

function renderUnmarked(sessions: DailyDigestUnmarkedSession[] | undefined): string {
  if (!sessions?.length) return ''
  const rows = sessions
    .map(
      (s) => `
    <tr>
      <td style="padding:4px 0;width:150px;font-size:14px;color:${COLORS.muted};vertical-align:top;">${escapeHtml(s.date)} · ${escapeHtml(s.time)}</td>
      <td style="word-wrap:break-word;overflow-wrap:break-word;max-width:100%;padding:4px 0;font-size:14px;vertical-align:top;">${escapeHtml(s.clientName)}</td>
    </tr>`,
    )
    .join('')
  return `
    <div style="margin-top:24px;padding:16px;border-radius:8px;background-color:#FFF8E6;">
      <p style="word-wrap:break-word;overflow-wrap:break-word;max-width:100%;margin:0 0 8px;font-size:15px;font-weight:600;">Sesiones sin marcar asistencia (${sessions.length})</p>
      <p style="word-wrap:break-word;overflow-wrap:break-word;max-width:100%;margin:0 0 12px;font-size:13px;color:${COLORS.muted};">Márcalas en la Agenda como «Asistió» o «No asistió». Al marcar «Asistió» se envía la encuesta a la paciente (si la aceptó al agendar).</p>
      <table role="presentation" style="width:100%;border-collapse:collapse;">${rows}</table>
    </div>`
}

const LEGEND: { color: string; label: string }[] = [
  { color: '#8FA88B', label: 'Confirmado y pagado' },
  { color: '#6B9BC3', label: 'Confirmado, pago pendiente' },
  { color: '#E9C46A', label: 'Pagado, sin confirmar asistencia' },
  { color: '#E76F51', label: 'Sin confirmar ni pagar' },
]

function renderAppointmentRow(appt: DailyDigestAppointment): string {
  return `
    <tr>
      <td style="padding:8px 0;width:24px;vertical-align:top;"><span title="${escapeHtml(appt.colorLabel)}" style="display:inline-block;width:12px;height:12px;border-radius:50%;background-color:${escapeHtml(appt.color)};margin-top:4px;"></span></td>
      <td style="padding:8px 0;width:70px;font-weight:600;vertical-align:top;">${escapeHtml(appt.time)}</td>
      <td style="word-wrap:break-word;overflow-wrap:break-word;max-width:100%;padding:8px 0;vertical-align:top;">
        <div style="font-weight:600;">${escapeHtml(appt.clientName)}</div>
        <div style="color:${COLORS.muted};font-size:13px;">${escapeHtml(appt.serviceName)} · ${escapeHtml(appt.modality)}</div>
      </td>
    </tr>`
}

function renderLegend(): string {
  const items = LEGEND.map(
    (item) => `
    <tr>
      <td style="padding:4px 0;width:24px;"><span style="display:inline-block;width:12px;height:12px;border-radius:50%;background-color:${item.color};"></span></td>
      <td style="padding:4px 8px;font-size:13px;color:${COLORS.muted};">${escapeHtml(item.label)}</td>
    </tr>`
  ).join('')

  return `
    <table role="presentation" style="width:100%;border-collapse:collapse;margin-top:24px;border-top:1px solid ${COLORS.border};padding-top:16px;">
      ${items}
    </table>`
}

export function dailyDigestTemplate(data: DailyDigestData): EmailTemplate {
  const subject = `📅 Tu agenda de mañana — ${data.date}`

  const appointmentsHtml = data.appointments.length
    ? `<table role="presentation" style="width:100%;border-collapse:collapse;font-size:15px;">${data.appointments.map(renderAppointmentRow).join('')}</table>`
    : `<p style="word-wrap:break-word;overflow-wrap:break-word;max-width:100%;margin:0 0 24px;font-size:15px;color:${COLORS.muted};">No tienes citas para mañana.</p>`

  const bodyHtml = `
    <p style="word-wrap:break-word;overflow-wrap:break-word;max-width:100%;margin:0 0 24px;font-size:18px;font-weight:600;color:${COLORS.text};">Agenda para mañana, ${escapeHtml(data.date)}</p>
    ${appointmentsHtml}
    ${renderLegend()}
    ${renderUnmarked(data.unmarkedSessions)}
    <p style="word-wrap:break-word;overflow-wrap:break-word;max-width:100%;margin:24px 0 0;text-align:center;">
      <a href="${escapeHtml(data.adminUrl)}" style="display:inline-block;background-color:${COLORS.primary};color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 24px;border-radius:8px;">Ver agenda completa</a>
    </p>
  `

  return {
    subject,
    html: renderLayout({
      professionalName: data.professionalName,
      bodyHtml,
    }),
  }
}

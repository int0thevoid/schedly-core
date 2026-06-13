import { COLORS, escapeHtml, renderLayout } from './layout.js'

export type ConfirmAttendancePageStatus = 'confirmed' | 'already-confirmed' | 'not-found'

export interface ConfirmAttendancePageData {
  status: ConfirmAttendancePageStatus
  professionalName?: string
}

const MESSAGES: Record<ConfirmAttendancePageStatus, { title: string; body: string }> = {
  confirmed: {
    title: '¡Gracias por confirmar!',
    body: 'Hemos registrado tu confirmación de asistencia. ¡Te esperamos!',
  },
  'already-confirmed': {
    title: 'Asistencia ya confirmada',
    body: 'Ya habías confirmado tu asistencia anteriormente. ¡Te esperamos!',
  },
  'not-found': {
    title: 'Cita no encontrada',
    body: 'No pudimos encontrar la cita asociada a este enlace.',
  },
}

/** Página HTML mostrada al cliente tras hacer clic en "Confirmar asistencia" desde el email. */
export function confirmAttendancePageTemplate(data: ConfirmAttendancePageData): string {
  const { title, body } = MESSAGES[data.status]

  const bodyHtml = `
    <div style="text-align:center;">
      <p style="font-size:40px;margin:0 0 16px;">${data.status === 'not-found' ? '⚠️' : '✅'}</p>
      <h1 style="font-size:20px;margin:0 0 12px;color:${COLORS.text};">${escapeHtml(title)}</h1>
      <p style="font-size:15px;color:${COLORS.muted};margin:0;">${escapeHtml(body)}</p>
    </div>
  `

  return renderLayout({
    professionalName: data.status === 'not-found' ? undefined : data.professionalName,
    bodyHtml,
  })
}

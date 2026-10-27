import { COLORS, escapeHtml, renderLayout, type EmailTemplate } from './layout.js'

export interface ReviewRequestData {
  clientName: string
  serviceName: string
  professionalName: string
  /** Fecha legible de la sesión evaluada, ej. "martes 20 de octubre". */
  sessionDate: string
  /** Formulario de reseña de ESTA sesión en el sitio (US-100). */
  reviewUrl: string
  /** Enlace para no recibir más encuestas. */
  unsubscribeUrl: string
  /** Opcional: además, dejarla en Google. */
  googleReviewLink?: string
}

export function reviewRequestTemplate(data: ReviewRequestData): EmailTemplate {
  const subject = `⭐ ¿Qué te pareció tu sesión del ${data.sessionDate}?`

  const googleHtml = data.googleReviewLink
    ? `<p style="word-wrap:break-word;overflow-wrap:break-word;max-width:100%;margin:12px 0 0;text-align:center;font-size:14px;">
        <a href="${escapeHtml(data.googleReviewLink)}" style="color:${COLORS.primary};text-decoration:underline;">También puedes dejarla en Google</a>
      </p>`
    : ''

  const bodyHtml = `
    <p style="word-wrap:break-word;overflow-wrap:break-word;max-width:100%;margin:0 0 16px;font-size:16px;">¡Hola ${escapeHtml(data.clientName)}!</p>
    <p style="word-wrap:break-word;overflow-wrap:break-word;max-width:100%;margin:0 0 24px;font-size:16px;">
      ¿Qué te pareció tu sesión de <strong>${escapeHtml(data.serviceName)}</strong> del ${escapeHtml(data.sessionDate)}?
      Tu opinión me ayuda a seguir mejorando y a otras personas a dar el paso. Toma menos de un minuto y puede ser anónima.
    </p>

    <p style="word-wrap:break-word;overflow-wrap:break-word;max-width:100%;margin:0;text-align:center;">
      <a href="${escapeHtml(data.reviewUrl)}" style="display:inline-block;background-color:${COLORS.primary};color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 24px;border-radius:8px;">Responder la encuesta</a>
    </p>
    ${googleHtml}

    <p style="word-wrap:break-word;overflow-wrap:break-word;max-width:100%;margin:24px 0 0;font-size:15px;">¡Gracias por tu confianza!<br>${escapeHtml(data.professionalName)}</p>
    <p style="word-wrap:break-word;overflow-wrap:break-word;max-width:100%;margin:24px 0 0;font-size:12px;color:${COLORS.muted};">
      ¿No quieres recibir más encuestas? <a href="${escapeHtml(data.unsubscribeUrl)}" style="color:${COLORS.muted};text-decoration:underline;">Darme de baja</a>
    </p>
  `

  return {
    subject,
    html: renderLayout({
      bodyHtml,
    }),
  }
}

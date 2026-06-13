import { COLORS, escapeHtml, renderLayout, type EmailTemplate } from './layout.js'

export interface ReviewRequestData {
  clientName: string
  serviceName: string
  professionalName: string
  googleReviewLink?: string
}

export function reviewRequestTemplate(data: ReviewRequestData): EmailTemplate {
  const subject = `⭐ ¿Cómo fue tu sesión con ${data.professionalName}?`

  const callToActionHtml = data.googleReviewLink
    ? `<p style="word-wrap:break-word;overflow-wrap:break-word;max-width:100%;margin:0 0 8px;text-align:center;">
        <a href="${escapeHtml(data.googleReviewLink)}" style="display:inline-block;background-color:${COLORS.primary};color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 24px;border-radius:8px;">Dejar reseña en Google</a>
      </p>`
    : `<p style="word-wrap:break-word;overflow-wrap:break-word;max-width:100%;margin:0 0 16px;font-size:15px;">Si quieres, puedes responder este correo contándonos tu experiencia. ¡Nos ayuda mucho a seguir mejorando!</p>`

  const bodyHtml = `
    <p style="word-wrap:break-word;overflow-wrap:break-word;max-width:100%;margin:0 0 16px;font-size:16px;">¡Hola ${escapeHtml(data.clientName)}!</p>
    <p style="word-wrap:break-word;overflow-wrap:break-word;max-width:100%;margin:0 0 24px;font-size:16px;">
      Esperamos que tu sesión de <strong>${escapeHtml(data.serviceName)}</strong> con ${escapeHtml(data.professionalName)} haya sido de tu agrado.
      Tu opinión es muy importante para nosotros y para otras personas que están buscando ayuda.
    </p>

    ${callToActionHtml}

    <p style="word-wrap:break-word;overflow-wrap:break-word;max-width:100%;margin:24px 0 0;font-size:15px;">¡Gracias por tu confianza!</p>
  `

  return {
    subject,
    html: renderLayout({
      bodyHtml,
    }),
  }
}

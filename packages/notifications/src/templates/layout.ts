export interface EmailTemplate {
  subject: string
  html: string
}

export const COLORS = {
  primary: '#5a8450',
  primaryDark: '#466840',
  primaryFaint: '#f2f5f0',
  accent: '#d4583a',
  accentFaint: '#fdf4f0',
  background: '#f9f5ec',
  text: '#2d2d2d',
  muted: '#6b7280',
  border: '#e5e7eb',
}

/** Escapa caracteres HTML para evitar inyección de datos provistos por el cliente (nombre, dirección, etc.). */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function formatCLP(amount: number): string {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
  }).format(amount)
}

export function googleMapsLink(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
}

export function whatsAppLink(phone: string, message: string): string {
  const digits = phone.replace(/\D/g, '')
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`
}

interface LayoutOptions {
  professionalName?: string
  bodyHtml: string
  footerHtml?: string
}

/** Layout base compartido por todos los emails: header con el nombre del profesional (opcional), card central y footer opcional. */
export function renderLayout({ professionalName, bodyHtml, footerHtml }: LayoutOptions): string {
  const headerHtml = professionalName
    ? `<div style="text-align:center;padding:8px 0 24px;">
        <span style="font-size:18px;font-weight:600;color:${COLORS.primaryDark};">${escapeHtml(professionalName)}</span>
      </div>`
    : ''

  return `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  </head>
  <body style="margin:0;padding:0;background-color:${COLORS.background};font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${COLORS.text};">
    <div style="max-width:600px;margin:0 auto;padding:24px 16px;">
      ${headerHtml}
      <div style="background-color:#ffffff;border:1px solid ${COLORS.border};border-radius:12px;padding:32px;">
        ${bodyHtml}
      </div>
      ${footerHtml ? `<div style="text-align:center;padding:24px 16px 8px;color:${COLORS.muted};font-size:13px;line-height:1.6;">${footerHtml}</div>` : ''}
    </div>
  </body>
</html>`
}

/** Footer estándar con datos de contacto del profesional. */
export function contactFooter(professionalPhone: string): string {
  return `Ante cualquier consulta escríbenos al <strong style="color:${COLORS.text};">${escapeHtml(professionalPhone)}</strong>`
}

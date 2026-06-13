import { COLORS, contactFooter, escapeHtml, formatCLP, googleMapsLink, renderLayout, type EmailTemplate } from './layout.js'

export interface TransferData {
  rut: string
  bank: string
  accountType: string
  accountNumber: string
  email: string
}

export interface AppointmentConfirmationData {
  clientName: string
  serviceName: string
  date: string
  time: string
  modality: 'presential' | 'online'
  address?: string
  meetLink?: string
  price: number
  professionalName: string
  professionalPhone: string
  transferData?: TransferData
}

function renderLocation(data: AppointmentConfirmationData): string {
  if (data.modality === 'presential') {
    if (!data.address) return ''
    return `
      <p style="word-wrap:break-word;overflow-wrap:break-word;max-width:100%;margin:0 0 4px;font-size:15px;">📍 <strong>Ubicación:</strong> ${escapeHtml(data.address)}</p>
      <p style="word-wrap:break-word;overflow-wrap:break-word;max-width:100%;margin:0 0 24px;font-size:14px;">
        <a href="${googleMapsLink(data.address)}" style="color:${COLORS.primary};text-decoration:underline;">Ver en Google Maps</a>
      </p>`
  }

  const meetLinkHtml = data.meetLink
    ? `<p style="word-wrap:break-word;overflow-wrap:break-word;max-width:100%;margin:8px 0 0;font-size:14px;"><a href="${escapeHtml(data.meetLink)}" style="color:${COLORS.primary};text-decoration:underline;">Unirse a la videollamada</a></p>`
    : ''

  return `
    <p style="word-wrap:break-word;overflow-wrap:break-word;max-width:100%;margin:0 0 24px;font-size:15px;">
      💻 Recibirás el link de videollamada próximamente.${meetLinkHtml}
    </p>`
}

function renderTransferData(transferData: TransferData, price: number): string {
  return `
    <div style="background-color:${COLORS.accentFaint};border-radius:8px;padding:20px;margin-bottom:8px;">
      <p style="word-wrap:break-word;overflow-wrap:break-word;max-width:100%;margin:0 0 12px;font-size:15px;font-weight:600;color:${COLORS.text};">Datos para transferencia (${formatCLP(price)})</p>
      <table role="presentation" style="width:100%;border-collapse:collapse;font-size:14px;">
        <tr><td style="word-wrap:break-word;overflow-wrap:break-word;max-width:100%;padding:4px 0;color:${COLORS.muted};width:140px;">RUT</td><td style="word-wrap:break-word;overflow-wrap:break-word;max-width:100%;padding:4px 0;font-weight:600;">${escapeHtml(transferData.rut)}</td></tr>
        <tr><td style="word-wrap:break-word;overflow-wrap:break-word;max-width:100%;padding:4px 0;color:${COLORS.muted};">Banco</td><td style="word-wrap:break-word;overflow-wrap:break-word;max-width:100%;padding:4px 0;font-weight:600;">${escapeHtml(transferData.bank)}</td></tr>
        <tr><td style="word-wrap:break-word;overflow-wrap:break-word;max-width:100%;padding:4px 0;color:${COLORS.muted};">Tipo de cuenta</td><td style="word-wrap:break-word;overflow-wrap:break-word;max-width:100%;padding:4px 0;font-weight:600;">${escapeHtml(transferData.accountType)}</td></tr>
        <tr><td style="word-wrap:break-word;overflow-wrap:break-word;max-width:100%;padding:4px 0;color:${COLORS.muted};">N° de cuenta</td><td style="word-wrap:break-word;overflow-wrap:break-word;max-width:100%;padding:4px 0;font-weight:600;">${escapeHtml(transferData.accountNumber)}</td></tr>
        <tr><td style="word-wrap:break-word;overflow-wrap:break-word;max-width:100%;padding:4px 0;color:${COLORS.muted};">Email</td><td style="word-wrap:break-word;overflow-wrap:break-word;max-width:100%;padding:4px 0;font-weight:600;">${escapeHtml(transferData.email)}</td></tr>
      </table>
    </div>`
}

export function appointmentConfirmationTemplate(data: AppointmentConfirmationData): EmailTemplate {
  const subject = `✅ Cita confirmada — ${data.serviceName} el ${data.date}`

  const bodyHtml = `
    <p style="word-wrap:break-word;overflow-wrap:break-word;max-width:100%;margin:0 0 16px;font-size:16px;">¡Hola ${escapeHtml(data.clientName)}!</p>
    <p style="word-wrap:break-word;overflow-wrap:break-word;max-width:100%;margin:0 0 24px;font-size:16px;">Tu cita ha sido agendada. Aquí los detalles:</p>

    <div style="background-color:${COLORS.primaryFaint};border-radius:8px;padding:20px;margin-bottom:24px;">
      <table role="presentation" style="width:100%;border-collapse:collapse;font-size:15px;">
        <tr><td style="word-wrap:break-word;overflow-wrap:break-word;max-width:100%;padding:6px 0;color:${COLORS.muted};width:120px;">Servicio</td><td style="word-wrap:break-word;overflow-wrap:break-word;max-width:100%;padding:6px 0;font-weight:600;">${escapeHtml(data.serviceName)}</td></tr>
        <tr><td style="word-wrap:break-word;overflow-wrap:break-word;max-width:100%;padding:6px 0;color:${COLORS.muted};">Fecha</td><td style="word-wrap:break-word;overflow-wrap:break-word;max-width:100%;padding:6px 0;font-weight:600;">${escapeHtml(data.date)}</td></tr>
        <tr><td style="word-wrap:break-word;overflow-wrap:break-word;max-width:100%;padding:6px 0;color:${COLORS.muted};">Hora</td><td style="word-wrap:break-word;overflow-wrap:break-word;max-width:100%;padding:6px 0;font-weight:600;">${escapeHtml(data.time)}</td></tr>
        <tr><td style="word-wrap:break-word;overflow-wrap:break-word;max-width:100%;padding:6px 0;color:${COLORS.muted};">Modalidad</td><td style="word-wrap:break-word;overflow-wrap:break-word;max-width:100%;padding:6px 0;font-weight:600;">${data.modality === 'presential' ? 'Presencial' : 'Online'}</td></tr>
        <tr><td style="word-wrap:break-word;overflow-wrap:break-word;max-width:100%;padding:6px 0;color:${COLORS.muted};">Valor</td><td style="word-wrap:break-word;overflow-wrap:break-word;max-width:100%;padding:6px 0;font-weight:600;">${formatCLP(data.price)}</td></tr>
      </table>
    </div>

    ${renderLocation(data)}
    ${data.transferData ? renderTransferData(data.transferData, data.price) : ''}
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

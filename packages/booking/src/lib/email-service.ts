import { EmailService } from '@schedly/notifications'

let emailService: EmailService | undefined

/** Instancia el EmailService de forma perezosa para no fallar al cargar el módulo si RESEND_API_KEY no está configurada. */
export function getEmailService(): EmailService {
  emailService ??= new EmailService()
  return emailService
}

import { EmailService } from '@schedly/notifications'
import { recordAuditEvent } from './audit.js'

let emailService: EmailService | undefined

/**
 * Instancia el EmailService de forma perezosa para no fallar al cargar el módulo si RESEND_API_KEY no está configurada.
 * Cada envío (métodos send*) queda en el historial como email_sent o email_failed (US-089).
 */
export function getEmailService(): EmailService {
  emailService ??= withEmailAudit(new EmailService())
  return emailService
}

function withEmailAudit(service: EmailService): EmailService {
  return new Proxy(service, {
    get(target, prop, receiver) {
      const value: unknown = Reflect.get(target, prop, receiver)
      if (typeof prop !== 'string' || !prop.startsWith('send') || typeof value !== 'function') return value
      return async (to: string, ...rest: unknown[]) => {
        try {
          const result: unknown = await value.call(target, to, ...rest)
          await recordAuditEvent({ action: 'email_sent', entity: 'Email', changes: { template: prop, to } })
          return result
        } catch (err) {
          await recordAuditEvent({
            action: 'email_failed',
            entity: 'Email',
            changes: { template: prop, to, error: err instanceof Error ? err.message.slice(0, 300) : String(err) },
          })
          throw err
        }
      }
    },
  })
}

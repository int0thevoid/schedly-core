import { AsyncLocalStorage } from 'node:async_hooks'

export type AuditActorType = 'admin' | 'patient' | 'system' | 'anonymous'

/** Quién origina los cambios de la petición o tarea en curso. Mutable: requireAuth lo completa. */
export interface AuditContext {
  actorType: AuditActorType
  actorId?: string
  professionalId?: string
  source?: string
  ip?: string
  userAgent?: string
}

const storage = new AsyncLocalStorage<AuditContext>()

export function runWithAuditContext<T>(context: AuditContext, fn: () => T): T {
  return storage.run(context, fn)
}

export function getAuditContext(): AuditContext | undefined {
  return storage.getStore()
}

/** Marca la petición en curso como hecha por la administradora (lo llama requireAuth). */
export function setAuditAdmin(professionalId: string): void {
  const context = storage.getStore()
  if (!context) return
  context.actorType = 'admin'
  context.actorId = professionalId
  context.professionalId = professionalId
}

// Segmentos largos de la URL (tokens de enlaces de correo) no deben quedar en el historial.
const TOKEN_SEGMENT = /\/[A-Za-z0-9_-]{20,}(?=\/|$)/g

/** Ruta de la petición sin query string y con los tokens reemplazados por ":token". */
export function sanitizeSource(method: string, url: string): string {
  const path = url.split('?')[0].replace(TOKEN_SEGMENT, '/:token')
  return `${method} ${path}`
}

/** Tipo de actor según la ruta, antes de autenticar: el sitio público lo usan pacientes. */
export function actorTypeForPath(path: string): AuditActorType {
  if (path.startsWith('/api/appointments') || path.startsWith('/api/clients')) return 'patient'
  return 'anonymous'
}

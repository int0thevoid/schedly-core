import type { PrismaClient } from '../generated/prisma/index.js'
import { getAuditContext, type AuditContext } from './audit-context.js'

/**
 * Historial de cambios (auditoría, US-089).
 *
 * `withAudit` envuelve el cliente Prisma: cada create/update/upsert/delete de cualquier modelo queda
 * registrado en AuditLog con el actor de la petición en curso (ver audit-context.ts), la acción, el
 * registro afectado y el antes/después de los campos cambiados. `recordAuditEvent` registra eventos
 * que no son cambios de datos (login, correos, reagendamientos).
 *
 * Nunca se guardan contraseñas, hashes ni tokens, y los textos largos (fotos, documentos) se resumen.
 * Un error al escribir el historial nunca hace fallar la operación original. La entrada se escribe
 * fuera de la transacción: si una transacción se revierte después de un cambio (raro: reintentos por
 * conflicto de serialización), la entrada queda igual.
 */

const RETENTION_DAYS = 730

const SINGLE_OPS = new Set(['create', 'update', 'upsert', 'delete'])
const BULK_OPS = new Set(['createMany', 'createManyAndReturn', 'updateMany', 'updateManyAndReturn', 'deleteMany'])

// Campos que cambian solos y no aportan a una investigación.
const IGNORED_FIELDS = new Set(['createdAt', 'updatedAt', 'lastDailyDigestSentDate'])
const SENSITIVE_FIELD = /password|hash|token|secret/i
const MAX_TEXT_LENGTH = 300

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }
type Row = Record<string, unknown>

interface FindDelegate {
  findUnique(args: { where: unknown }): Promise<Row | null>
}

export interface AuditEntry {
  action: string
  entity: string
  entityId?: string | null
  professionalId?: string | null
  changes?: JsonValue
}

function toJsonValue(key: string, value: unknown): JsonValue {
  if (value === undefined || value === null) return null
  if (SENSITIVE_FIELD.test(key)) return '[redactado]'
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'string') {
    return value.length > MAX_TEXT_LENGTH ? `[texto de ${value.length} caracteres]` : value
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (Array.isArray(value)) return value.map((v) => toJsonValue(key, v))
  if (typeof value === 'object') return '[objeto]'
  return String(value)
}

/** Snapshot de un registro, sin campos sensibles ni relaciones. */
export function snapshot(row: Row | null | undefined): Record<string, JsonValue> | null {
  if (!row) return null
  const out: Record<string, JsonValue> = {}
  for (const [key, value] of Object.entries(row)) {
    if (IGNORED_FIELDS.has(key)) continue
    if (value !== null && typeof value === 'object' && !(value instanceof Date) && !Array.isArray(value)) continue
    out[key] = toJsonValue(key, value)
  }
  return out
}

/** Campos que cambiaron entre dos versiones de un registro: { campo: { from, to } }. */
export function diff(before: Row | null, after: Row | null): Record<string, { from: JsonValue; to: JsonValue }> {
  const a = snapshot(before) ?? {}
  const b = snapshot(after) ?? {}
  const changes: Record<string, { from: JsonValue; to: JsonValue }> = {}
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const from = a[key] ?? null
    const to = b[key] ?? null
    if (JSON.stringify(from) !== JSON.stringify(to)) changes[key] = { from, to }
  }
  return changes
}

function lowerFirst(model: string): string {
  return model.charAt(0).toLowerCase() + model.slice(1)
}

function professionalIdOf(model: string, row: Row | null, context: AuditContext | undefined): string | null {
  if (row && typeof row.professionalId === 'string') return row.professionalId
  if (model === 'Professional' && row && typeof row.id === 'string') return row.id
  return context?.professionalId ?? null
}

/** Escribe una entrada con el actor de la petición o tarea en curso. Nunca lanza. */
export async function writeAudit(base: PrismaClient, entry: AuditEntry): Promise<void> {
  const context = getAuditContext()
  try {
    await base.auditLog.create({
      data: {
        actorType: context?.actorType ?? 'system',
        actorId: context?.actorId ?? null,
        professionalId: entry.professionalId ?? context?.professionalId ?? null,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId ?? null,
        changes: entry.changes ?? undefined,
        source: context?.source ?? null,
        ip: context?.ip ?? null,
        userAgent: context?.userAgent ?? null,
      },
    })
  } catch (err) {
    console.error(`[audit] no se pudo registrar ${entry.action} ${entry.entity} ${entry.entityId ?? ''}`, err)
  }
}

/** Cliente Prisma que registra en AuditLog cada cambio de datos. */
export function withAudit(base: PrismaClient) {
  const delegates = base as unknown as Record<string, FindDelegate>

  return base.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const isSingle = SINGLE_OPS.has(operation)
          if (model === 'AuditLog' || (!isSingle && !BULK_OPS.has(operation))) return query(args)

          if (!isSingle) {
            const result = await query(args)
            const count = typeof (result as { count?: unknown }).count === 'number'
              ? (result as { count: number }).count
              : Array.isArray(result) ? result.length : null
            await writeAudit(base, { action: operation, entity: model, changes: { count } })
            return result
          }

          const where = (args as { where?: unknown }).where
          const before = where && operation !== 'create'
            ? await delegates[lowerFirst(model)].findUnique({ where }).catch(() => null)
            : null
          const result = await query(args)
          const after = operation === 'delete' ? null : (result as Row)
          const context = getAuditContext()
          const row = after ?? before
          const action = operation === 'upsert' ? (before ? 'update' : 'create') : operation

          const changes: JsonValue =
            action === 'update' ? diff(before, after) : snapshot(action === 'delete' ? before : after)
          if (action === 'update' && Object.keys(changes as object).length === 0) return result

          await writeAudit(base, {
            action,
            entity: model,
            entityId: row && typeof row.id === 'string' ? row.id : null,
            professionalId: professionalIdOf(model, row, context),
            changes,
          })
          return result
        },
      },
    },
  })
}

// Cliente sin auditoría para escribir eventos; lo registra lib/prisma.ts al arrancar. Sin registrar
// (ej. tests que reemplazan lib/prisma.js) los eventos no se escriben.
let eventClient: PrismaClient | undefined

export function registerAuditClient(base: PrismaClient): void {
  eventClient = base
}

/** Registra un evento que no es un cambio de datos (login, correo, reagendamiento). Nunca lanza. */
export async function recordAuditEvent(entry: AuditEntry): Promise<void> {
  if (eventClient) await writeAudit(eventClient, entry)
}

/** Borra las entradas con más de 2 años (plazo de conservación acordado). */
export async function purgeOldAuditLogs(base: PrismaClient, now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000)
  const { count } = await base.auditLog.deleteMany({ where: { createdAt: { lt: cutoff } } })
  return count
}

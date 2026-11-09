import { prisma } from './prisma.js'

/** US-092: la paciente puede modificar/anular por enlace hasta N horas antes de la cita
 * (configurable en el panel → Configuración; Stefany definió 4). */
export const DEFAULT_MODIFY_DEADLINE_HOURS = 4

export function calculateTokenExpiry(startDateTime: Date, modifyDeadlineHours: number): Date {
  return new Date(startDateTime.getTime() - modifyDeadlineHours * 60 * 60 * 1000)
}

/** Al cambiar el plazo en Configuración, las citas futuras con enlace pasan a usar el nuevo plazo. */
export async function recomputeFutureTokenExpiry(professionalId: string, modifyDeadlineHours: number): Promise<number> {
  return prisma.$executeRaw`
    UPDATE "Appointment"
    SET "tokenExpiresAt" = "startDateTime" - make_interval(hours => ${modifyDeadlineHours}::int)
    WHERE "professionalId" = ${professionalId}
      AND "appointmentToken" IS NOT NULL
      AND "status" <> 'cancelled'
      AND "startDateTime" > now()`
}

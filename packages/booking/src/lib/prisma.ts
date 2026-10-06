import { PrismaClient } from '../generated/prisma/index.js'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { purgeOldAuditLogs, registerAuditClient, withAudit } from './audit.js'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)

// Cliente sin auditoría: solo para escribir/leer el historial y para lecturas internas de lib/audit.ts.
const basePrisma = new PrismaClient({ adapter })

// Cliente que usa toda la app: cada cambio de datos queda en AuditLog (US-089).
export const prisma = withAudit(basePrisma)
registerAuditClient(basePrisma)

export function purgeExpiredAuditLogs(): Promise<number> {
  return purgeOldAuditLogs(basePrisma)
}

/** Cliente de una transacción interactiva (prisma.$transaction(async (tx) => ...)), con auditoría. */
export type TransactionClient = Omit<typeof prisma, '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'>

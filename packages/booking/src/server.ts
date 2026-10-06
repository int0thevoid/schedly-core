import app from './app.js'
import { runNotificationsJob } from './jobs/notifications.job.js'
import { runWithAuditContext } from './lib/audit-context.js'
import { purgeExpiredAuditLogs } from './lib/prisma.js'

const port = Number(process.env.PORT ?? 3001)
const NOTIFICATIONS_JOB_INTERVAL_MS = 15 * 60 * 1000
const AUDIT_RETENTION_JOB_INTERVAL_MS = 24 * 60 * 60 * 1000

app.listen(port, () => {
  console.log(`@schedly/booking listening on http://localhost:${port}`)
})

// Las tareas automáticas quedan en el historial como actor "system" (US-089).
function runNotifications(): void {
  runWithAuditContext({ actorType: 'system', source: 'job:notifications' }, runNotificationsJob)
    .catch((err) => console.error('[notifications] job failed', err))
}

function runAuditRetention(): void {
  purgeExpiredAuditLogs()
    .then((count) => count > 0 && console.log(`[audit] ${count} entradas con más de 2 años eliminadas`))
    .catch((err) => console.error('[audit] retention job failed', err))
}

runNotifications()
setInterval(runNotifications, NOTIFICATIONS_JOB_INTERVAL_MS)

runAuditRetention()
setInterval(runAuditRetention, AUDIT_RETENTION_JOB_INTERVAL_MS)

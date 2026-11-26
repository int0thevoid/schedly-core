import app from './app.js'
import { runNotificationsJob } from './jobs/notifications.job.js'
import { runWithAuditContext } from './lib/audit-context.js'
import { purgeExpiredAuditLogs } from './lib/prisma.js'
import { purgeExpiredSensitiveData } from './lib/event-registrations.js'
import { optimizeStoredProductImages } from './lib/product-images.js'

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

// Conservación de datos de salud de eventos (US-123): se borran según el plazo de cada evento.
function runEventDataRetention(): void {
  runWithAuditContext({ actorType: 'system', source: 'job:event-data-retention' }, purgeExpiredSensitiveData)
    .then((count) => count > 0 && console.log(`[events] datos de salud borrados en ${count} inscripciones`))
    .catch((err) => console.error('[events] retention job failed', err))
}

runNotifications()
setInterval(runNotifications, NOTIFICATIONS_JOB_INTERVAL_MS)

runAuditRetention()
setInterval(runAuditRetention, AUDIT_RETENTION_JOB_INTERVAL_MS)

runEventDataRetention()
setInterval(runEventDataRetention, AUDIT_RETENTION_JOB_INTERVAL_MS)

// Fotos de la vitrina subidas antes de US-124: se optimizan una vez al arrancar.
runWithAuditContext({ actorType: 'system', source: 'job:optimize-product-images' }, optimizeStoredProductImages)
  .then((count) => count > 0 && console.log(`[product-images] ${count} fotos de la vitrina optimizadas`))
  .catch((err) => console.error('[product-images] optimization job failed', err))

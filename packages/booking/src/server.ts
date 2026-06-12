import app from './app.js'
import { runNotificationsJob } from './jobs/notifications.job.js'

const port = Number(process.env.PORT ?? 3001)
const NOTIFICATIONS_JOB_INTERVAL_MS = 15 * 60 * 1000

app.listen(port, () => {
  console.log(`@schedly/booking listening on http://localhost:${port}`)
})

runNotificationsJob().catch((err) => console.error('[notifications] job failed', err))
setInterval(() => {
  runNotificationsJob().catch((err) => console.error('[notifications] job failed', err))
}, NOTIFICATIONS_JOB_INTERVAL_MS)

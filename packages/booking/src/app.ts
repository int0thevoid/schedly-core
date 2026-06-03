import express from 'express'
import { requireAuth } from './middleware/auth.js'
import servicesRouter from './routes/services.js'
import availabilityRouter from './routes/availability.js'
import appointmentsRouter from './routes/appointments.js'
import adminAppointmentsRouter from './routes/admin/appointments.js'
import adminScheduleRouter from './routes/admin/schedule.js'
import adminConfigRouter from './routes/admin/config.js'
import { fail } from './lib/response.js'
import type { NextFunction, Request, Response } from 'express'

const app = express()
app.use(express.json())

app.use('/api/services', servicesRouter)
app.use('/api/availability', availabilityRouter)
app.use('/api/appointments', appointmentsRouter)

app.use('/api/admin', requireAuth)
app.use('/api/admin/appointments', adminAppointmentsRouter)
app.use('/api/admin/schedule', adminScheduleRouter)
app.use('/api/admin/config', adminConfigRouter)

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err)
  fail(res, 'Internal server error', 500)
})

export default app

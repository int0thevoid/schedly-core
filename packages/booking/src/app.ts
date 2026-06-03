import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import type { NextFunction, Request, Response } from 'express'
import { requireAuth } from './middleware/auth.js'
import servicesRouter from './routes/services.js'
import availabilityRouter from './routes/availability.js'
import appointmentsRouter from './routes/appointments.js'
import adminAppointmentsRouter from './routes/admin/appointments.js'
import adminScheduleRouter from './routes/admin/schedule.js'
import adminConfigRouter from './routes/admin/config.js'
import { fail } from './lib/response.js'

const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://192.168.1.75:5173',
  'https://stefanyoa-test.int0thesrv.cl',
]

const app = express()

app.use(helmet())
app.use(cors({ origin: ALLOWED_ORIGINS, credentials: true }))
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

import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'
import rateLimit from 'express-rate-limit'
import type { NextFunction, Request, Response } from 'express'
import { requireAuth } from './middleware/auth.js'
import authRouter from './routes/auth.routes.js'
import servicesRouter from './routes/services.js'
import availabilityRouter from './routes/availability.js'
import appointmentsRouter from './routes/appointments.js'
import adminAppointmentsRouter from './routes/admin/appointments.js'
import adminScheduleRouter from './routes/admin/schedule.js'
import adminServicesRouter from './routes/admin/services.js'
import adminWeeklyScheduleRouter from './routes/admin/weeklySchedule.js'
import adminConfigRouter from './routes/admin/config.js'
import adminTransferRouter from './routes/admin/transfer.js'
import adminProfessionalRouter from './routes/admin/professional.js'
import adminClientsRouter from './routes/admin/clients.js'
import clientsRouter from './routes/clients.js'
import { getTransferConfig } from './controllers/admin/transfer.controller.js'
import { getPublicConfig } from './controllers/admin/config.controller.js'
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
app.use(cookieParser())

// Defensa en profundidad contra fuerza bruta/abuso — no había ningún límite
// de tasa en ningún endpoint, incluyendo el login admin.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
})
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many login attempts, please try again later' },
})
app.use('/api', apiLimiter)
app.use('/api/auth/login', loginLimiter)

app.use('/api/auth', authRouter)
app.use('/api/services', servicesRouter)
app.use('/api/availability', availabilityRouter)
app.use('/api/appointments', appointmentsRouter)
app.use('/api/clients', clientsRouter)

// Public: booking wizard needs these without auth
app.get('/api/config', getPublicConfig)
app.get('/api/admin/transfer-config', getTransferConfig)

app.use('/api/admin', requireAuth)
app.use('/api/admin/appointments', adminAppointmentsRouter)
app.use('/api/admin/schedule/weekly', adminWeeklyScheduleRouter)
app.use('/api/admin/schedule', adminScheduleRouter)
app.use('/api/admin/services', adminServicesRouter)
app.use('/api/admin/config', adminConfigRouter)
app.use('/api/admin/transfer-config', adminTransferRouter)
app.use('/api/admin/professional', adminProfessionalRouter)
app.use('/api/admin/clients', adminClientsRouter)

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err)
  fail(res, 'Internal server error', 500)
})

export default app

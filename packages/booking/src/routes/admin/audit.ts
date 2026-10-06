import { Router } from 'express'
import { getAppointmentHistory, getClientHistory } from '../../controllers/admin/audit.controller.js'

const router = Router()
router.get('/appointments/:id', getAppointmentHistory)
router.get('/clients/:id', getClientHistory)
export default router

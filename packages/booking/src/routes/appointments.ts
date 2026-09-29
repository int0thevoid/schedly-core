import { Router } from 'express'
import {
  cancelByToken,
  confirmAttendance,
  createAppointment,
  getAppointmentByToken,
  rescheduleByToken,
} from '../controllers/appointments.controller.js'

const router = Router()
router.post('/', createAppointment)
router.get('/token/:token', getAppointmentByToken)
router.patch('/token/:token/cancel', cancelByToken)
router.patch('/token/:token/reschedule', rescheduleByToken)
router.get('/token/:token/confirm-attendance', confirmAttendance)
export default router

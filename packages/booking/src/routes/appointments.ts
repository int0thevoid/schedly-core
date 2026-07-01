import { Router } from 'express'
import {
  cancelAppointment,
  cancelByToken,
  confirmAttendance,
  createAppointment,
  getAppointment,
  getAppointmentByToken,
  rescheduleByToken,
} from '../controllers/appointments.controller.js'

const router = Router()
router.post('/', createAppointment)
router.get('/token/:token', getAppointmentByToken)
router.patch('/token/:token/cancel', cancelByToken)
router.patch('/token/:token/reschedule', rescheduleByToken)
router.get('/:id/confirm-attendance', confirmAttendance)
router.get('/:id', getAppointment)
router.patch('/:id/cancel', cancelAppointment)
export default router

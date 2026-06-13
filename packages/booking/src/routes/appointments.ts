import { Router } from 'express'
import {
  cancelAppointment,
  confirmAttendance,
  createAppointment,
  getAppointment,
} from '../controllers/appointments.controller.js'

const router = Router()
router.post('/', createAppointment)
router.get('/:id/confirm-attendance', confirmAttendance)
router.get('/:id', getAppointment)
router.patch('/:id/cancel', cancelAppointment)
export default router

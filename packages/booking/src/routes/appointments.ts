import { Router } from 'express'
import {
  cancelAppointment,
  createAppointment,
  getAppointment,
} from '../controllers/appointments.controller.js'

const router = Router()
router.post('/', createAppointment)
router.get('/:id', getAppointment)
router.patch('/:id/cancel', cancelAppointment)
export default router

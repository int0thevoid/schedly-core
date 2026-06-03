import { Router } from 'express'
import {
  listAdminAppointments,
  updateAppointmentPayment,
  updateAppointmentStatus,
} from '../../controllers/admin/appointments.controller.js'

const router = Router()
router.get('/', listAdminAppointments)
router.patch('/:id/status', updateAppointmentStatus)
router.patch('/:id/payment', updateAppointmentPayment)
export default router

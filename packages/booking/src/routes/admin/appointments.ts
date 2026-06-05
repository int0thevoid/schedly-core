import { Router } from 'express'
import {
  listAdminAppointments,
  listWeeklyAppointments,
  updateAppointmentPayment,
  updateAppointmentStatus,
} from '../../controllers/admin/appointments.controller.js'

const router = Router()
router.get('/weekly', listWeeklyAppointments)
router.get('/', listAdminAppointments)
router.patch('/:id/status', updateAppointmentStatus)
router.patch('/:id/payment', updateAppointmentPayment)
export default router

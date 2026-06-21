import { Router } from 'express'
import {
  listAdminAppointments,
  listMonthlyAppointments,
  listWeeklyAppointments,
  notifyAppointmentConfirmation,
  notifyPaymentPending,
  updateAppointmentAttendance,
  updateAppointmentOutcome,
  updateAppointmentPayment,
  updateAppointmentStatus,
} from '../../controllers/admin/appointments.controller.js'

const router = Router()
router.get('/weekly', listWeeklyAppointments)
router.get('/monthly', listMonthlyAppointments)
router.get('/', listAdminAppointments)
router.patch('/:id/status', updateAppointmentStatus)
router.patch('/:id/payment', updateAppointmentPayment)
router.patch('/:id/attendance', updateAppointmentAttendance)
router.patch('/:id/outcome', updateAppointmentOutcome)
router.patch('/:id/notify-confirmation', notifyAppointmentConfirmation)
router.post('/:id/notify-payment', notifyPaymentPending)
export default router

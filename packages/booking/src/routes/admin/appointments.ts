import { Router } from 'express'
import {
  ensureAppointmentMeetLink,
  listAdminAppointments,
  listCancelledAppointments,
  listMonthlyAppointments,
  listWeeklyAppointments,
  notifyAppointmentConfirmation,
  rescheduleAdminAppointment,
  updateAppointmentAttendance,
  updateAppointmentOutcome,
  updateAppointmentPayment,
  updateAppointmentStatus,
} from '../../controllers/admin/appointments.controller.js'
import { getAppointmentReviewLink } from '../../controllers/admin/reviews.controller.js'

const router = Router()
router.get('/weekly', listWeeklyAppointments)
router.get('/monthly', listMonthlyAppointments)
router.get('/cancelled', listCancelledAppointments)
router.get('/', listAdminAppointments)
router.patch('/:id/status', updateAppointmentStatus)
router.post('/:id/reschedule', rescheduleAdminAppointment)
router.patch('/:id/payment', updateAppointmentPayment)
router.patch('/:id/attendance', updateAppointmentAttendance)
router.patch('/:id/outcome', updateAppointmentOutcome)
router.patch('/:id/notify-confirmation', notifyAppointmentConfirmation)
router.post('/:id/meet', ensureAppointmentMeetLink)
router.post('/:id/review-link', getAppointmentReviewLink)
export default router

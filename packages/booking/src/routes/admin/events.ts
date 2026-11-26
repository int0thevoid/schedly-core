import { Router } from 'express'
import {
  addEventPayment,
  deleteEventPayment,
  deleteEventRegistration,
  exportEventRegistrations,
  listEventRegistrations,
  updateEventRegistration,
} from '../../controllers/admin/events.controller.js'

/** Montado en /api/admin: inscritos de los eventos de la vitrina (US-123). */
const router = Router()
router.get('/products/:id/registrations', listEventRegistrations)
router.get('/products/:id/registrations/export', exportEventRegistrations)
router.patch('/event-registrations/:registrationId', updateEventRegistration)
router.delete('/event-registrations/:registrationId', deleteEventRegistration)
router.post('/event-registrations/:registrationId/payments', addEventPayment)
router.delete('/event-registrations/:registrationId/payments/:paymentId', deleteEventPayment)
export default router

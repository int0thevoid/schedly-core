import { Router } from 'express'
import { getEventRegistrationReceipt } from '../controllers/events.controller.js'

const router = Router()
router.get('/:token', getEventRegistrationReceipt)
export default router

import { Router } from 'express'
import { getDayAvailability, getRangeAvailability } from '../controllers/availability.controller.js'

const router = Router()
router.get('/', getDayAvailability)
router.get('/range', getRangeAvailability)
export default router

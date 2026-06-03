import { Router } from 'express'
import { listServices } from '../controllers/services.controller.js'

const router = Router()
router.get('/', listServices)
export default router

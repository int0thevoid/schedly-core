import { Router } from 'express'
import { listPublicServiceCategories } from '../controllers/service-categories.controller.js'

const router = Router()
router.get('/', listPublicServiceCategories)
export default router

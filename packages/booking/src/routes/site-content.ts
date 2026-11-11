import { Router } from 'express'
import { getPublicSiteContent } from '../controllers/site-content.controller.js'

const router = Router()
router.get('/', getPublicSiteContent)
export default router

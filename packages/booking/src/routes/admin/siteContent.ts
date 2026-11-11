import { Router } from 'express'
import { getAdminSiteContent, putSiteContent } from '../../controllers/site-content.controller.js'

const router = Router()
router.get('/', getAdminSiteContent)
router.put('/:key', putSiteContent)
export default router

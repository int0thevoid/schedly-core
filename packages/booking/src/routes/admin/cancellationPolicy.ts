import { Router } from 'express'
import { getCancellationPolicy, updateCancellationPolicy } from '../../controllers/admin/consent-document.controller.js'

const router = Router()
router.get('/', getCancellationPolicy)
router.patch('/', updateCancellationPolicy)
export default router

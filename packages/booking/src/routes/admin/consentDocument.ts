import { Router } from 'express'
import { getConsentDocument, updateConsentDocument } from '../../controllers/admin/consent-document.controller.js'

const router = Router()
router.get('/', getConsentDocument)
router.patch('/', updateConsentDocument)
export default router

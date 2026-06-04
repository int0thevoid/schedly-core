import { Router } from 'express'
import { getTransferConfig, updateTransferConfig } from '../../controllers/admin/transfer.controller.js'

const router = Router()
router.get('/',  getTransferConfig)
router.patch('/', updateTransferConfig)
export default router

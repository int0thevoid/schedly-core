import { Router } from 'express'
import { getConfig, updateConfig } from '../../controllers/admin/config.controller.js'

const router = Router()
router.get('/', getConfig)
router.patch('/', updateConfig)
export default router

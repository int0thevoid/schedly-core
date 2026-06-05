import { Router } from 'express'
import { updateProfessional, changePassword } from '../../controllers/admin/professional.controller.js'

const router = Router()
router.patch('/', updateProfessional)
router.post('/change-password', changePassword)
export default router

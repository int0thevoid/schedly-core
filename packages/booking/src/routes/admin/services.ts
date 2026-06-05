import { Router } from 'express'
import {
  listAdminServices,
  createService,
  updateService,
  toggleService,
} from '../../controllers/admin/services.controller.js'

const router = Router()
router.get('/', listAdminServices)
router.post('/', createService)
router.patch('/:id', updateService)
router.patch('/:id/toggle', toggleService)
export default router

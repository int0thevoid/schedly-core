import { Router } from 'express'
import {
  listAdminServiceCategories,
  createServiceCategory,
  updateServiceCategory,
  deleteServiceCategory,
} from '../../controllers/admin/service-categories.controller.js'

const router = Router()
router.get('/', listAdminServiceCategories)
router.post('/', createServiceCategory)
router.patch('/:id', updateServiceCategory)
router.delete('/:id', deleteServiceCategory)
export default router

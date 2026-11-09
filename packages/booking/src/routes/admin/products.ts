import { Router } from 'express'
import {
  createProduct,
  deleteProduct,
  listAdminProducts,
  reorderProducts,
  updateProduct,
} from '../../controllers/admin/products.controller.js'

const router = Router()
router.get('/', listAdminProducts)
router.post('/', createProduct)
router.put('/order', reorderProducts)
router.patch('/:id', updateProduct)
router.delete('/:id', deleteProduct)
export default router

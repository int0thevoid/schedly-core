import { Router } from 'express'
import { getProductImage, getPublicProduct, listPublicProducts } from '../controllers/products.controller.js'

const router = Router()
router.get('/', listPublicProducts)
router.get('/:id/image', getProductImage)
router.get('/:slug', getPublicProduct)
export default router

import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { getProductImage, getPublicProduct, listPublicProducts } from '../controllers/products.controller.js'
import { createEventRegistration } from '../controllers/events.controller.js'

// Inscripciones a eventos: pocas por persona; frena bots y envíos repetidos.
const registrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Demasiados intentos. Intenta nuevamente en un rato.' },
})

const router = Router()
router.get('/', listPublicProducts)
router.get('/:id/image', getProductImage)
router.get('/:slug', getPublicProduct)
router.post('/:slug/registrations', registrationLimiter, createEventRegistration)
export default router

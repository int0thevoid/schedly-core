import { Router } from 'express'
import { getReviewInvitation, listPublicReviews, submitReview } from '../controllers/reviews.controller.js'

const router = Router()
router.get('/', listPublicReviews)
router.get('/token/:token', getReviewInvitation)
router.post('/token/:token', submitReview)
export default router

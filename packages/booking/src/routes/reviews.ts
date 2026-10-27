import { Router } from 'express'
import { getReviewInvitation, listPublicReviews, submitReview, unsubscribeFromSurveys } from '../controllers/reviews.controller.js'

const router = Router()
router.get('/', listPublicReviews)
router.get('/token/:token', getReviewInvitation)
router.post('/token/:token', submitReview)
router.post('/unsubscribe/:token', unsubscribeFromSurveys)
export default router

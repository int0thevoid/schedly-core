import { Router } from 'express'
import { importAgifyReviews, listAdminReviews, updateReviewReply, updateReviewStatus } from '../../controllers/admin/reviews.controller.js'

const router = Router()
router.get('/', listAdminReviews)
router.post('/import/agify', importAgifyReviews)
router.patch('/:id/status', updateReviewStatus)
router.patch('/:id/reply', updateReviewReply)
export default router

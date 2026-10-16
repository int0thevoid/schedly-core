import { Router } from 'express'
import { getFinanceSummary, getFinanceTrend } from '../../controllers/admin/finance.controller.js'

const router = Router()
router.get('/summary', getFinanceSummary)
router.get('/trend', getFinanceTrend)
export default router

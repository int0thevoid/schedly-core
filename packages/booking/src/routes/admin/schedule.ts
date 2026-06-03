import { Router } from 'express'
import { createBlock, deleteBlock, listBlocks } from '../../controllers/admin/schedule.controller.js'

const router = Router()
router.get('/blocks', listBlocks)
router.post('/blocks', createBlock)
router.delete('/blocks/:id', deleteBlock)
export default router

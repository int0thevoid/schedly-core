import { Router } from 'express'
import { getClient, getClientStats, listClients, updateClient } from '../../controllers/admin/clients.controller.js'

const router = Router()
router.get('/', listClients)
router.get('/:id/stats', getClientStats)
router.get('/:id', getClient)
router.patch('/:id', updateClient)
export default router

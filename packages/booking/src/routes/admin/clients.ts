import { Router } from 'express'
import { getClient, listClients, updateClient } from '../../controllers/admin/clients.controller.js'

const router = Router()
router.get('/', listClients)
router.get('/:id', getClient)
router.patch('/:id', updateClient)
export default router

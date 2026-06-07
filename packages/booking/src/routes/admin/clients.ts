import { Router } from 'express'
import { getClient, listClients } from '../../controllers/admin/clients.controller.js'

const router = Router()
router.get('/', listClients)
router.get('/:id', getClient)
export default router

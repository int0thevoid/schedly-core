import { Router } from 'express'
import { listClients } from '../../controllers/admin/clients.controller.js'

const router = Router()
router.get('/', listClients)
export default router

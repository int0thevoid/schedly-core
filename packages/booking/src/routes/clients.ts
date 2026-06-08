import { Router } from 'express'
import { lookupClient } from '../controllers/clients.controller.js'

const router = Router()
router.get('/lookup', lookupClient)
export default router

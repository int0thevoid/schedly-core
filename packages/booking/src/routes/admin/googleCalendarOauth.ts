import { Router } from 'express'
import { startGoogleCalendarOAuth, googleCalendarOAuthCallback } from '../../controllers/admin/google-calendar-oauth.controller.js'

const router = Router()
router.get('/oauth-start', startGoogleCalendarOAuth)
router.get('/oauth-callback', googleCalendarOAuthCallback)
export default router

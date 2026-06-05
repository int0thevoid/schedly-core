import { Router } from 'express'
import {
  listWeeklySchedules,
  createWeeklySchedule,
  updateWeeklySchedule,
  deleteWeeklySchedule,
} from '../../controllers/admin/weeklySchedule.controller.js'

const router = Router()
router.get('/', listWeeklySchedules)
router.post('/', createWeeklySchedule)
router.patch('/:id', updateWeeklySchedule)
router.delete('/:id', deleteWeeklySchedule)
export default router

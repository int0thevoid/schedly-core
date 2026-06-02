// Types
export type { Service, WeeklySchedule, ScheduleBlock, Appointment, TimeSlot } from './types'

// Availability logic
export {
  generateDaySlots,
  filterBlockedSlots,
  filterOccupiedSlots,
  getAvailableSlots,
  doesBlockApplyToDate,
} from './availability'

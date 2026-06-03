// Types
export type { Service, WeeklySchedule, ScheduleBlock, Appointment, TimeSlot, ProfessionalConfig } from './types'
export { DEFAULT_PROFESSIONAL_CONFIG } from './types'

// Availability logic
export {
  generateDaySlots,
  filterBlockedSlots,
  filterOccupiedSlots,
  getAvailableSlots,
  doesBlockApplyToDate,
  getMinBookingDateTime,
  getMaxBookingDateTime,
} from './availability'

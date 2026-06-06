export interface Service {
  id: string
  name: string
  description: string
  duration: number       // minutos
  price: number
  currency: 'CLP'
  modality: 'presential' | 'online' | 'both'
  isActive: boolean
  bufferMinutes?: number // sobreescribe ProfessionalConfig.defaultBufferMinutes si está definido
}

export interface WeeklySchedule {
  dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6  // 0 = domingo
  startTime: string    // "09:00" — hora local America/Santiago
  endTime: string      // "19:00" — hora local America/Santiago
  serviceIds?: string[] // undefined = todos los servicios
  isActive?: boolean   // undefined/true = activo, false = desactivado
}

export interface ScheduleBlock {
  id: string
  title: string
  startDateTime: Date
  endDateTime: Date
  recurrence?: {
    type: 'daily' | 'weekdays' | 'weekly' | 'monthly'
    endDate?: Date
  }
}

export interface Appointment {
  id: string
  serviceId: string
  clientName: string
  clientEmail: string
  clientPhone: string
  startDateTime: Date
  endDateTime: Date
  modality: 'presential' | 'online'
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed'
  paymentStatus: 'unpaid' | 'paid'
  paymentAmount?: number
  notes?: string
  createdAt: Date
}

export interface TimeSlot {
  startDateTime: Date
  endDateTime: Date
  isAvailable: boolean
}

export interface ProfessionalConfig {
  bookingWindowWeeks: number       // default: 4 — cuántas semanas hacia adelante se puede agendar
  minAdvanceBusinessDays: number   // default: 2 — anticipación mínima (valor, unidad según minAdvanceUnit)
  minAdvanceUnit?: 'hours' | 'business_days'  // default: 'business_days'
  defaultBufferMinutes: number     // default: 0 — buffer entre sesiones (global)
  timezone: string                 // default: 'America/Santiago'
}

export const DEFAULT_PROFESSIONAL_CONFIG: ProfessionalConfig = {
  bookingWindowWeeks: 4,
  minAdvanceBusinessDays: 2,
  defaultBufferMinutes: 0,
  timezone: 'America/Santiago',
}

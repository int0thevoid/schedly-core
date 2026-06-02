export interface Service {
  id: string
  name: string
  description: string
  duration: number       // minutos
  price: number
  currency: 'CLP'
  modality: 'presential' | 'online' | 'both'
  isActive: boolean
}

export interface WeeklySchedule {
  dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6  // 0 = domingo
  startTime: string    // "09:00" — hora local America/Santiago
  endTime: string      // "19:00" — hora local America/Santiago
  serviceIds?: string[] // undefined = todos los servicios
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

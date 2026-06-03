import type { Request, Response } from 'express'
import { z } from 'zod'
import type { Appointment, ScheduleBlock, Service, TimeSlot, WeeklySchedule } from '../types.js'
import { DEFAULT_PROFESSIONAL_CONFIG } from '../types.js'
import { getAvailableSlots } from '../availability.js'
import { prisma } from '../lib/prisma.js'
import { fail, ok } from '../lib/response.js'
import type {
  Appointment as DbAppointment,
  Professional,
  ScheduleBlock as DbScheduleBlock,
  Service as DbService,
  WeeklySchedule as DbWeeklySchedule,
} from '../generated/prisma/index.js'

const datePattern = /^\d{4}-\d{2}-\d{2}$/

const daySchema = z.object({
  serviceId: z.string().min(1),
  date: z.string().regex(datePattern, 'date must be YYYY-MM-DD'),
})

const rangeSchema = z.object({
  serviceId: z.string().min(1),
  startDate: z.string().regex(datePattern, 'startDate must be YYYY-MM-DD'),
  endDate: z.string().regex(datePattern, 'endDate must be YYYY-MM-DD'),
})

function toConfig(professional: Professional | null) {
  if (!professional) return DEFAULT_PROFESSIONAL_CONFIG
  return {
    bookingWindowWeeks: professional.bookingWindowWeeks,
    minAdvanceBusinessDays: professional.minAdvanceBusinessDays,
    defaultBufferMinutes: professional.defaultBufferMinutes,
    timezone: professional.timezone,
  }
}

function toService(s: DbService): Service {
  return {
    id: s.id,
    name: s.name,
    description: s.description,
    duration: s.duration,
    price: s.price,
    currency: 'CLP',
    modality: s.modality as Service['modality'],
    isActive: s.isActive,
    ...(s.bufferMinutes !== null ? { bufferMinutes: s.bufferMinutes } : {}),
  }
}

function toWeeklySchedule(s: DbWeeklySchedule): WeeklySchedule {
  return {
    dayOfWeek: s.dayOfWeek as WeeklySchedule['dayOfWeek'],
    startTime: s.startTime,
    endTime: s.endTime,
    serviceIds: s.serviceIds,
  }
}

function toBlock(b: DbScheduleBlock): ScheduleBlock {
  return {
    id: b.id,
    title: b.title,
    startDateTime: b.startDateTime,
    endDateTime: b.endDateTime,
    ...(b.recurrenceType
      ? {
          recurrence: {
            type: b.recurrenceType as ScheduleBlock['recurrence'] extends infer R
              ? R extends object
                ? R['type' & keyof R]
                : never
              : never,
            ...(b.recurrenceEnd ? { endDate: b.recurrenceEnd } : {}),
          },
        }
      : {}),
  }
}

function toAppointment(a: DbAppointment): Appointment {
  return {
    id: a.id,
    serviceId: a.serviceId,
    clientName: a.clientName,
    clientEmail: a.clientEmail,
    clientPhone: a.clientPhone,
    startDateTime: a.startDateTime,
    endDateTime: a.endDateTime,
    modality: a.modality as Appointment['modality'],
    status: a.status as Appointment['status'],
    paymentStatus: a.paymentStatus as Appointment['paymentStatus'],
    ...(a.paymentAmount !== null ? { paymentAmount: a.paymentAmount } : {}),
    ...(a.notes !== null ? { notes: a.notes } : {}),
    createdAt: a.createdAt,
  }
}

async function fetchContextForDate(
  professionalId: string,
  serviceId: string,
  dateStr: string,
): Promise<{
  service: DbService | null
  professional: Professional | null
  weeklySchedules: DbWeeklySchedule[]
  blocks: DbScheduleBlock[]
  appointments: DbAppointment[]
}> {
  const [service, professional, weeklySchedules, blocks, appointments] = await Promise.all([
    prisma.service.findUnique({ where: { id: serviceId } }),
    prisma.professional.findUnique({ where: { id: professionalId } }),
    prisma.weeklySchedule.findMany({ where: { professionalId } }),
    prisma.scheduleBlock.findMany({ where: { professionalId } }),
    prisma.appointment.findMany({
      where: {
        professionalId,
        status: { not: 'cancelled' },
        startDateTime: { gte: new Date(`${dateStr}T00:00:00.000Z`) },
        endDateTime: { lte: new Date(`${dateStr}T23:59:59.999Z`) },
      },
    }),
  ])
  return { service, professional, weeklySchedules, blocks, appointments }
}

function computeSlots(
  dateStr: string,
  service: DbService,
  professional: Professional | null,
  weeklySchedules: DbWeeklySchedule[],
  blocks: DbScheduleBlock[],
  appointments: DbAppointment[],
): TimeSlot[] {
  const date = new Date(`${dateStr}T12:00:00.000Z`)
  return getAvailableSlots(
    date,
    toService(service),
    toConfig(professional),
    weeklySchedules.map(toWeeklySchedule),
    blocks.map(toBlock),
    appointments.map(toAppointment),
  )
}

export async function getDayAvailability(req: Request, res: Response): Promise<void> {
  const parsed = daySchema.safeParse(req.query)
  if (!parsed.success) {
    fail(res, parsed.error.issues[0]?.message ?? 'Invalid params', 400)
    return
  }
  const { serviceId, date } = parsed.data
  const professionalId = process.env.PROFESSIONAL_ID ?? ''

  const { service, professional, weeklySchedules, blocks, appointments } =
    await fetchContextForDate(professionalId, serviceId, date)

  if (!service || service.professionalId !== professionalId) {
    fail(res, 'Service not found', 404)
    return
  }

  const slots = computeSlots(date, service, professional, weeklySchedules, blocks, appointments)
  ok(res, slots)
}

export async function getRangeAvailability(req: Request, res: Response): Promise<void> {
  const parsed = rangeSchema.safeParse(req.query)
  if (!parsed.success) {
    fail(res, parsed.error.issues[0]?.message ?? 'Invalid params', 400)
    return
  }
  const { serviceId, startDate, endDate } = parsed.data
  const professionalId = process.env.PROFESSIONAL_ID ?? ''

  const start = new Date(`${startDate}T12:00:00.000Z`)
  const end = new Date(`${endDate}T12:00:00.000Z`)
  const diffDays = Math.round((end.getTime() - start.getTime()) / 86_400_000)

  if (diffDays < 0 || diffDays > 7) {
    fail(res, 'Date range must be between 0 and 7 days', 400)
    return
  }

  const service = await prisma.service.findUnique({ where: { id: serviceId } })
  if (!service || service.professionalId !== professionalId) {
    fail(res, 'Service not found', 404)
    return
  }

  const [professional, weeklySchedules, blocks] = await Promise.all([
    prisma.professional.findUnique({ where: { id: professionalId } }),
    prisma.weeklySchedule.findMany({ where: { professionalId } }),
    prisma.scheduleBlock.findMany({ where: { professionalId } }),
  ])

  const result: Record<string, TimeSlot[]> = {}

  for (let i = 0; i <= diffDays; i++) {
    const d = new Date(start.getTime() + i * 86_400_000)
    const dateStr = d.toISOString().slice(0, 10)

    const appointments = await prisma.appointment.findMany({
      where: {
        professionalId,
        status: { not: 'cancelled' },
        startDateTime: { gte: new Date(`${dateStr}T00:00:00.000Z`) },
        endDateTime: { lte: new Date(`${dateStr}T23:59:59.999Z`) },
      },
    })

    result[dateStr] = computeSlots(dateStr, service, professional, weeklySchedules, blocks, appointments)
  }

  ok(res, result)
}

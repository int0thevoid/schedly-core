import type { Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma.js'
import { fail, ok } from '../../lib/response.js'
import { dayRangeInTZ, todayInTZ } from '../../lib/date.js'
import { summarizeFinance, type FinanceAppointment } from '../../lib/finance-summary.js'

const TZ = 'America/Santiago'

const summarySchema = z.object({
  year: z.string().regex(/^\d{4}$/, 'year must be 4-digit').optional(),
  month: z.string().regex(/^([1-9]|1[0-2])$/, 'month must be 1-12').optional(),
})

/** Rango UTC del mes `year-month` en la zona horaria del profesional. */
function monthRangeInTZ(year: number, month: number): { gte: Date; lte: Date } {
  const mm = String(month).padStart(2, '0')
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return {
    gte: dayRangeInTZ(`${year}-${mm}-01`, TZ).gte,
    lte: dayRangeInTZ(`${year}-${mm}-${String(lastDay).padStart(2, '0')}`, TZ).lte,
  }
}

function previousMonth(year: number, month: number): { year: number; month: number } {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 }
}

async function findMonthAppointments(professionalId: string, year: number, month: number): Promise<FinanceAppointment[]> {
  return prisma.appointment.findMany({
    where: {
      professionalId,
      status: { not: 'cancelled' },
      startDateTime: monthRangeInTZ(year, month),
    },
    select: {
      id: true,
      clientName: true,
      startDateTime: true,
      paymentStatus: true,
      paymentAmount: true,
      paymentMethod: true,
      outcome: true,
      service: { select: { id: true, name: true, price: true } },
    },
    orderBy: { startDateTime: 'asc' },
  })
}

export async function getFinanceSummary(req: Request, res: Response): Promise<void> {
  const parsed = summarySchema.safeParse(req.query)
  if (!parsed.success) {
    fail(res, parsed.error.issues[0]?.message ?? 'Invalid params', 400)
    return
  }

  const [currentYear, currentMonth] = todayInTZ(TZ).split('-').map(Number)
  const year = parsed.data.year ? Number(parsed.data.year) : currentYear
  const month = parsed.data.month ? Number(parsed.data.month) : currentMonth
  const professionalId = req.professionalId ?? ''
  const prev = previousMonth(year, month)
  const now = new Date()

  const [appointments, prevAppointments] = await Promise.all([
    findMonthAppointments(professionalId, year, month),
    findMonthAppointments(professionalId, prev.year, prev.month),
  ])

  ok(res, {
    year,
    month,
    ...summarizeFinance(appointments, now),
    previousMonth: { year: prev.year, month: prev.month, collected: summarizeFinance(prevAppointments, now).collected },
  })
}

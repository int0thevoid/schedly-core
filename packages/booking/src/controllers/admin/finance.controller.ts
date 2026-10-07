import type { Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma.js'
import { fail, ok } from '../../lib/response.js'
import { dateKeyInTZ, dayRangeInTZ, todayInTZ } from '../../lib/date.js'
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

const TREND_MONTHS = 12

function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const index = year * 12 + (month - 1) + delta
  return { year: Math.floor(index / 12), month: (index % 12) + 1 }
}

/**
 * Tendencia anual (US-082): lo cobrado en cada uno de los 12 meses que terminan en year/month (por
 * defecto el actual) y en el mismo mes del año anterior. Mismas reglas que el resumen: por fecha de
 * la cita, sin canceladas ni regalías. Una sola consulta sobre los 24 meses.
 */
export async function getFinanceTrend(req: Request, res: Response): Promise<void> {
  const parsed = summarySchema.safeParse(req.query)
  if (!parsed.success) {
    fail(res, parsed.error.issues[0]?.message ?? 'Invalid params', 400)
    return
  }

  const [currentYear, currentMonth] = todayInTZ(TZ).split('-').map(Number)
  const end = {
    year: parsed.data.year ? Number(parsed.data.year) : currentYear,
    month: parsed.data.month ? Number(parsed.data.month) : currentMonth,
  }
  const first = shiftMonth(end.year, end.month, -(2 * TREND_MONTHS - 1))

  const paid = await prisma.appointment.findMany({
    where: {
      professionalId: req.professionalId ?? '',
      status: { not: 'cancelled' },
      paymentStatus: 'paid',
      // Pagos antiguos sin medio registrado (null) cuentan; "not gift" solo en SQL los excluiría.
      OR: [{ paymentMethod: null }, { paymentMethod: { not: 'gift' } }],
      startDateTime: {
        gte: monthRangeInTZ(first.year, first.month).gte,
        lte: monthRangeInTZ(end.year, end.month).lte,
      },
    },
    select: { startDateTime: true, paymentAmount: true },
  })

  const byMonth = new Map<string, number>()
  for (const appointment of paid) {
    const key = dateKeyInTZ(appointment.startDateTime, TZ).slice(0, 7)
    byMonth.set(key, (byMonth.get(key) ?? 0) + (appointment.paymentAmount ?? 0))
  }
  const keyOf = (p: { year: number; month: number }) => `${p.year}-${String(p.month).padStart(2, '0')}`

  const months = Array.from({ length: TREND_MONTHS }, (_, i) => {
    const period = shiftMonth(end.year, end.month, i - (TREND_MONTHS - 1))
    const previous = shiftMonth(period.year, period.month, -12)
    return {
      year: period.year,
      month: period.month,
      collected: byMonth.get(keyOf(period)) ?? 0,
      previousYearCollected: byMonth.get(keyOf(previous)) ?? 0,
    }
  })

  ok(res, { months })
}

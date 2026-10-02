/**
 * Resumen financiero mensual del panel admin.
 *
 * Reglas (definidas con la profesional, 02-10-2026):
 * - Los ingresos se atribuyen al mes de la fecha de la cita (no a la fecha del pago).
 * - Las citas canceladas no cuentan (se filtran en la consulta).
 * - Los pagos con método `gift` (regalías) se informan aparte y no suman a lo cobrado.
 * - Lo pendiente se valoriza al precio de lista del servicio.
 * - Las inasistencias sin pago van en un grupo propio hasta definir cómo se resuelven.
 */

export interface FinanceAppointment {
  id: string
  clientName: string
  startDateTime: Date
  paymentStatus: string
  paymentAmount: number | null
  paymentMethod: string | null
  outcome: string | null
  service: { id: string; name: string; price: number }
}

interface Bucket {
  amount: number
  count: number
}

interface ServiceBreakdown {
  serviceId: string
  serviceName: string
  appointments: number
  collected: number
  pending: number
}

interface PendingPayment {
  id: string
  clientName: string
  startDateTime: string
  serviceName: string
  amount: number
  noShow: boolean
}

interface FinanceSummary {
  collected: Bucket
  outstanding: Bucket
  noShowUnpaid: Bucket
  projected: Bucket
  gifts: Bucket
  byService: ServiceBreakdown[]
  byMethod: { transfer: Bucket; cash: Bucket; unspecified: Bucket }
  pendingPayments: PendingPayment[]
}

function emptyBucket(): Bucket {
  return { amount: 0, count: 0 }
}

function add(bucket: Bucket, amount: number): void {
  bucket.amount += amount
  bucket.count += 1
}

export function summarizeFinance(appointments: FinanceAppointment[], now: Date): FinanceSummary {
  const summary: FinanceSummary = {
    collected: emptyBucket(),
    outstanding: emptyBucket(),
    noShowUnpaid: emptyBucket(),
    projected: emptyBucket(),
    gifts: emptyBucket(),
    byService: [],
    byMethod: { transfer: emptyBucket(), cash: emptyBucket(), unspecified: emptyBucket() },
    pendingPayments: [],
  }
  const services = new Map<string, ServiceBreakdown>()

  for (const appt of appointments) {
    let service = services.get(appt.service.id)
    if (!service) {
      service = { serviceId: appt.service.id, serviceName: appt.service.name, appointments: 0, collected: 0, pending: 0 }
      services.set(appt.service.id, service)
    }
    service.appointments += 1

    if (appt.paymentStatus === 'paid') {
      const amount = appt.paymentAmount ?? 0
      if (appt.paymentMethod === 'gift') {
        add(summary.gifts, amount)
        continue
      }
      add(summary.collected, amount)
      service.collected += amount
      const method = appt.paymentMethod === 'transfer' || appt.paymentMethod === 'cash' ? appt.paymentMethod : 'unspecified'
      add(summary.byMethod[method], amount)
      continue
    }

    const price = appt.service.price
    service.pending += price
    if (appt.startDateTime > now) {
      add(summary.projected, price)
      continue
    }
    const noShow = appt.outcome === 'no_show'
    add(noShow ? summary.noShowUnpaid : summary.outstanding, price)
    summary.pendingPayments.push({
      id: appt.id,
      clientName: appt.clientName,
      startDateTime: appt.startDateTime.toISOString(),
      serviceName: appt.service.name,
      amount: price,
      noShow,
    })
  }

  summary.byService = [...services.values()].sort((a, b) => b.collected - a.collected || b.appointments - a.appointments)
  summary.pendingPayments.sort((a, b) => a.startDateTime.localeCompare(b.startDateTime))
  return summary
}

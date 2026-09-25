import { createGoogleMeetEvent, cancelGoogleMeetEvent } from '@schedly/notifications'
import { prisma } from './prisma.js'
import type { Appointment, Service } from '../generated/prisma/index.js'

/**
 * Crea el evento de Google Meet para una cita online y persiste `googleEventId`/`meetLink`.
 * No lanza: si falla (credenciales no configuradas, error de red, etc.) devuelve la cita
 * original sin modificar — la confirmación de la cita nunca debe bloquearse por esto.
 */
export async function ensureGoogleMeetEvent(
  appointment: Appointment,
  service: Service,
  professionalName: string,
): Promise<Appointment> {
  if (appointment.modality !== 'online') return appointment

  try {
    const result = await createGoogleMeetEvent({
      title: `${service.name} — ${professionalName}`,
      description: `Sesión de psicología con ${professionalName}`,
      startDateTime: appointment.startDateTime,
      endDateTime: appointment.endDateTime,
      attendeeEmail: appointment.clientEmail,
    })
    if (!result) return appointment

    return await prisma.appointment.update({
      where: { id: appointment.id },
      data: { googleEventId: result.eventId, meetLink: result.meetLink },
    })
  } catch (err) {
    console.error(`[google-meet] failed to ensure Meet event for appointment ${appointment.id}`, err)
    return appointment
  }
}

/** Cancela el evento de Google Calendar asociado a una cita, si existe. No lanza. */
export async function cancelGoogleMeetEventForAppointment(
  appointment: Pick<Appointment, 'id' | 'googleEventId'>,
): Promise<void> {
  if (!appointment.googleEventId) return
  try {
    await cancelGoogleMeetEvent(appointment.googleEventId)
  } catch (err) {
    console.error(`[google-meet] failed to cancel Meet event for appointment ${appointment.id}`, err)
  }
}

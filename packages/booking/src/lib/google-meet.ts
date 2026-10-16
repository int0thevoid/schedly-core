import { tryCreateGoogleMeetEvent, cancelGoogleMeetEvent, type GoogleMeetAttempt, type GoogleMeetFailureReason } from '@schedly/notifications'
import { prisma } from './prisma.js'
import type { Appointment, Service } from '../generated/prisma/index.js'

type MeetEnsureResult =
  | { appointment: Appointment; failure?: undefined }
  | { appointment: Appointment; failure: { reason: GoogleMeetFailureReason | 'db'; detail: string } }

/**
 * Como `ensureGoogleMeetEvent`, pero informa por qué no se pudo crear el link (lo usa el panel).
 * Si la cita ya tiene link, o no es online, no hace nada.
 */
export async function ensureGoogleMeetEventDetailed(
  appointment: Appointment,
  service: Service,
  professionalName: string,
): Promise<MeetEnsureResult> {
  if (appointment.modality !== 'online' || appointment.meetLink) return { appointment }

  let attempt: GoogleMeetAttempt
  try {
    attempt = await tryCreateGoogleMeetEvent({
      title: `${service.name} — ${professionalName}`,
      description: `Sesión de psicología con ${professionalName}`,
      startDateTime: appointment.startDateTime,
      endDateTime: appointment.endDateTime,
      attendeeEmail: appointment.clientEmail,
    })
  } catch (err) {
    attempt = { ok: false, reason: 'api', detail: err instanceof Error ? err.message : String(err) }
  }
  if (!attempt.ok) {
    console.error(`[google-meet] appointment ${appointment.id} left without Meet link (${attempt.reason}): ${attempt.detail}`)
    return { appointment, failure: { reason: attempt.reason, detail: attempt.detail } }
  }

  try {
    const updated = await prisma.appointment.update({
      where: { id: appointment.id },
      data: { googleEventId: attempt.eventId, meetLink: attempt.meetLink },
    })
    return { appointment: updated }
  } catch (err) {
    console.error(`[google-meet] failed to save Meet link for appointment ${appointment.id}`, err)
    return { appointment, failure: { reason: 'db', detail: err instanceof Error ? err.message : String(err) } }
  }
}

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
  return (await ensureGoogleMeetEventDetailed(appointment, service, professionalName)).appointment
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

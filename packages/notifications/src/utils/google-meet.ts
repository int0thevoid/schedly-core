import { createSign, randomUUID } from 'node:crypto'

export interface GoogleMeetEventInput {
  title: string
  description: string
  startDateTime: Date
  endDateTime: Date
  attendeeEmail?: string
}

export interface GoogleMeetEventResult {
  eventId: string
  meetLink: string
}

interface GoogleCalendarCredentials {
  clientEmail: string
  privateKey: string
  calendarId: string
}

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar'

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function getCredentialsFromEnv(): GoogleCalendarCredentials | null {
  const clientEmail = process.env.GOOGLE_CALENDAR_CLIENT_EMAIL
  const rawPrivateKey = process.env.GOOGLE_CALENDAR_PRIVATE_KEY
  const calendarId = process.env.GOOGLE_CALENDAR_ID
  if (!clientEmail || !rawPrivateKey || !calendarId) return null
  // En variables de entorno los saltos de línea de la private key suelen venir escapados (\n literal).
  const privateKey = rawPrivateKey.includes('\\n') ? rawPrivateKey.replace(/\\n/g, '\n') : rawPrivateKey
  return { clientEmail, privateKey, calendarId }
}

/** Firma un JWT de cuenta de servicio (RS256) y lo intercambia por un access token OAuth2. */
async function getAccessToken(creds: GoogleCalendarCredentials): Promise<string> {
  const nowSeconds = Math.floor(Date.now() / 1000)
  const header = { alg: 'RS256', typ: 'JWT' }
  const claims = {
    iss: creds.clientEmail,
    scope: CALENDAR_SCOPE,
    aud: TOKEN_URL,
    iat: nowSeconds,
    exp: nowSeconds + 3600,
  }
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claims))}`
  const signature = createSign('RSA-SHA256').update(signingInput).sign(creds.privateKey)
  const assertion = `${signingInput}.${base64url(signature)}`

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  })

  if (!res.ok) {
    throw new Error(`Failed to obtain Google OAuth token: ${res.status} ${await res.text()}`)
  }
  const json = (await res.json()) as { access_token?: string }
  if (!json.access_token) {
    throw new Error('Google OAuth token response missing access_token')
  }
  return json.access_token
}

interface GoogleCalendarEventResponse {
  id?: string
  hangoutLink?: string
  conferenceData?: {
    entryPoints?: Array<{ entryPointType?: string; uri?: string }>
  }
}

function extractMeetLink(event: GoogleCalendarEventResponse): string | undefined {
  if (event.hangoutLink) return event.hangoutLink
  return event.conferenceData?.entryPoints?.find((entry) => entry.entryPointType === 'video')?.uri
}

/**
 * Crea un evento en Google Calendar con videollamada de Google Meet para una cita online.
 * No lanza: si las credenciales no están configuradas o falla la llamada a la API,
 * devuelve `null` — el llamador debe seguir confirmando la cita sin bloquear al paciente.
 */
export async function createGoogleMeetEvent(input: GoogleMeetEventInput): Promise<GoogleMeetEventResult | null> {
  const creds = getCredentialsFromEnv()
  if (!creds) {
    console.warn('[google-meet] Google Calendar credentials not configured — skipping Meet event creation')
    return null
  }

  try {
    const accessToken = await getAccessToken(creds)
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(creds.calendarId)}/events?conferenceDataVersion=1`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          summary: input.title,
          description: input.description,
          start: { dateTime: input.startDateTime.toISOString() },
          end: { dateTime: input.endDateTime.toISOString() },
          ...(input.attendeeEmail ? { attendees: [{ email: input.attendeeEmail }] } : {}),
          conferenceData: {
            createRequest: {
              requestId: randomUUID(),
              conferenceSolutionKey: { type: 'hangoutsMeet' },
            },
          },
        }),
      },
    )

    if (!res.ok) {
      throw new Error(`Google Calendar API error creating event: ${res.status} ${await res.text()}`)
    }

    const event = (await res.json()) as GoogleCalendarEventResponse
    const meetLink = extractMeetLink(event)
    if (!event.id || !meetLink) {
      throw new Error('Google Calendar API response missing event id or Meet link')
    }
    return { eventId: event.id, meetLink }
  } catch (err) {
    console.error('[google-meet] failed to create Google Meet event', err)
    return null
  }
}

/**
 * Cancela (elimina) un evento de Google Calendar por id. No lanza: los errores quedan
 * logueados para revisión, sin afectar el flujo de cancelación de la cita.
 */
export async function cancelGoogleMeetEvent(eventId: string): Promise<void> {
  const creds = getCredentialsFromEnv()
  if (!creds) return

  try {
    const accessToken = await getAccessToken(creds)
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(creds.calendarId)}/events/${encodeURIComponent(eventId)}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    )
    // 410 Gone: el evento ya estaba eliminado — no es un error para este flujo.
    if (!res.ok && res.status !== 410 && res.status !== 404) {
      throw new Error(`Google Calendar API error cancelling event: ${res.status} ${await res.text()}`)
    }
  } catch (err) {
    console.error(`[google-meet] failed to cancel Google Meet event ${eventId}`, err)
  }
}

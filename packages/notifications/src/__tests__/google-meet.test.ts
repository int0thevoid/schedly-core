import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createGoogleMeetEvent, cancelGoogleMeetEvent } from '../utils/google-meet.js'

const START = new Date('2026-07-15T10:00:00.000Z')
const END = new Date('2026-07-15T10:45:00.000Z')

const ENV_KEYS = ['GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET', 'GOOGLE_OAUTH_REFRESH_TOKEN', 'GOOGLE_CALENDAR_ID'] as const

function setCredentials(): void {
  process.env.GOOGLE_OAUTH_CLIENT_ID = 'client-id.apps.googleusercontent.com'
  process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'client-secret'
  process.env.GOOGLE_OAUTH_REFRESH_TOKEN = 'refresh-token'
  process.env.GOOGLE_CALENDAR_ID = 'stefany@example.com'
}

function clearCredentials(): void {
  for (const key of ENV_KEYS) delete process.env[key]
}

describe('createGoogleMeetEvent', () => {
  beforeEach(() => {
    clearCredentials()
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    clearCredentials()
  })

  it('returns null without calling the API when credentials are not configured', async () => {
    const result = await createGoogleMeetEvent({
      title: 'Psicoterapia',
      description: 'Sesión online',
      startDateTime: START,
      endDateTime: END,
    })
    expect(result).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('creates the event and returns the Meet link on success', async () => {
    setCredentials()
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'token-123' }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'evt_1', hangoutLink: 'https://meet.google.com/abc-defg-hij' }),
      })

    const result = await createGoogleMeetEvent({
      title: 'Psicoterapia',
      description: 'Sesión online',
      startDateTime: START,
      endDateTime: END,
      attendeeEmail: 'paciente@example.com',
    })

    expect(result).toEqual({ eventId: 'evt_1', meetLink: 'https://meet.google.com/abc-defg-hij' })
    expect(fetchMock).toHaveBeenCalledTimes(2)

    const [tokenUrl, tokenInit] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(tokenUrl).toBe('https://oauth2.googleapis.com/token')
    const tokenParams = new URLSearchParams(tokenInit.body as string)
    expect(tokenParams.get('grant_type')).toBe('refresh_token')
    expect(tokenParams.get('refresh_token')).toBe('refresh-token')

    const [eventsUrl, eventsInit] = fetchMock.mock.calls[1] as [string, RequestInit]
    expect(eventsUrl).toContain('conferenceDataVersion=1')
    const body = JSON.parse(eventsInit.body as string)
    expect(body).toMatchObject({ summary: 'Psicoterapia', attendees: [{ email: 'paciente@example.com' }] })
  })

  it('returns null and does not throw when the token request fails', async () => {
    setCredentials()
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>
    fetchMock.mockResolvedValueOnce({ ok: false, status: 401, text: async () => 'invalid_grant' })

    const result = await createGoogleMeetEvent({
      title: 'Psicoterapia',
      description: 'Sesión online',
      startDateTime: START,
      endDateTime: END,
    })

    expect(result).toBeNull()
  })

  it('returns null when the API response has no Meet link', async () => {
    setCredentials()
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'token-123' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'evt_1' }) })

    const result = await createGoogleMeetEvent({
      title: 'Psicoterapia',
      description: 'Sesión online',
      startDateTime: START,
      endDateTime: END,
    })

    expect(result).toBeNull()
  })
})

describe('cancelGoogleMeetEvent', () => {
  beforeEach(() => {
    clearCredentials()
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    clearCredentials()
  })

  it('does nothing when credentials are not configured', async () => {
    await cancelGoogleMeetEvent('evt_1')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('calls DELETE on the event once authenticated', async () => {
    setCredentials()
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'token-123' }) })
      .mockResolvedValueOnce({ ok: true })

    await cancelGoogleMeetEvent('evt_1')

    const [deleteUrl, deleteInit] = fetchMock.mock.calls[1] as [string, RequestInit]
    expect(deleteUrl).toContain('/events/evt_1')
    expect(deleteInit.method).toBe('DELETE')
  })

  it('does not throw when the delete call fails', async () => {
    setCredentials()
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'token-123' }) })
      .mockResolvedValueOnce({ ok: false, status: 500, text: async () => 'server error' })

    await expect(cancelGoogleMeetEvent('evt_1')).resolves.toBeUndefined()
  })
})

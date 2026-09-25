import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createGoogleMeetEvent, cancelGoogleMeetEvent } from '../utils/google-meet.js'

const START = new Date('2026-07-15T10:00:00.000Z')
const END = new Date('2026-07-15T10:45:00.000Z')

const ENV_KEYS = ['GOOGLE_CALENDAR_CLIENT_EMAIL', 'GOOGLE_CALENDAR_PRIVATE_KEY', 'GOOGLE_CALENDAR_ID'] as const

// Clave RSA de prueba válida (generada localmente solo para el test, no se usa contra Google real).
const TEST_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC1Heyiz/6T9ZN8
XTY5bw1b1Ie2H4l+uC7fWgtU92unhEQtPIS110x1e7bEjqRhlFue1Nm4Fyw8BEg7
SnPm+cMLwGJ1/398W+tY2hsHDhEdII8dK0/lu0pjYliQxVr0GsUMy/KGkYfcTb8c
DVM1dBMxIBm7B3tdoFazzbWWK+1JGB/DziQPyZw4/GtLZ3pLclCKgiMgrYTXkOxt
gsUpWMqbk2r+3AqNYmiA6OAhatQUo3IG5Hx4kW+mGGEpvKjxkdPQYlXpzyKr+9Xh
Ervk0+4Ls5xPQdTzLGF8LzY8OjUjjRXBB0mN/NIGMHYS5yN9ayfs2ZMJWiU31Obq
6Cdav7+7AgMBAAECggEAA9RZ2Qijat1FHMEoMNp99bebYpWHH2rlWGtu4U4iWuMY
J/BNvaSLcgTg7lLPyF2ax4bbnAgm//vdMerwljn1geczwPTBugKD8H4bSf2ZQG+1
5vMWZONq/rzCstW7BxdInFOOaxvJO7ZYuJvSUXqE7CoWff0tNbBHgdS/83VpUBbN
eKYfu6m2r3VbD0JdaWedk4Wl5mgA3zjlkE2mJPl3B55ZWZvnukgmoKfemBeJHvRg
I/1zk3N9MyFeAgTAMqWyhTcxbOmFhOusnBWmMq22tqyBw1z1H+Ov/1dIeZ5cDtlX
3klat2pMAuCT8Fi+RK1IjfGiBILFhQHsW9zME7lMvQKBgQDj+nnX54BwepkI2sdD
Ffp1s6opDiVy3glx33CZv78eF3+b+3gS5wYgB68HW2xuM+KoZf8rXukuhTLmcltf
3IKVDWVGHubkk3wFKL1QqYxzeAlb5i3P1DU+XI97EUBGAF6MHwwd/aA61a+raPGZ
vs7yHCVtE9IH8MD/E4yxHz61rwKBgQDLYOmqnpZd1UCAYlvrzUkxJQ9SdmKW8ucW
IMYjdtOEOezL5hktGUZ7Rub2GXSmfBroHh3pA873pvPwEYY7NVXSy3c+cIWL4jj/
TToBjYG2LXX2UKtwSEpZMWGndJJtIaE0g/4zDTpQzoRMf2EAQRXgfs8XUb1QqKuR
fpPNMAkltQKBgQC2Aij4iChwpFA9U302P/u/sHqvYE3hkQb1VK/u77jDa3tDqtZI
MQ0g0UGZnBHLQb05OIUpuRJtQ4ZJmQ7+T2wpV5J9Evq/jke7TrUmCtbI8RJ3viLh
A8imSvt6A2HPAUh6keb4op4jmqovLQ+F8WICxRnUJbjPAhTzEEaIuis0nQKBgDlP
ogk2j2D5yydikEyumMWEkADI45dt87jEm5E61vgX6qa6vLV8vePXYxZOrhSMPHjU
o9EaBaS8I1mvVogwy3KPa5bo1nlI0o7/EC2H1tmjje5PZUBK3sirpb0umGSwaWEH
IQb530kOKTH1YzxTGvscQPdtTVABd/eUF8pmku1RAoGAUuPZYff7R6P77EzO5a8p
gfcNXZjnIbENrtB3VX2E7gvmtncMjYZ1pw+lL22Fwtw7PN2/js5D92NPz2/kXFxT
lNx6fAoBlMqmDoYc3GHyDevJWlsxWJF6JEkGqKOG2cE9UpFlnMSC+qL2E7N7ODmX
B7pvOSj8a0oyoeiyTPLS5/0=
-----END PRIVATE KEY-----`

function setCredentials(): void {
  process.env.GOOGLE_CALENDAR_CLIENT_EMAIL = 'service-account@example.iam.gserviceaccount.com'
  process.env.GOOGLE_CALENDAR_PRIVATE_KEY = TEST_PRIVATE_KEY
  process.env.GOOGLE_CALENDAR_ID = 'calendar-id@group.calendar.google.com'
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
    })

    expect(result).toEqual({ eventId: 'evt_1', meetLink: 'https://meet.google.com/abc-defg-hij' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const [eventsUrl, eventsInit] = fetchMock.mock.calls[1] as [string, RequestInit]
    expect(eventsUrl).toContain('conferenceDataVersion=1')
    const body = JSON.parse(eventsInit.body as string)
    expect(body).toMatchObject({ summary: 'Psicoterapia' })
    // Una cuenta de servicio sin Domain-Wide Delegation no puede invitar asistentes —
    // el request nunca debe incluir `attendees` (ver comentario en google-meet.ts).
    expect(body.attendees).toBeUndefined()
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

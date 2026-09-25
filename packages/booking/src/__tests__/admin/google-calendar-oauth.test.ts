import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import app from '../../app.js'

function token(professionalId = 'pro1') {
  return jwt.sign({ professionalId, role: 'admin' }, 'dev-secret')
}

const ENV_KEYS = ['GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET', 'GOOGLE_OAUTH_REDIRECT_URI'] as const

function setEnv(): void {
  process.env.GOOGLE_OAUTH_CLIENT_ID = 'client-id.apps.googleusercontent.com'
  process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'client-secret'
  process.env.GOOGLE_OAUTH_REDIRECT_URI = 'https://api.example.com/api/admin/google-calendar/oauth-callback'
}

function clearEnv(): void {
  for (const key of ENV_KEYS) delete process.env[key]
}

beforeEach(() => {
  clearEnv()
})

afterEach(() => {
  clearEnv()
  vi.unstubAllGlobals()
})

describe('GET /api/admin/google-calendar/oauth-start', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/admin/google-calendar/oauth-start')
    expect(res.status).toBe(401)
  })

  it('returns 500 when GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_REDIRECT_URI are not configured', async () => {
    const res = await request(app)
      .get('/api/admin/google-calendar/oauth-start')
      .set('Cookie', `auth_token=${token()}`)
    expect(res.status).toBe(500)
  })

  it('redirects to the Google consent screen with the expected params and sets a state cookie', async () => {
    setEnv()
    const res = await request(app)
      .get('/api/admin/google-calendar/oauth-start')
      .set('Cookie', `auth_token=${token()}`)

    expect(res.status).toBe(302)
    const location = new URL(res.headers.location as string)
    expect(location.origin + location.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    expect(location.searchParams.get('client_id')).toBe('client-id.apps.googleusercontent.com')
    expect(location.searchParams.get('redirect_uri')).toBe(process.env.GOOGLE_OAUTH_REDIRECT_URI)
    expect(location.searchParams.get('access_type')).toBe('offline')
    expect(location.searchParams.get('prompt')).toBe('consent')
    expect(location.searchParams.get('state')).toBeTruthy()

    const setCookie = res.headers['set-cookie'] as unknown as string[]
    expect(setCookie.some((c) => c.startsWith('google_oauth_state='))).toBe(true)
  })
})

describe('GET /api/admin/google-calendar/oauth-callback', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/admin/google-calendar/oauth-callback')
    expect(res.status).toBe(401)
  })

  it('returns 500 when env vars are not configured', async () => {
    const res = await request(app)
      .get('/api/admin/google-calendar/oauth-callback')
      .set('Cookie', `auth_token=${token()}`)
    expect(res.status).toBe(500)
  })

  it('returns 400 when Google reports an error', async () => {
    setEnv()
    const res = await request(app)
      .get('/api/admin/google-calendar/oauth-callback?error=access_denied')
      .set('Cookie', `auth_token=${token()}`)
    expect(res.status).toBe(400)
  })

  it('returns 400 when the state does not match the cookie set by oauth-start', async () => {
    setEnv()
    const res = await request(app)
      .get('/api/admin/google-calendar/oauth-callback?code=abc&state=wrong')
      .set('Cookie', [`auth_token=${token()}`, 'google_oauth_state=expected'])
    expect(res.status).toBe(400)
  })

  it('returns 400 when code is missing', async () => {
    setEnv()
    const res = await request(app)
      .get('/api/admin/google-calendar/oauth-callback?state=abc')
      .set('Cookie', [`auth_token=${token()}`, 'google_oauth_state=abc'])
    expect(res.status).toBe(400)
  })

  it('returns 502 when the token exchange fails', async () => {
    setEnv()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 400, text: async () => 'invalid_grant' }))

    const res = await request(app)
      .get('/api/admin/google-calendar/oauth-callback?code=abc&state=abc')
      .set('Cookie', [`auth_token=${token()}`, 'google_oauth_state=abc'])
    expect(res.status).toBe(502)
  })

  it('returns 502 when Google does not return a refresh_token', async () => {
    setEnv()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ access_token: 'x' }) }))

    const res = await request(app)
      .get('/api/admin/google-calendar/oauth-callback?code=abc&state=abc')
      .set('Cookie', [`auth_token=${token()}`, 'google_oauth_state=abc'])
    expect(res.status).toBe(502)
  })

  it('shows the refresh token on success', async () => {
    setEnv()
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'x', refresh_token: '1//super-secret-refresh-token' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const res = await request(app)
      .get('/api/admin/google-calendar/oauth-callback?code=abc&state=abc')
      .set('Cookie', [`auth_token=${token()}`, 'google_oauth_state=abc'])

    expect(res.status).toBe(200)
    expect(res.text).toContain('1//super-secret-refresh-token')

    const [tokenUrl, tokenInit] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(tokenUrl).toBe('https://oauth2.googleapis.com/token')
    const params = new URLSearchParams(tokenInit.body as string)
    expect(params.get('grant_type')).toBe('authorization_code')
    expect(params.get('code')).toBe('abc')
  })
})

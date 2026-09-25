import type { CookieOptions, Request, Response } from 'express'
import { randomUUID } from 'node:crypto'
import { fail } from '../../lib/response.js'

const STATE_COOKIE_NAME = 'google_oauth_state'
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const SCOPE = 'https://www.googleapis.com/auth/calendar.events'

function stateCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/admin/google-calendar',
    maxAge: 10 * 60 * 1000,
  }
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/**
 * Paso 1 del flujo de autorización de una sola vez (ver docs de despliegue): redirige a la
 * pantalla de consentimiento de Google para que el profesional autorice el acceso a su propio
 * calendario. Reemplaza a la cuenta de servicio — actuar como la cuenta real permite crear
 * conferencias de Meet e invitar asistentes, algo que una cuenta de servicio sin Domain-Wide
 * Delegation no puede hacer.
 */
export function startGoogleCalendarOAuth(_req: Request, res: Response): void {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI
  if (!clientId || !redirectUri) {
    fail(res, 'GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_REDIRECT_URI no están configurados en el servidor', 500)
    return
  }

  const state = randomUUID()
  res.cookie(STATE_COOKIE_NAME, state, stateCookieOptions())

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    state,
  })
  res.redirect(`${AUTH_URL}?${params.toString()}`)
}

/**
 * Paso 2: Google redirige acá con el código de autorización. Se intercambia por un refresh
 * token, que se muestra una sola vez en pantalla para copiarlo a mano a
 * GOOGLE_OAUTH_REFRESH_TOKEN en el ecosystem.config.cjs del servidor — igual que JWT_SECRET,
 * nunca se persiste automáticamente en ningún lado.
 */
export async function googleCalendarOAuthCallback(req: Request, res: Response): Promise<void> {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI
  if (!clientId || !clientSecret || !redirectUri) {
    fail(res, 'GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET / GOOGLE_OAUTH_REDIRECT_URI no están configurados en el servidor', 500)
    return
  }

  const { code, state, error } = req.query as { code?: string; state?: string; error?: string }
  const expectedState = req.cookies?.[STATE_COOKIE_NAME] as string | undefined
  res.clearCookie(STATE_COOKIE_NAME, stateCookieOptions())

  if (error) {
    fail(res, `Google denegó la autorización: ${error}`, 400)
    return
  }
  if (!state || !expectedState || state !== expectedState) {
    fail(res, 'state inválido o expirado — reinicia el flujo desde /api/admin/google-calendar/oauth-start', 400)
    return
  }
  if (!code) {
    fail(res, 'Falta el parámetro code', 400)
    return
  }

  const tokenRes = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })

  if (!tokenRes.ok) {
    fail(res, `Error al intercambiar el código por tokens: ${tokenRes.status} ${await tokenRes.text()}`, 502)
    return
  }

  const json = (await tokenRes.json()) as { refresh_token?: string }
  if (!json.refresh_token) {
    fail(
      res,
      'Google no devolvió un refresh_token (pasa si ya autorizaste antes con este client). ' +
        'Revoca el acceso en https://myaccount.google.com/permissions y vuelve a intentar desde /oauth-start.',
      502,
    )
    return
  }

  res.status(200).type('html').send(`<!DOCTYPE html>
<html lang="es">
  <body style="font-family:sans-serif;max-width:640px;margin:40px auto;line-height:1.6;">
    <h1>Autorización completada</h1>
    <p>Copia este valor en <code>GOOGLE_OAUTH_REFRESH_TOKEN</code> dentro de <code>ecosystem.config.cjs</code>:</p>
    <pre style="background:#f4f4f4;padding:16px;border-radius:8px;overflow-wrap:break-word;white-space:pre-wrap;">${escapeHtml(json.refresh_token)}</pre>
    <p>Luego reinicia tomando el archivo (no el nombre del proceso):</p>
    <pre style="background:#f4f4f4;padding:16px;border-radius:8px;">pm2 restart ecosystem.config.cjs --update-env</pre>
    <p>Este valor no queda guardado en ningún lado del lado del servidor — cierra esta pestaña una vez que lo hayas copiado.</p>
  </body>
</html>`)
}

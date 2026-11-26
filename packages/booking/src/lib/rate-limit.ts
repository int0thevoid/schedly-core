import { ipKeyGenerator, type Options } from 'express-rate-limit'
import type { Request } from 'express'

/**
 * Los límites de peticiones deben contar por persona. Entre el visitante y el backend están Cloudflare
 * y el proxy de Railway, así que req.ip es siempre la IP del proxy: todos compartían un mismo cupo.
 * Cloudflare informa la IP real en CF-Connecting-IP; sin esa cabecera (local, tests) se usa req.ip.
 * ipKeyGenerator agrupa IPv6 por subred, como hace la librería por defecto.
 */
export function clientKey(req: Request): string {
  const header = req.headers['cf-connecting-ip']
  const ip = (Array.isArray(header) ? header[0] : header)?.trim() || req.ip || ''
  return ipKeyGenerator(ip)
}

/** Opciones comunes de los limitadores: clave por persona y sin la advertencia de X-Forwarded-For. */
export const perClientLimit: Partial<Options> = {
  keyGenerator: clientKey,
  validate: { xForwardedForHeader: false },
}

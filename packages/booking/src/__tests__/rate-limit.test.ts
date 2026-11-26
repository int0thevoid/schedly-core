import { describe, expect, it } from 'vitest'
import type { Request } from 'express'
import { clientKey } from '../lib/rate-limit.js'

const req = (headers: Record<string, string>, ip = '10.0.0.1') => ({ headers, ip }) as unknown as Request

describe('clientKey', () => {
  it('uses the real visitor IP from Cloudflare, not the proxy IP', () => {
    expect(clientKey(req({ 'cf-connecting-ip': '200.1.2.3' }))).toBe('200.1.2.3')
    expect(clientKey(req({ 'cf-connecting-ip': '200.1.2.4' }))).not.toBe(clientKey(req({ 'cf-connecting-ip': '200.1.2.3' })))
  })

  it('falls back to req.ip without the header', () => {
    expect(clientKey(req({}))).toBe('10.0.0.1')
  })
})

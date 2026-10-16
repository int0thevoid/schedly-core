import { afterEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import './helpers/prisma-mock.js'
import app from '../app.js'

describe('GET /', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('redirige (301) al sitio público definido en FRONTEND_URL', async () => {
    vi.stubEnv('FRONTEND_URL', 'https://psstefanyosorio.cl')
    const res = await request(app).get('/')
    expect(res.status).toBe(301)
    expect(res.headers.location).toBe('https://psstefanyosorio.cl')
  })
})

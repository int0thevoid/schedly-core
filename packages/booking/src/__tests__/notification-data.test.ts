import { describe, expect, it } from 'vitest'
import { buildTransferData } from '../lib/notification-data.js'
import type { Professional } from '../generated/prisma/index.js'

const PROFESSIONAL = {
  id: 'pro1',
  name: 'Ps. Stefany Osorio',
  email: 'stefany@example.com',
  phone: '+56966898588',
  timezone: 'America/Santiago',
  transferRut: '12.345.678-9',
  transferBank: 'banco_chile',
  transferAccountType: 'vista',
  transferAccountNumber: '123456789',
  transferEmail: 'pagos@example.com',
} as unknown as Professional

describe('buildTransferData', () => {
  it('convierte el código de banco a su nombre legible', () => {
    const data = buildTransferData(PROFESSIONAL)
    expect(data?.bank).toBe('Banco de Chile')
  })

  it('retorna undefined si falta algún dato de transferencia', () => {
    const data = buildTransferData({ ...PROFESSIONAL, transferBank: null })
    expect(data).toBeUndefined()
  })
})

import { describe, expect, it } from 'vitest'
import { getBankName } from '../data/banks.js'

describe('getBankName', () => {
  it('convierte el código de banco a su nombre legible', () => {
    expect(getBankName('banco_chile')).toBe('Banco de Chile')
    expect(getBankName('estado')).toBe('Banco Estado')
  })

  it('retorna el valor original si el código no se reconoce', () => {
    expect(getBankName('Banco Estado')).toBe('Banco Estado')
    expect(getBankName('')).toBe('')
  })
})

export const CHILEAN_BANKS = [
  { code: 'banco_chile', name: 'Banco de Chile' },
  { code: 'bci',         name: 'BCI' },
  { code: 'santander',   name: 'Banco Santander' },
  { code: 'estado',      name: 'Banco Estado' },
  { code: 'scotiabank',  name: 'Scotiabank' },
  { code: 'itau',        name: 'Itaú' },
  { code: 'falabella',   name: 'Banco Falabella' },
  { code: 'ripley',      name: 'Banco Ripley' },
  { code: 'consorcio',   name: 'Banco Consorcio' },
  { code: 'security',    name: 'Banco Security' },
  { code: 'bice',        name: 'BICE' },
  { code: 'coopeuch',    name: 'Coopeuch' },
  { code: 'tenpo',       name: 'Tenpo' },
  { code: 'mercadopago', name: 'Mercado Pago' },
] as const

export const ACCOUNT_TYPES = [
  { code: 'corriente', name: 'Cuenta Corriente' },
  { code: 'vista',     name: 'Cuenta Vista / RUT' },
  { code: 'ahorro',    name: 'Cuenta de Ahorro' },
] as const

export type BankCode        = typeof CHILEAN_BANKS[number]['code']
export type AccountTypeCode = typeof ACCOUNT_TYPES[number]['code']

import { vi } from 'vitest'

export const prismaMock = {
  service: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  professional: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  weeklySchedule: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  scheduleBlock: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
  },
  appointment: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  client: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
  },
  $transaction: vi.fn(),
}

export function resetMocks() {
  Object.values(prismaMock).forEach((model) => {
    if (model && typeof model === 'object') {
      Object.values(model).forEach((fn) => {
        if (typeof fn === 'function' && 'mockReset' in fn) fn.mockReset()
      })
    }
  })
  if (typeof prismaMock.$transaction === 'function' && 'mockReset' in prismaMock.$transaction) {
    prismaMock.$transaction.mockReset()
  }
}

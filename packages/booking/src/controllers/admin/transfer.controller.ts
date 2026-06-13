import type { Request, Response } from 'express'
import { z } from 'zod'
import { ACCOUNT_TYPES, CHILEAN_BANKS, getBankName } from '../../data/banks.js'
import { prisma } from '../../lib/prisma.js'
import { fail, ok } from '../../lib/response.js'

const bankCodes        = CHILEAN_BANKS.map(b => b.code) as [string, ...string[]]
const accountTypeCodes = ACCOUNT_TYPES.map(t => t.code) as [string, ...string[]]

const updateSchema = z.object({
  transferRut:           z.string().min(1).optional(),
  transferBank:          z.enum(bankCodes).optional(),
  transferAccountType:   z.enum(accountTypeCodes).optional(),
  transferAccountNumber: z.string().min(1).optional(),
  transferEmail:         z.string().email().optional(),
})

export async function getTransferConfig(req: Request, res: Response): Promise<void> {
  const professionalId = process.env.PROFESSIONAL_ID ?? ''
  const professional = await prisma.professional.findUnique({ where: { id: professionalId } })
  if (!professional) {
    fail(res, 'Professional not found', 404)
    return
  }
  ok(res, {
    transferRut:           professional.transferRut,
    transferBank:          professional.transferBank,
    bankName:              professional.transferBank ? getBankName(professional.transferBank) : null,
    transferAccountType:   professional.transferAccountType,
    transferAccountNumber: professional.transferAccountNumber,
    transferEmail:         professional.transferEmail,
    banks:                 CHILEAN_BANKS,
    accountTypes:          ACCOUNT_TYPES,
  })
}

export async function updateTransferConfig(req: Request, res: Response): Promise<void> {
  const parsed = updateSchema.safeParse(req.body)
  if (!parsed.success) {
    fail(res, parsed.error.issues[0]?.message ?? 'Invalid body', 400)
    return
  }
  if (Object.keys(parsed.data).length === 0) {
    fail(res, 'No fields to update', 400)
    return
  }

  const professionalId = process.env.PROFESSIONAL_ID ?? ''
  const professional = await prisma.professional.findUnique({ where: { id: professionalId } })
  if (!professional) {
    fail(res, 'Professional not found', 404)
    return
  }

  const updated = await prisma.professional.update({
    where: { id: professionalId },
    data: parsed.data,
  })
  ok(res, {
    transferRut:           updated.transferRut,
    transferBank:          updated.transferBank,
    bankName:              updated.transferBank ? getBankName(updated.transferBank) : null,
    transferAccountType:   updated.transferAccountType,
    transferAccountNumber: updated.transferAccountNumber,
    transferEmail:         updated.transferEmail,
  })
}

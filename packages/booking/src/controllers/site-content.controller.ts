import type { Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { fail, ok } from '../lib/response.js'
import type { Prisma } from '../generated/prisma/index.js'

// Free-form JSON blocks; each site decides their shape. The cap keeps a stray paste
// (e.g. an image as data URL) from bloating every page load.
const MAX_VALUE_BYTES = 20_000
const keySchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/, 'Invalid key')
const bodySchema = z.object({ value: z.unknown() })

async function contentMap(professionalId: string): Promise<Record<string, unknown>> {
  const rows = await prisma.siteContent.findMany({ where: { professionalId } })
  return Object.fromEntries(rows.map((r) => [r.key, r.value]))
}

export async function getPublicSiteContent(_req: Request, res: Response): Promise<void> {
  ok(res, await contentMap(process.env.PROFESSIONAL_ID ?? ''))
}

export async function getAdminSiteContent(req: Request, res: Response): Promise<void> {
  ok(res, await contentMap(req.professionalId ?? ''))
}

export async function putSiteContent(req: Request, res: Response): Promise<void> {
  const key = keySchema.safeParse(String(req.params.key))
  const body = bodySchema.safeParse(req.body)
  if (!key.success || !body.success || body.data.value === undefined || body.data.value === null) {
    fail(res, key.success ? 'value is required' : 'Invalid key', 400)
    return
  }
  if (JSON.stringify(body.data.value).length > MAX_VALUE_BYTES) {
    fail(res, 'Content too large', 413)
    return
  }
  const professionalId = req.professionalId ?? ''
  const value = body.data.value as Prisma.InputJsonValue
  const row = await prisma.siteContent.upsert({
    where: { professionalId_key: { professionalId, key: key.data } },
    create: { professionalId, key: key.data, value },
    update: { value },
  })
  ok(res, { key: row.key, value: row.value, updatedAt: row.updatedAt })
}

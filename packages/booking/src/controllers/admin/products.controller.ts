import type { Request, Response } from 'express'
import { z } from 'zod'
import { Prisma } from '../../generated/prisma/index.js'
import { prisma } from '../../lib/prisma.js'
import { fail, ok } from '../../lib/response.js'
import { eventConfigSchema, eventPublishProblems, type EventConfig } from '../../lib/events.js'
import { productImageFields } from '../../lib/product-images.js'
import { IMAGE_DATA_URL_PATTERN, MAX_IMAGE_DATA_URL_LENGTH, PRODUCT_TYPES, serializeProduct, slugify } from '../../lib/products.js'

const productBodySchema = z.object({
  type: z.enum(PRODUCT_TYPES),
  name: z.string().trim().min(1, 'El nombre es obligatorio').max(120),
  summary: z.string().trim().min(1, 'La descripción breve es obligatoria').max(300),
  description: z.string().max(10_000).optional(),
  price: z.number().int().min(0),
  imageData: z
    .union([
      z
        .string()
        .regex(IMAGE_DATA_URL_PATTERN, 'La foto debe ser jpeg/png/webp')
        .max(MAX_IMAGE_DATA_URL_LENGTH, 'La foto es demasiado grande (máx. ~3MB)'),
      z.null(),
    ])
    .optional(),
  externalUrl: z.union([z.string().trim().url('El enlace debe empezar con https://').startsWith('https://', 'El enlace debe empezar con https://'), z.literal(''), z.null()]).optional(),
  eventDate: z.union([z.string().datetime({ offset: true }), z.null()]).optional(),
  isPublished: z.boolean().optional(),
  eventConfig: z.union([eventConfigSchema, z.null()]).optional(),
})

/** Un evento solo se publica si su configuración está completa; como borrador se guarda igual. */
function publishProblems(type: string, price: number, isPublished: boolean, config: EventConfig | null | undefined): string | null {
  if (type !== 'event' || !isPublished) return null
  const problems = eventPublishProblems(eventConfigSchema.parse(config ?? {}), price)
  return problems.length ? `No se puede publicar todavía: ${problems.join('; ')}` : null
}

function zodMessage(error: z.ZodError): string {
  const issue = error.issues[0]
  if (!issue) return 'Invalid body'
  const path = issue.path.join('.')
  return path.startsWith('eventConfig') ? `${issue.message} (${path})` : issue.message
}

const reorderSchema = z.object({ ids: z.array(z.string().min(1)).min(1) })

async function toData(body: Partial<z.infer<typeof productBodySchema>>) {
  const { externalUrl, eventDate, eventConfig, imageData, ...rest } = body
  return {
    ...rest,
    ...(await productImageFields(imageData)),
    ...(eventConfig !== undefined ? { eventConfig: eventConfig ?? Prisma.DbNull } : {}),
    ...(externalUrl !== undefined ? { externalUrl: externalUrl || null } : {}),
    ...(eventDate !== undefined ? { eventDate: eventDate ? new Date(eventDate) : null } : {}),
    // La fecha del evento vive en su configuración; se copia a eventDate para el catálogo.
    ...(eventConfig?.startsAt ? { eventDate: new Date(eventConfig.startsAt) } : {}),
  }
}

async function uniqueSlug(name: string): Promise<string> {
  const base = slugify(name)
  for (let n = 1; ; n++) {
    const slug = n === 1 ? base : `${base}-${n}`
    if (!(await prisma.product.findUnique({ where: { slug }, select: { id: true } }))) return slug
  }
}

export async function listAdminProducts(req: Request, res: Response): Promise<void> {
  const products = await prisma.product.findMany({
    where: { professionalId: req.professionalId ?? '' },
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
  })
  ok(res, products.map(serializeProduct))
}

export async function createProduct(req: Request, res: Response): Promise<void> {
  const parsed = productBodySchema.safeParse(req.body)
  if (!parsed.success) {
    fail(res, zodMessage(parsed.error), 400)
    return
  }
  const problem = publishProblems(parsed.data.type, parsed.data.price, parsed.data.isPublished ?? false, parsed.data.eventConfig)
  if (problem) {
    fail(res, problem, 400)
    return
  }
  const professionalId = req.professionalId ?? ''
  const last = await prisma.product.findFirst({ where: { professionalId }, orderBy: { position: 'desc' }, select: { position: true } })
  const product = await prisma.product.create({
    data: {
      ...(await toData(parsed.data)),
      type: parsed.data.type,
      name: parsed.data.name,
      summary: parsed.data.summary,
      price: parsed.data.price,
      eventConfig: parsed.data.type === 'event' ? (parsed.data.eventConfig ?? eventConfigSchema.parse({})) : Prisma.DbNull,
      externalUrl: parsed.data.externalUrl || null,
      eventDate: parsed.data.eventConfig?.startsAt
        ? new Date(parsed.data.eventConfig.startsAt)
        : parsed.data.eventDate ? new Date(parsed.data.eventDate) : null,
      professionalId,
      slug: await uniqueSlug(parsed.data.name),
      position: (last?.position ?? -1) + 1,
    },
  })
  ok(res, serializeProduct(product), 201)
}

/** El slug no cambia al renombrar, para no romper enlaces ya compartidos. */
export async function updateProduct(req: Request, res: Response): Promise<void> {
  const parsed = productBodySchema.partial().safeParse(req.body)
  if (!parsed.success) {
    fail(res, zodMessage(parsed.error), 400)
    return
  }
  const id = String(req.params.id)
  const existing = await prisma.product.findFirst({ where: { id, professionalId: req.professionalId ?? '' } })
  if (!existing) {
    fail(res, 'Product not found', 404)
    return
  }
  const problem = publishProblems(
    parsed.data.type ?? existing.type,
    parsed.data.price ?? existing.price,
    parsed.data.isPublished ?? existing.isPublished,
    parsed.data.eventConfig !== undefined ? parsed.data.eventConfig : (existing.eventConfig as EventConfig | null),
  )
  if (problem) {
    fail(res, problem, 400)
    return
  }
  const product = await prisma.product.update({ where: { id }, data: await toData(parsed.data) })
  ok(res, serializeProduct(product))
}

export async function deleteProduct(req: Request, res: Response): Promise<void> {
  const id = String(req.params.id)
  const existing = await prisma.product.findFirst({ where: { id, professionalId: req.professionalId ?? '' }, select: { id: true } })
  if (!existing) {
    fail(res, 'Product not found', 404)
    return
  }
  const registrations = await prisma.eventRegistration.count({ where: { productId: id } })
  if (registrations > 0) {
    fail(res, 'Este evento tiene inscripciones: ocúltalo en vez de eliminarlo (o elimina primero las inscripciones).', 409)
    return
  }
  await prisma.product.delete({ where: { id } })
  ok(res, { id })
}

/** Recibe los ids en el orden en que deben mostrarse. */
export async function reorderProducts(req: Request, res: Response): Promise<void> {
  const parsed = reorderSchema.safeParse(req.body)
  if (!parsed.success) {
    fail(res, 'ids (array) is required', 400)
    return
  }
  const professionalId = req.professionalId ?? ''
  const owned = await prisma.product.findMany({ where: { professionalId, id: { in: parsed.data.ids } }, select: { id: true } })
  if (owned.length !== parsed.data.ids.length) {
    fail(res, 'Product not found', 404)
    return
  }
  await prisma.$transaction(parsed.data.ids.map((id, position) => prisma.product.update({ where: { id }, data: { position } })))
  const products = await prisma.product.findMany({ where: { professionalId }, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] })
  ok(res, products.map(serializeProduct))
}

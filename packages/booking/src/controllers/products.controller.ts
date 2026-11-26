import type { Request, Response } from 'express'
import { prisma } from '../lib/prisma.js'
import { fail, ok } from '../lib/response.js'
import type { Product } from '../generated/prisma/index.js'
import { IMAGE_DATA_URL_PATTERN, serializeProduct } from '../lib/products.js'
import { parseEventConfig, publicAvailability, publicEventConfig } from '../lib/events.js'
import { eventAvailability } from '../lib/event-registrations.js'

function professionalId(): string {
  return process.env.PROFESSIONAL_ID ?? ''
}

/** En la web, un evento muestra su configuración pública y los cupos; los demás productos no la tienen. */
async function serializePublicProduct(product: Product) {
  const { eventConfig, ...rest } = serializeProduct(product)
  void eventConfig
  if (product.type !== 'event') return { ...rest, event: null }
  const now = new Date()
  const config = parseEventConfig(product.eventConfig)
  return {
    ...rest,
    event: { config: publicEventConfig(config, now), availability: publicAvailability(await eventAvailability(product, now), config) },
  }
}

export async function listPublicProducts(_req: Request, res: Response): Promise<void> {
  const products = await prisma.product.findMany({
    where: { professionalId: professionalId(), isPublished: true },
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
  })
  ok(res, await Promise.all(products.map(serializePublicProduct)))
}

export async function getPublicProduct(req: Request, res: Response): Promise<void> {
  const product = await prisma.product.findFirst({
    where: { slug: String(req.params.slug), professionalId: professionalId(), isPublished: true },
  })
  if (!product) {
    fail(res, 'Product not found', 404)
    return
  }
  ok(res, await serializePublicProduct(product))
}

/** La URL lleva ?v=<updatedAt>, así que se puede cachear largo: una foto nueva cambia la URL. */
export async function getProductImage(req: Request, res: Response): Promise<void> {
  const product = await prisma.product.findFirst({
    where: { id: String(req.params.id), professionalId: professionalId() },
    select: { imageData: true, imageThumbData: true },
  })
  const data = (req.query.size === 'thumb' && product?.imageThumbData) || product?.imageData
  const match = data ? IMAGE_DATA_URL_PATTERN.exec(data) : null
  if (!data || !match) {
    fail(res, 'Image not found', 404)
    return
  }
  res.set({
    'Content-Type': `image/${match[1]}`,
    'Cache-Control': 'public, max-age=31536000, immutable',
    'Cross-Origin-Resource-Policy': 'cross-origin',
  })
  res.send(Buffer.from(data.slice(data.indexOf(',') + 1), 'base64'))
}

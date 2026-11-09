import type { Request, Response } from 'express'
import { prisma } from '../lib/prisma.js'
import { fail, ok } from '../lib/response.js'
import { IMAGE_DATA_URL_PATTERN, serializeProduct } from '../lib/products.js'

function professionalId(): string {
  return process.env.PROFESSIONAL_ID ?? ''
}

export async function listPublicProducts(_req: Request, res: Response): Promise<void> {
  const products = await prisma.product.findMany({
    where: { professionalId: professionalId(), isPublished: true },
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
  })
  ok(res, products.map(serializeProduct))
}

export async function getPublicProduct(req: Request, res: Response): Promise<void> {
  const product = await prisma.product.findFirst({
    where: { slug: String(req.params.slug), professionalId: professionalId(), isPublished: true },
  })
  if (!product) {
    fail(res, 'Product not found', 404)
    return
  }
  ok(res, serializeProduct(product))
}

/** La URL lleva ?v=<updatedAt>, así que se puede cachear largo: una foto nueva cambia la URL. */
export async function getProductImage(req: Request, res: Response): Promise<void> {
  const product = await prisma.product.findFirst({
    where: { id: String(req.params.id), professionalId: professionalId() },
    select: { imageData: true },
  })
  const match = product?.imageData ? IMAGE_DATA_URL_PATTERN.exec(product.imageData) : null
  if (!product?.imageData || !match) {
    fail(res, 'Image not found', 404)
    return
  }
  res.set({
    'Content-Type': `image/${match[1]}`,
    'Cache-Control': 'public, max-age=31536000, immutable',
    'Cross-Origin-Resource-Policy': 'cross-origin',
  })
  res.send(Buffer.from(product.imageData.slice(product.imageData.indexOf(',') + 1), 'base64'))
}

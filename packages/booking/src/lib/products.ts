import type { Product } from '../generated/prisma/index.js'

export const PRODUCT_TYPES = ['ebook', 'toy', 'workshop'] as const

// Mismo formato y tope que la foto de perfil (ver professional.controller.ts).
export const MAX_IMAGE_DATA_URL_LENGTH = 4_500_000
export const IMAGE_DATA_URL_PATTERN = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/

/** "Taller de crianza respetuosa" → "taller-de-crianza-respetuosa" */
export function slugify(text: string): string {
  const slug = text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
  return slug || 'producto'
}

/** La foto no viaja en el JSON (puede pesar MB): se sirve aparte, versionada con updatedAt. */
export function serializeProduct(product: Product) {
  const { imageData, ...rest } = product
  return {
    ...rest,
    imageUrl: imageData ? `/api/products/${product.id}/image?v=${product.updatedAt.getTime()}` : null,
  }
}

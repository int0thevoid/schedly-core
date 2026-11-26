import { beforeEach, describe, expect, it, vi } from 'vitest'
import sharp from 'sharp'

vi.mock('../lib/prisma.js', () => ({ prisma: prismaMock }))

import { prismaMock, resetMocks } from './helpers/prisma-mock.js'
import { optimizeImageDataUrl, optimizeStoredProductImages, productImageFields } from '../lib/product-images.js'
import { serializeProduct } from '../lib/products.js'

/** Foto "de celular": 3000×2000 JPEG con ruido (no se comprime sola) y EXIF con orientación. */
async function phonePhoto(): Promise<string> {
  const width = 3000
  const height = 2000
  const raw = Buffer.alloc(width * height * 3)
  for (let i = 0; i < raw.length; i++) raw[i] = (i * 2654435761) % 251
  const jpeg = await sharp(raw, { raw: { width, height, channels: 3 } })
    .jpeg({ quality: 95 })
    .withMetadata({ orientation: 6 })
    .toBuffer()
  return `data:image/jpeg;base64,${jpeg.toString('base64')}`
}

async function decode(dataUrl: string) {
  return sharp(Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64')).metadata()
}

beforeEach(() => resetMocks())

describe('optimizeImageDataUrl', () => {
  it('resizes to WebP, applies orientation, strips metadata and makes a thumbnail', async () => {
    const original = await phonePhoto()
    const result = await optimizeImageDataUrl(original)
    expect(result).not.toBeNull()
    const full = await decode(result!.imageData)
    const thumb = await decode(result!.imageThumbData)
    expect(full.format).toBe('webp')
    // Orientación 6 = rotada 90°: 3000×2000 pasa a vertical.
    expect([full.width, full.height]).toEqual([800, 1200])
    expect([thumb.width, thumb.height]).toEqual([427, 640])
    expect(full.exif).toBeUndefined()
    expect(result!.imageData.length).toBeLessThan(original.length)
    expect(result!.imageThumbData.length).toBeLessThan(result!.imageData.length)
  }, 20_000)

  it('returns null for something that is not an image (the upload is kept as is)', async () => {
    expect(await optimizeImageDataUrl('data:image/png;base64,iVBORw0KGgo=')).toBeNull()
    expect(await productImageFields('data:image/png;base64,iVBORw0KGgo=')).toEqual({ imageData: 'data:image/png;base64,iVBORw0KGgo=', imageThumbData: null })
    expect(await productImageFields(null)).toEqual({ imageData: null, imageThumbData: null })
    expect(await productImageFields(undefined)).toEqual({})
  })
})

describe('optimizeStoredProductImages', () => {
  it('optimizes photos uploaded before thumbnails existed', async () => {
    prismaMock.product.findMany.mockResolvedValue([{ id: 'p1', imageData: await phonePhoto() }])
    expect(await optimizeStoredProductImages()).toBe(1)
    expect(prismaMock.product.findMany.mock.calls[0][0].where).toEqual({ imageData: { not: null }, imageThumbData: null })
    const data = prismaMock.product.update.mock.calls[0][0].data
    expect(data.imageData).toMatch(/^data:image\/webp;base64,/)
    expect(data.imageThumbData).toMatch(/^data:image\/webp;base64,/)
  }, 20_000)
})

describe('serializeProduct', () => {
  const base = { id: 'p1', updatedAt: new Date(1000), imageData: 'x', imageThumbData: 'y' } as Parameters<typeof serializeProduct>[0]
  it('exposes the thumbnail URL and never the image payloads', () => {
    const s = serializeProduct(base)
    expect(s).toMatchObject({ imageUrl: '/api/products/p1/image?v=1000', thumbUrl: '/api/products/p1/image?v=1000&size=thumb' })
    expect(s).not.toHaveProperty('imageData')
    expect(s).not.toHaveProperty('imageThumbData')
    expect(serializeProduct({ ...base, imageThumbData: null }).thumbUrl).toBe('/api/products/p1/image?v=1000')
  })
})

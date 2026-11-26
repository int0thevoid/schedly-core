import sharp from 'sharp'
import { prisma } from './prisma.js'

/**
 * Fotos de la vitrina livianas (US-124). Stefany sube fotos directo del celular: el backend las
 * re-codifica en WebP, las gira según la orientación de la cámara, les quita los metadatos (EXIF/GPS)
 * y guarda dos tamaños: uno para la ficha y una miniatura para las tarjetas del catálogo.
 */

const FULL_SIZE = 1200
const FULL_QUALITY = 78
const THUMB_SIZE = 640
const THUMB_QUALITY = 74

interface OptimizedImage {
  imageData: string
  imageThumbData: string
}

async function toWebp(input: Buffer, size: number, quality: number): Promise<string> {
  const out = await sharp(input)
    .rotate()
    .resize({ width: size, height: size, fit: 'inside', withoutEnlargement: true })
    .webp({ quality })
    .toBuffer()
  return `data:image/webp;base64,${out.toString('base64')}`
}

/** null si la imagen no se pudo procesar: en ese caso se guarda tal como llegó (no se pierde la subida). */
export async function optimizeImageDataUrl(dataUrl: string): Promise<OptimizedImage | null> {
  try {
    const input = Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64')
    const [imageData, imageThumbData] = await Promise.all([
      toWebp(input, FULL_SIZE, FULL_QUALITY),
      toWebp(input, THUMB_SIZE, THUMB_QUALITY),
    ])
    // Si la original ya era más liviana (ej. un WebP chico), se conserva la original.
    return { imageData: imageData.length < dataUrl.length ? imageData : dataUrl, imageThumbData }
  } catch (err) {
    console.error('[product-images] no se pudo optimizar la foto', err)
    return null
  }
}

/** Datos de foto para guardar: optimizada si se pudo; null quita la foto y su miniatura. */
export async function productImageFields(imageData: string | null | undefined) {
  if (imageData === undefined) return {}
  if (imageData === null) return { imageData: null, imageThumbData: null }
  return (await optimizeImageDataUrl(imageData)) ?? { imageData, imageThumbData: null }
}

/**
 * Optimiza las fotos subidas antes de US-124 (sin miniatura). Corre al iniciar el servidor: al
 * desplegar, las fotos existentes quedan livianas sin pasos manuales. Cambia updatedAt, así que la
 * URL de la foto cambia y los navegadores no usan la copia antigua.
 */
export async function optimizeStoredProductImages(): Promise<number> {
  const pending = await prisma.product.findMany({
    where: { imageData: { not: null }, imageThumbData: null },
    select: { id: true, imageData: true },
  })
  let done = 0
  for (const product of pending) {
    if (!product.imageData) continue
    const optimized = await optimizeImageDataUrl(product.imageData)
    if (!optimized) continue
    await prisma.product.update({ where: { id: product.id }, data: optimized })
    done++
  }
  return done
}

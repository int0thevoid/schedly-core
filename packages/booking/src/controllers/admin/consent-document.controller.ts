import type { Request, Response } from 'express'
import { z } from 'zod'
import sanitizeHtml from 'sanitize-html'
import { prisma } from '../../lib/prisma.js'
import { fail, ok } from '../../lib/response.js'
import type { ConsentDocument } from '../../generated/prisma/index.js'

const updateSchema = z.object({
  title: z.string().trim().min(1, 'title is required'),
  content: z.string().trim().min(1, 'content is required'),
})

const DEFAULT_TITLE = 'Política de almacenamiento de datos'
const DEFAULT_CONTENT =
  '<p>Al autorizar el almacenamiento de tus datos, tu nombre, correo y teléfono quedarán guardados para ' +
  'facilitar el agendamiento de futuras citas sin necesidad de ingresarlos nuevamente.</p>' +
  '<p>Tus datos son utilizados exclusivamente por el profesional y no son compartidos con terceros. ' +
  'Puedes solicitar su eliminación en cualquier momento.</p>' +
  '<p>Esta autorización es opcional y no afecta el agendamiento de tu cita.</p>'

// Solo las herramientas de formato que expone el editor del panel admin (heading, párrafo,
// listas, negrita/cursiva) — cualquier otra etiqueta o atributo (incluido <script>, onerror, etc.)
// se descarta al guardar, para que el contenido nunca pueda inyectar HTML/JS arbitrario en el
// flujo público de agendamiento.
const ALLOWED_TAGS = ['h1', 'h2', 'h3', 'p', 'ul', 'ol', 'li', 'strong', 'em', 'b', 'i', 'br']

function sanitizeConsentContent(content: string): string {
  return sanitizeHtml(content, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {},
  })
}

function serialize(doc: ConsentDocument) {
  return {
    title: doc.title,
    content: doc.content,
    updatedAt: doc.updatedAt,
    updatedById: doc.updatedById,
  }
}

// upsert (no findUnique + create) para que sea atómico: dos requests concurrentes
// (dos pestañas, doble carga de la pantalla) no deben chocar contra la unique constraint
// de professionalId — reproducido en producción como P2002.
async function getOrCreateDocument(professionalId: string): Promise<ConsentDocument> {
  return prisma.consentDocument.upsert({
    where: { professionalId },
    create: { professionalId, title: DEFAULT_TITLE, content: DEFAULT_CONTENT },
    update: {},
  })
}

/** Endpoint público (sin autenticación): el flujo de agendamiento lo usa para mostrar el
 * consentimiento vigente. Si aún no existe un documento configurado, devuelve el texto por
 * defecto sin crear una fila — evita que una visita anónima dispare escrituras en la base. */
export async function getPublicConsentDocument(_req: Request, res: Response): Promise<void> {
  const professionalId = process.env.PROFESSIONAL_ID ?? ''
  const doc = await prisma.consentDocument.findUnique({ where: { professionalId } })
  ok(res, {
    title: doc?.title ?? DEFAULT_TITLE,
    content: doc?.content ?? DEFAULT_CONTENT,
  })
}

export async function getConsentDocument(req: Request, res: Response): Promise<void> {
  const professionalId = req.professionalId ?? ''
  const doc = await getOrCreateDocument(professionalId)
  ok(res, serialize(doc))
}

export async function updateConsentDocument(req: Request, res: Response): Promise<void> {
  const parsed = updateSchema.safeParse(req.body)
  if (!parsed.success) {
    fail(res, parsed.error.issues[0]?.message ?? 'Invalid body', 400)
    return
  }

  const professionalId = req.professionalId ?? ''
  const content = sanitizeConsentContent(parsed.data.content)
  if (!content.trim()) {
    fail(res, 'content is required', 400)
    return
  }

  const doc = await prisma.consentDocument.upsert({
    where: { professionalId },
    create: { professionalId, title: parsed.data.title, content, updatedById: professionalId },
    update: { title: parsed.data.title, content, updatedById: professionalId },
  })
  ok(res, serialize(doc))
}

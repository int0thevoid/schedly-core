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

// Este controlador sirve dos documentos legales con el mismo shape (title/content) y la misma
// lógica de saneamiento — se distinguen por `type` en vez de duplicar el archivo entero.
type PolicyDocumentType = 'data_storage' | 'cancellation'

interface PolicyDefaults {
  title: string
  content: string
}

const DATA_STORAGE_DEFAULTS: PolicyDefaults = {
  title: 'Política de almacenamiento de datos',
  content:
    '<p>Al autorizar el almacenamiento de tus datos, tu nombre, correo y teléfono quedarán guardados para ' +
    'facilitar el agendamiento de futuras citas sin necesidad de ingresarlos nuevamente.</p>' +
    '<p>Tus datos son utilizados exclusivamente por el profesional y no son compartidos con terceros. ' +
    'Puedes solicitar su eliminación en cualquier momento.</p>' +
    '<p>Esta autorización es opcional y no afecta el agendamiento de tu cita.</p>',
}

// Mismo texto que el `POLICY_ITEMS` hardcodeado en BookingWizard.tsx antes de US-070/US-071 —
// para que el contenido por defecto no cambie lo que ve el paciente el día del deploy.
const CANCELLATION_DEFAULTS: PolicyDefaults = {
  title: 'Política de cancelación',
  content:
    '<ul>' +
    '<li>Puedes reagendar con mínimo 24 horas de anticipación</li>' +
    '<li>Las sesiones deben confirmarse el día anterior</li>' +
    '<li>Sesiones no canceladas a tiempo no son reembolsadas</li>' +
    '<li>En caso de atraso, tienes 15 minutos de tolerancia</li>' +
    '<li>El informe psicológico tiene costo adicional de $25.000 y plazo de 10 días hábiles</li>' +
    '</ul>',
}

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
// de (professionalId, type) — reproducido en producción como P2002.
async function getOrCreateDocument(professionalId: string, type: PolicyDocumentType, defaults: PolicyDefaults): Promise<ConsentDocument> {
  return prisma.consentDocument.upsert({
    where: { professionalId_type: { professionalId, type } },
    create: { professionalId, type, title: defaults.title, content: defaults.content },
    update: {},
  })
}

/** Endpoint público (sin autenticación): el flujo de agendamiento lo usa para mostrar el
 * documento vigente. Si aún no existe un documento configurado, devuelve el texto por
 * defecto sin crear una fila — evita que una visita anónima dispare escrituras en la base. */
async function getPublicDocument(type: PolicyDocumentType, defaults: PolicyDefaults, res: Response): Promise<void> {
  const professionalId = process.env.PROFESSIONAL_ID ?? ''
  const doc = await prisma.consentDocument.findUnique({ where: { professionalId_type: { professionalId, type } } })
  ok(res, {
    title: doc?.title ?? defaults.title,
    content: doc?.content ?? defaults.content,
  })
}

async function getDocument(req: Request, res: Response, type: PolicyDocumentType, defaults: PolicyDefaults): Promise<void> {
  const professionalId = req.professionalId ?? ''
  const doc = await getOrCreateDocument(professionalId, type, defaults)
  ok(res, serialize(doc))
}

async function updateDocument(req: Request, res: Response, type: PolicyDocumentType): Promise<void> {
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
    where: { professionalId_type: { professionalId, type } },
    create: { professionalId, type, title: parsed.data.title, content, updatedById: professionalId },
    update: { title: parsed.data.title, content, updatedById: professionalId },
  })
  ok(res, serialize(doc))
}

export async function getPublicConsentDocument(_req: Request, res: Response): Promise<void> {
  return getPublicDocument('data_storage', DATA_STORAGE_DEFAULTS, res)
}

export async function getConsentDocument(req: Request, res: Response): Promise<void> {
  return getDocument(req, res, 'data_storage', DATA_STORAGE_DEFAULTS)
}

export async function updateConsentDocument(req: Request, res: Response): Promise<void> {
  return updateDocument(req, res, 'data_storage')
}

export async function getPublicCancellationPolicy(_req: Request, res: Response): Promise<void> {
  return getPublicDocument('cancellation', CANCELLATION_DEFAULTS, res)
}

export async function getCancellationPolicy(req: Request, res: Response): Promise<void> {
  return getDocument(req, res, 'cancellation', CANCELLATION_DEFAULTS)
}

export async function updateCancellationPolicy(req: Request, res: Response): Promise<void> {
  return updateDocument(req, res, 'cancellation')
}

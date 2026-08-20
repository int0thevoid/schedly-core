export {}

declare global {
  namespace Express {
    interface Request {
      /** Id del profesional autenticado, extraído del JWT por `requireAuth`. Undefined en rutas públicas. */
      professionalId?: string
    }
  }
}

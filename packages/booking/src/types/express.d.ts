export {}

declare global {
  namespace Express {
    interface Request {
      /** Id del profesional autenticado, extraído del JWT por `requireAuth`. Undefined en rutas públicas. */
      professionalId?: string
      /** Id de la cuenta adicional del panel (AdminUser), si no entró la profesional. */
      adminUserId?: string
    }
  }
}

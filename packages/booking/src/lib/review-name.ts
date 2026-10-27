/** Utilidades de nombres para reseñas (US-072/097). */

function tokens(name: string): string[] {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z\s.]/g, ' ')
    .split(/\s+/)
    .map((t) => t.replace(/\./g, ''))
    .filter(Boolean)
}

/**
 * ¿El nombre que escribió la paciente corresponde a su nombre real? Acepta cualquier parte del
 * nombre real e iniciales ("María G.", "Andrea", "M. González"), pero al menos una parte debe ser
 * un nombre completo. Si no coincide, la reseña queda "pendiente de verificar".
 */
export function displayNameMatches(displayName: string, realName: string): boolean {
  const given = tokens(displayName)
  const real = tokens(realName)
  if (given.length === 0 || real.length === 0) return false
  const fullMatches = given.filter((g) => g.length > 1 && real.includes(g))
  if (fullMatches.length === 0) return false
  return given.every((g) => (g.length === 1 ? real.some((r) => r.startsWith(g)) : real.includes(g)))
}

/** "Claudia Betanzo" → "C.B." (reseñas importadas: se publican solo con iniciales). */
export function initials(name: string): string | null {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return null
  return parts.slice(0, 3).map((p) => `${p[0]!.toUpperCase()}.`).join('')
}

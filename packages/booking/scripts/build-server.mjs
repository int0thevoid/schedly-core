// Empaqueta el backend en dist/server.mjs para arrancarlo con `node` en vez de `tsx` (menos memoria:
// sin compilar TypeScript en caliente ni procesos extra). Se incluye el código propio y los paquetes del
// monorepo (@schedly/notifications se publica como TypeScript) y Prisma; quedan afuera solo las dependencias
// con binarios nativos (sharp, bcrypt), que se cargan desde node_modules.
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

// Con pnpm, algunas dependencias internas de Prisma solo están en el directorio oculto de pnpm.
const pnpmHoisted = fileURLToPath(new URL('../../../node_modules/.pnpm/node_modules', import.meta.url))

await build({
  entryPoints: ['src/server.ts'],
  outfile: 'dist/server.mjs',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: true,
  external: ['sharp', 'bcrypt', 'pg-native'],
  nodePaths: [pnpmHoisted],
  // Algunas dependencias CommonJS usan require(): en ESM hay que proveerlo.
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  logLevel: 'warning',
})

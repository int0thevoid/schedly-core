// Crea (o actualiza la contraseña de) una cuenta adicional del panel.
// Uso: DATABASE_URL=... PROFESSIONAL_ID=... ADMIN_PASSWORD=... pnpm admin-user <email> "<nombre>"
// La contraseña va por variable de entorno para que no quede en el historial de la terminal ni en el repo.
import { PrismaClient } from '../src/generated/prisma/index.js'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import bcrypt from 'bcrypt'

const [email, name] = process.argv.slice(2)
const password = process.env.ADMIN_PASSWORD ?? ''
const professionalId = process.env.PROFESSIONAL_ID ?? ''
if (!email || !name || password.length < 8 || !professionalId) {
  console.error('Uso: DATABASE_URL=... PROFESSIONAL_ID=... ADMIN_PASSWORD=<mín. 8> pnpm admin-user <email> "<nombre>"')
  process.exit(1)
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) })

async function main(): Promise<void> {
  const normalized = email.toLowerCase()
  if (await prisma.professional.findUnique({ where: { email: normalized } })) {
    throw new Error('Ese correo ya es el de la profesional: usa otro')
  }
  const passwordHash = await bcrypt.hash(password, 10)
  const user = await prisma.adminUser.upsert({
    where: { email: normalized },
    create: { email: normalized, name, passwordHash, professionalId },
    update: { name, passwordHash },
  })
  console.log(`Cuenta del panel lista: ${user.email} (${user.id})`)
}

main()
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
    await pool.end()
  })

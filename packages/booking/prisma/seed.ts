import { PrismaClient } from '../src/generated/prisma/index.js'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import bcrypt from 'bcrypt'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log('🌱 Seeding Stefany Osorio Alfaro...')

  const passwordHash = await bcrypt.hash('stefany2024', 10)

  const transferPlaceholder = {
    transferRut:           'XX.XXX.XXX-X (por confirmar)',
    transferBank:          null,
    transferAccountType:   null,
    transferAccountNumber: null,
    transferEmail:         null,
  }

  const professional = await prisma.professional.upsert({
    where: { email: 'stefanyosorioalfaro@gmail.com' },
    update: { ...transferPlaceholder, passwordHash },
    create: {
      name: 'Ps. Stefany Osorio Alfaro',
      email: 'stefanyosorioalfaro@gmail.com',
      phone: '+56966898588',
      timezone: 'America/Santiago',
      bookingWindowWeeks: 4,
      minAdvanceBusinessDays: 2,
      defaultBufferMinutes: 15,
      passwordHash,
      ...transferPlaceholder,
    },
  })
  console.log(`✅ Professional: ${professional.name} (${professional.id})`)

  const existingServices = await prisma.service.count({ where: { professionalId: professional.id } })
  if (existingServices === 0) {
    await prisma.service.createMany({
      data: [
        { professionalId: professional.id, name: 'Psicoterapia Adulto Particular/Isapre Presencial',      description: 'Sesión de psicoterapia individual para adultos, modalidad presencial.',                               duration: 45, price: 30000, modality: 'presential', bufferMinutes: 15, isActive: true },
        { professionalId: professional.id, name: 'Psicoterapia Adulto Fonasa Presencial',                  description: 'Sesión de psicoterapia individual para adultos con cobertura Fonasa, modalidad presencial.',          duration: 45, price: 25000, modality: 'presential', bufferMinutes: 15, isActive: true },
        { professionalId: professional.id, name: 'Psicoterapia Infanto/Juvenil Particular/Isapre Presencial', description: 'Sesión de psicoterapia para niños y adolescentes (desde 8 años), modalidad presencial.',          duration: 45, price: 30000, modality: 'presential', bufferMinutes: 15, isActive: true },
        { professionalId: professional.id, name: 'Psicoterapia Adulto Particular/Isapre Online',           description: 'Sesión de psicoterapia individual para adultos, modalidad online.',                                  duration: 45, price: 30000, modality: 'online',      bufferMinutes: 15, isActive: true },
        { professionalId: professional.id, name: 'Psicoterapia Adulto Fonasa Online',                      description: 'Sesión de psicoterapia individual para adultos con cobertura Fonasa, modalidad online.',             duration: 45, price: 25000, modality: 'online',      bufferMinutes: 15, isActive: true },
        { professionalId: professional.id, name: 'Terapia de Parejas Presencial',                          description: 'Sesión de terapia para parejas, modalidad presencial.',                                             duration: 50, price: 44000, modality: 'presential', bufferMinutes: 15, isActive: true },
        { professionalId: professional.id, name: 'Terapia Familiar Presencial',                            description: 'Sesión de terapia familiar, modalidad presencial.',                                                  duration: 50, price: 45000, modality: 'presential', bufferMinutes: 15, isActive: true },
        { professionalId: professional.id, name: 'Certificado para Animal de Compañía',                    description: 'Evaluación y certificado psicológico para animal de compañía terapéutico.',                         duration: 45, price: 30000, modality: 'presential', bufferMinutes: 15, isActive: true },
        { professionalId: professional.id, name: 'Certificados Psicológicos',                              description: 'Emisión de certificados psicológicos para distintos fines.',                                        duration: 45, price: 30000, modality: 'presential', bufferMinutes: 15, isActive: true },
        { professionalId: professional.id, name: 'Informe Psicológico',                                    description: 'Elaboración de informe psicológico completo.',                                                      duration: 45, price: 60000, modality: 'presential', bufferMinutes: 15, isActive: true },
        { professionalId: professional.id, name: 'Certificado OS10',                                       description: 'Certificado psicológico para tenencia responsable de armas (OS10).',                               duration: 45, price: 30000, modality: 'presential', bufferMinutes: 15, isActive: true },
      ],
    })
  }
  const totalServices = await prisma.service.count({ where: { professionalId: professional.id } })
  console.log(`✅ Servicios: ${totalServices} en la base de datos`)

  await prisma.weeklySchedule.deleteMany({ where: { professionalId: professional.id } })
  await prisma.weeklySchedule.createMany({
    data: [
      { professionalId: professional.id, dayOfWeek: 1, startTime: '14:00', endTime: '19:00', serviceIds: [] },
      { professionalId: professional.id, dayOfWeek: 2, startTime: '14:00', endTime: '19:00', serviceIds: [] },
      { professionalId: professional.id, dayOfWeek: 3, startTime: '14:00', endTime: '19:00', serviceIds: [] },
      { professionalId: professional.id, dayOfWeek: 4, startTime: '14:00', endTime: '19:00', serviceIds: [] },
      { professionalId: professional.id, dayOfWeek: 5, startTime: '14:00', endTime: '19:00', serviceIds: [] },
      { professionalId: professional.id, dayOfWeek: 6, startTime: '10:00', endTime: '13:00', serviceIds: [] },
    ],
  })
  console.log('✅ Horario semanal: lunes–viernes 14:00–19:00, sábado 10:00–13:00')

  console.log('\n🎉 Seed completado.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => pool.end())

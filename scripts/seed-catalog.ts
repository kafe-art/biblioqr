import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { seedCatalog } from './seed-data'

const db = new PrismaClient()
db.$transaction(async tx => {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('biblioqr.seed-catalog'))`
  return seedCatalog(tx)
}, { timeout: 120000 }).then(n => console.log('Títulos añadidos:', n))
  .catch(() => { console.error('No se pudo cargar el catálogo.'); process.exitCode = 1 }).finally(() => db.$disconnect())

import { randomBytes } from 'node:crypto'
import { PrismaClient } from '@prisma/client'

// Each suite owns a fresh PostgreSQL schema. Never fall back to the application database.
export function testDatabase() {
  const configured = process.env.TEST_DATABASE_URL
  if (!configured) throw new Error('Configura TEST_DATABASE_URL con una base PostgreSQL de pruebas.')
  const url = new URL(configured)
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('TEST_DATABASE_URL requiere PostgreSQL.')
  const schema = 'biblioqr_test_' + randomBytes(12).toString('hex')
  url.searchParams.set('schema',schema)
  const databaseUrl = url.toString()
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
  async function clean() {
    try { await prisma.$executeRawUnsafe('DROP SCHEMA IF EXISTS "' + schema + '" CASCADE') }
    finally { await prisma.$disconnect() }
  }
  return { databaseUrl, prisma, clean }
}

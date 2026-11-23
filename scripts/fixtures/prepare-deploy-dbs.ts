import 'dotenv/config'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PrismaClient } from '@prisma/client'

export const FRESH_DB_NAME = 'biblioqr_fresh'
export const OLD_DB_NAME = 'biblioqr_old'

export const LEGACY_TABLES = [
  'User',
  'Book',
  'Copy',
  'Reservation',
  'Loan',
  'Fine',
  'AuditEntry',
  'EmailCode',
] as const

export const V4_TABLES = [
  'usuarios',
  'reservas',
  'reserva_detalle',
  'ejemplares',
  'libros',
  'categorias',
  'sanciones',
  'incidencias',
  'notificaciones',
  'auditoria',
  'email_codes',
] as const

const prismaCli = createRequire(import.meta.url).resolve('prisma/build/index.js')

export function resolveBasePgUrl(): string {
  const configured = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL
  if (!configured) {
    throw new Error('Configura TEST_DATABASE_URL o DATABASE_URL con una conexión PostgreSQL.')
  }
  const url = new URL(configured)
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('Se requiere una URL PostgreSQL.')
  }
  url.searchParams.delete('schema')
  return url.toString()
}

export function dbUrlFor(baseUrl: string, databaseName: string): string {
  const url = new URL(baseUrl)
  url.pathname = '/' + databaseName
  url.searchParams.delete('schema')
  return url.toString()
}

export function adminDbUrl(baseUrl: string): string {
  return dbUrlFor(baseUrl, 'postgres')
}

function assertSafeIdentifier(name: string): void {
  if (!/^[a-zA-Z0-9_]+$/.test(name)) {
    throw new Error(`Nombre de base inválido: ${name}`)
  }
}

async function terminateConnections(client: PrismaClient, databaseName: string): Promise<void> {
  assertSafeIdentifier(databaseName)
  await client.$executeRawUnsafe(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
    databaseName,
  )
}

export async function databaseExists(adminUrl: string, databaseName: string): Promise<boolean> {
  assertSafeIdentifier(databaseName)
  const client = new PrismaClient({ datasources: { db: { url: adminUrl } } })
  try {
    const rows = await client.$queryRawUnsafe<{ exists: boolean }[]>(
      `SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname = $1) AS exists`,
      databaseName,
    )
    return Boolean(rows[0]?.exists)
  } finally {
    await client.$disconnect()
  }
}

export async function recreateDatabase(adminUrl: string, databaseName: string, templateName?: string): Promise<void> {
  assertSafeIdentifier(databaseName)
  if (templateName) assertSafeIdentifier(templateName)

  const client = new PrismaClient({ datasources: { db: { url: adminUrl } } })
  try {
    await terminateConnections(client, databaseName)
    if (templateName) await terminateConnections(client, templateName)
    await client.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${databaseName}"`)
    const sql = templateName
      ? `CREATE DATABASE "${databaseName}" TEMPLATE "${templateName}"`
      : `CREATE DATABASE "${databaseName}"`
    await client.$executeRawUnsafe(sql)
  } finally {
    await client.$disconnect()
  }
}

export async function dropDatabaseIfExists(adminUrl: string, databaseName: string): Promise<void> {
  assertSafeIdentifier(databaseName)
  const client = new PrismaClient({ datasources: { db: { url: adminUrl } } })
  try {
    await terminateConnections(client, databaseName)
    await client.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${databaseName}"`)
  } finally {
    await client.$disconnect()
  }
}

export function pushLegacySchemaFromHead(targetDbUrl: string): void {
  const headSchema = execFileSync('git', ['show', 'HEAD:prisma/schema.prisma'], { encoding: 'utf8' })
  const pgSchema = headSchema.replace(/provider\s*=\s*"(?:sqlite|postgresql)"/, 'provider = "postgresql"')
  const tempDir = mkdtempSync(join(tmpdir(), 'biblioqr-legacy-schema-'))
  const schemaPath = join(tempDir, 'schema.prisma')

  try {
    writeFileSync(schemaPath, pgSchema, 'utf8')
    execFileSync(
      process.execPath,
      [prismaCli, 'db', 'push', '--skip-generate', '--accept-data-loss', '--schema', schemaPath],
      {
        cwd: tempDir,
        env: { ...process.env, DATABASE_URL: targetDbUrl },
        stdio: 'pipe',
      },
    )
  } finally {
    try {
      rmSync(tempDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
    } catch {
      // Best-effort cleanup of temp folder on Windows if file handles linger briefly.
    }
  }
}

export async function seedLegacyRecords(targetDbUrl: string): Promise<void> {
  const db = new PrismaClient({ datasources: { db: { url: targetDbUrl } } })
  try {
    await db.$executeRawUnsafe(
      `INSERT INTO "User" ("id", "code", "email", "name", "role", "status", "passwordHash", "faculty", "career", "ip", "lastAccess")
       VALUES
         ('u-old-1', 'OLD-ADM-1', 'old-admin@unp.edu.pe', 'Admin Antiguo', 'admin'::"Role", 'active'::"UserStatus", '', 'Ingeniería', '', '127.0.0.1', NOW()),
         ('u-old-2', 'OLD-EST-1', 'old-student@alumnos.unp.edu.pe', 'Estudiante Antiguo', 'student'::"Role", 'active'::"UserStatus", '', 'Ciencias', 'Matemática', '127.0.0.1', NOW())`,
    )

    await db.$executeRawUnsafe(
      `INSERT INTO "Book" ("id", "isbn", "title", "author", "year", "genre", "faculties", "synopsis", "format", "pages", "location", "addedAt", "demand", "coverUrl")
       VALUES
         ('b-old-1', '9780000000001', 'Libro Legado 1', 'Autor Legado', 2020, 'Tecnología', '["Ingeniería"]'::jsonb, 'Registro antiguo de prueba.', 'fisico', 250, '{"pavilion":"A","shelf":1,"row":1,"col":1}'::jsonb, NOW(), 5, NULL)`,
    )

    await db.$executeRawUnsafe(
      `INSERT INTO "Copy" ("id", "bookId", "condition", "status")
       VALUES
         ('c-old-1', 'b-old-1', 'excelente'::"CopyCondition", 'loaned'::"CopyStatus"),
         ('c-old-2', 'b-old-1', 'regular'::"CopyCondition", 'reserved'::"CopyStatus")`,
    )

    await db.$executeRawUnsafe(
      `INSERT INTO "Reservation" ("id", "code", "bookId", "copyId", "userId", "createdAt", "pickupAt", "expiresAt", "method", "locker", "status", "nonce", "consumedAt")
       VALUES
         ('r-old-1', 'RES-OLD-001', 'b-old-1', 'c-old-2', 'u-old-2', NOW(), NOW() + INTERVAL '2 hours', NOW() + INTERVAL '1 day', 'desk'::"PickupMethod", NULL, 'pending'::"ReservationStatus", 'nonce-old-1', NULL)`,
    )

    await db.$executeRawUnsafe(
      `INSERT INTO "Loan" ("id", "bookId", "copyId", "userId", "loanedAt", "dueAt", "returnedAt", "renewals")
       VALUES
         ('l-old-1', 'b-old-1', 'c-old-1', 'u-old-2', NOW() - INTERVAL '20 days', NOW() - INTERVAL '6 days', NULL, 0)`,
    )

    await db.$executeRawUnsafe(
      `INSERT INTO "Fine" ("id", "userId", "loanId", "bookId", "days", "amount", "createdAt", "status")
       VALUES
         ('f-old-1', 'u-old-2', 'l-old-1', 'b-old-1', 6, 9.0, NOW(), 'pending'::"FineStatus")`,
    )

    await db.$executeRawUnsafe(
      `INSERT INTO "AuditEntry" ("id", "ts", "actorName", "actorRole", "action", "detail", "ip")
       VALUES
         ('a-old-1', NOW(), 'Admin Antiguo', 'admin', 'seed', 'Registro legado en esquema v3', '127.0.0.1')`,
    )

    await db.$executeRawUnsafe(
      `INSERT INTO "EmailCode" ("id", "email", "purpose", "codeHash", "attempts", "expiresAt", "createdAt")
       VALUES
         ('ec-old-1', 'old-student@alumnos.unp.edu.pe', 'login', 'legacyhash', 0, NOW() + INTERVAL '10 minutes', NOW())`,
    )
  } finally {
    await db.$disconnect()
  }
}

export async function prepareLocalDeployDatabases(baseUrl = resolveBasePgUrl()): Promise<{
  freshUrl: string
  oldUrl: string
}> {
  const adminUrl = adminDbUrl(baseUrl)
  const freshUrl = dbUrlFor(baseUrl, FRESH_DB_NAME)
  const oldUrl = dbUrlFor(baseUrl, OLD_DB_NAME)

  await recreateDatabase(adminUrl, FRESH_DB_NAME)
  await recreateDatabase(adminUrl, OLD_DB_NAME)
  pushLegacySchemaFromHead(oldUrl)
  await seedLegacyRecords(oldUrl)

  return { freshUrl, oldUrl }
}

const isDirectRun = process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/fixtures/prepare-deploy-dbs.ts')
if (isDirectRun) {
  prepareLocalDeployDatabases()
    .then(({ freshUrl, oldUrl }) => {
      console.log(`Bases listas:\n- fresh: ${freshUrl}\n- old:   ${oldUrl}`)
    })
    .catch(err => {
      console.error('Error preparando bases:', err)
      process.exitCode = 1
    })
}

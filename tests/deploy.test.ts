import 'dotenv/config'
import assert from 'node:assert/strict'
import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { randomBytes, randomInt } from 'node:crypto'
import { once } from 'node:events'
import { test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { PrismaClient } from '@prisma/client'
import { SEED } from '../src/data/seed'
import {
  FRESH_DB_NAME,
  LEGACY_TABLES,
  OLD_DB_NAME,
  V4_TABLES,
  adminDbUrl,
  databaseExists,
  dbUrlFor,
  dropDatabaseIfExists,
  pushLegacySchemaFromHead,
  recreateDatabase,
  resolveBasePgUrl,
  seedLegacyRecords,
} from '../scripts/fixtures/prepare-deploy-dbs'

const EXPECTED_BOOKS = SEED.books.length
const EXPECTED_CATEGORIES = new Set(SEED.books.map(b => b.genre)).size
const EXPECTED_COPIES = SEED.books.reduce((total, book) => total + book.copies.length, 0)

function stopProcessTree(child: ChildProcess): void {
  if (!child.pid || child.exitCode !== null) return
  if (process.platform === 'win32') {
    try {
      execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
      return
    } catch {
      // Fallback to standard kill if process already exited.
    }
  } else {
    try {
      process.kill(-child.pid, 'SIGTERM')
      return
    } catch {
      // Fallback to direct kill.
    }
  }
  child.kill()
}

async function runStartRenderOnce(databaseUrl: string, adminEmail: string): Promise<void> {
  const port = randomInt(32000, 45000)
  const origin = `http://127.0.0.1:${port}`
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    DATABASE_URL: databaseUrl,
    NODE_ENV: 'production',
    PORT: String(port),
    CORS_ORIGIN: origin,
    ADMIN_EMAIL: adminEmail,
    JWT_SECRET: randomBytes(32).toString('hex'),
    QR_HMAC_SECRET: randomBytes(32).toString('hex'),
    STUDENT_EMAIL_DOMAIN: 'alumnos.unp.edu.pe',
    BREVO_API_KEY: '',
    MAIL_FROM_EMAIL: '',
    MAIL_FROM_NAME: 'BiblioQR',
    POLICY_LOAN_DAYS: '14',
    POLICY_RENEWAL_DAYS: '7',
    POLICY_MAX_RENEWALS: '2',
    POLICY_MAX_LOANS: '3',
    POLICY_HOLD_HOURS: '24',
    POLICY_FINE_PER_DAY: '1.5',
    POLICY_CURRENCY: 'S/',
    POLICY_WARN_DAYS: '3',
  }

  const child = process.platform === 'win32'
    ? spawn('cmd.exe', ['/d', '/s', '/c', 'npm run start:render'], {
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    : spawn('npm', ['run', 'start:render'], {
        env,
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      })

  let output = ''
  child.stdout?.on('data', chunk => {
    output += chunk.toString()
  })
  child.stderr?.on('data', chunk => {
    output += chunk.toString()
  })
  const closed = once(child, 'close')

  try {
    let ready = false
    for (let attempt = 0; attempt < 240 && child.exitCode === null; attempt++) {
      const response = await fetch(`${origin}/api/auth/config`, {
        signal: AbortSignal.timeout(500),
      }).catch(() => null)
      if (response?.ok) {
        ready = true
        break
      }
      await delay(250)
    }
    assert.ok(ready, `npm run start:render no inició correctamente (exitCode=${child.exitCode}):\n${output}`)
  } finally {
    stopProcessTree(child)
    await Promise.race([closed, delay(5000)])
  }
}

async function listPublicTables(db: PrismaClient): Promise<string[]> {
  const rows = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename
  `
  return rows.map(r => r.tablename)
}

async function collectV4Counts(db: PrismaClient): Promise<Record<string, number>> {
  const counts: Record<string, number> = {}
  for (const table of V4_TABLES) {
    const rows = await db.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT COUNT(*)::bigint AS count FROM "public"."${table}"`,
    )
    counts[table] = Number(rows[0]?.count ?? 0)
  }
  return counts
}

async function verifyV4State(db: PrismaClient, adminEmail: string): Promise<Record<string, number>> {
  const tables = await listPublicTables(db)

  for (const expected of V4_TABLES) {
    assert.ok(tables.includes(expected), `Falta la tabla v4 "${expected}". Tablas presentes: ${tables.join(', ')}`)
  }
  assert.ok(tables.includes('_prisma_migrations'), 'Falta la tabla _prisma_migrations tras render-migrate.')

  for (const legacy of LEGACY_TABLES) {
    assert.ok(!tables.includes(legacy), `La tabla antigua "${legacy}" sigue presente en public.`)
  }

  const [guards] = await db.$queryRaw<{ detalle_posicion: boolean; audit_immutable_trigger: boolean }[]>`
    SELECT EXISTS (
      SELECT FROM pg_constraint WHERE conrelid = 'reserva_detalle'::regclass
        AND conname = 'detalle_posicion' AND contype = 'c' AND convalidated
    ) AS detalle_posicion, EXISTS (
      SELECT FROM pg_trigger WHERE tgrelid = 'auditoria'::regclass
        AND tgname = 'audit_immutable_trigger' AND NOT tgisinternal AND tgenabled IN ('O', 'A')
    ) AS audit_immutable_trigger
  `
  assert.deepEqual(guards, { detalle_posicion: true, audit_immutable_trigger: true })

  const admins = await db.usuario.findMany({ where: { email: adminEmail } })
  assert.equal(admins.length, 1, `Se esperaba exactamente 1 admin para ${adminEmail}.`)
  assert.equal(admins[0].rol, 'admin')
  assert.equal(admins[0].activo, true)

  const counts = await collectV4Counts(db)
  assert.equal(counts.categorias, EXPECTED_CATEGORIES, 'Cantidad de categorías del catálogo inesperada.')
  assert.equal(counts.libros, EXPECTED_BOOKS, 'Cantidad de libros del catálogo inesperada.')
  assert.equal(counts.ejemplares, EXPECTED_COPIES, 'Cantidad de ejemplares del catálogo inesperada.')

  return counts
}

async function prepareClonedCaseDb(
  baseUrl: string,
  adminUrl: string,
  sourceName: string,
  kind: 'fresh' | 'old',
): Promise<{ testDbName: string; testDbUrl: string }> {
  const testDbName = `${sourceName}_test_${randomBytes(6).toString('hex')}`
  const testDbUrl = dbUrlFor(baseUrl, testDbName)

  if (await databaseExists(adminUrl, sourceName)) {
    await recreateDatabase(adminUrl, testDbName, sourceName)
  } else {
    await recreateDatabase(adminUrl, testDbName)
    if (kind === 'old') {
      pushLegacySchemaFromHead(testDbUrl)
      await seedLegacyRecords(testDbUrl)
    }
  }

  return { testDbName, testDbUrl }
}

for (const scenario of [
  { kind: 'fresh' as const, sourceName: FRESH_DB_NAME, adminEmail: 'deploy-admin-fresh@unp.edu.pe' },
  { kind: 'old' as const, sourceName: OLD_DB_NAME, adminEmail: 'deploy-admin-old@unp.edu.pe' },
]) {
  test(`start:render migra, siembra y es idempotente sobre ${scenario.sourceName}`, async () => {
    const baseUrl = resolveBasePgUrl()
    const adminUrl = adminDbUrl(baseUrl)
    const { testDbName, testDbUrl } = await prepareClonedCaseDb(baseUrl, adminUrl, scenario.sourceName, scenario.kind)
    const db = new PrismaClient({ datasources: { db: { url: testDbUrl } } })

    try {
      const initialTables = await listPublicTables(db)
      if (scenario.kind === 'fresh') {
        assert.equal(initialTables.length, 0, `${scenario.sourceName} debe iniciar vacía.`)
      } else {
        for (const legacy of LEGACY_TABLES) {
          assert.ok(initialTables.includes(legacy), `${scenario.sourceName} debe contener la tabla antigua ${legacy}.`)
        }
        assert.ok(!initialTables.includes('_prisma_migrations'), `${scenario.sourceName} no debe tener _prisma_migrations.`)
        const [userRows] = await db.$queryRawUnsafe<{ count: bigint }[]>(`SELECT COUNT(*)::bigint AS count FROM "User"`)
        assert.ok(Number(userRows?.count ?? 0) > 0, `${scenario.sourceName} debe contener registros previos.`)
      }
      await db.$disconnect()

      await runStartRenderOnce(testDbUrl, scenario.adminEmail)
      const firstCounts = await verifyV4State(db, scenario.adminEmail)
      const firstAdmin = await db.usuario.findUniqueOrThrow({ where: { email: scenario.adminEmail } })
      await db.$disconnect()

      await runStartRenderOnce(testDbUrl, scenario.adminEmail)
      const secondCounts = await verifyV4State(db, scenario.adminEmail)
      const secondAdmin = await db.usuario.findUniqueOrThrow({ where: { email: scenario.adminEmail } })

      assert.equal(secondAdmin.id, firstAdmin.id, 'La segunda ejecución no debe recrear al administrador.')
      assert.equal(secondAdmin.codigoUsuario, firstAdmin.codigoUsuario)
      assert.deepEqual(secondCounts, firstCounts, 'La segunda ejecución no debe borrar ni duplicar registros.')
    } finally {
      await db.$disconnect()
      await dropDatabaseIfExists(adminUrl, testDbName)
    }
  })
}

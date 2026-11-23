import 'dotenv/config'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()
try {
  const reset = await db.$transaction(async tx => {
    // Serialize the legacy check and reset across concurrent starts.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('biblioqr.render-migrate'))`
    const [state] = await tx.$queryRaw<{ legacy: boolean }[]>`
      SELECT current_schema() = 'public'
        AND to_regclass('public._prisma_migrations') IS NULL
        AND EXISTS (
          SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'User'
        ) AS legacy
    `
    if (!state.legacy) return false
    await tx.$executeRaw`DROP SCHEMA public CASCADE`
    await tx.$executeRaw`CREATE SCHEMA public`
    return true
  })
  if (reset) console.log('Se reinició el esquema antiguo de BiblioQR.')
} finally {
  await db.$disconnect()
}

const cli = createRequire(import.meta.url).resolve('prisma/build/index.js')
execFileSync(process.execPath, [cli, 'migrate', 'deploy'], { stdio: 'inherit' })

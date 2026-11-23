import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { randomBytes, randomInt } from 'node:crypto'
import { once } from 'node:events'
import { test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { testDatabase } from './database'

test('el arranque tras prisma db push instala detalle_posicion y audit_immutable_trigger', async () => {
  const { databaseUrl, prisma, clean } = testDatabase()
  const port = randomInt(30000, 40000)
  const origin = `http://127.0.0.1:${port}`
  const env = {
    ...process.env, DATABASE_URL: databaseUrl, NODE_ENV: 'production', ADMIN_EMAIL: '',
    PORT: String(port), CORS_ORIGIN: origin, JWT_SECRET: randomBytes(32).toString('hex'),
    QR_HMAC_SECRET: randomBytes(32).toString('hex'), POLICY_LOAN_DAYS: '14', POLICY_RENEWAL_DAYS: '7',
    POLICY_MAX_RENEWALS: '2', POLICY_MAX_LOANS: '3', POLICY_HOLD_HOURS: '24',
    POLICY_FINE_PER_DAY: '1.5', POLICY_CURRENCY: 'S/', POLICY_WARN_DAYS: '3',
  }
  const protections = () => prisma.$queryRaw<{ detalle_posicion: boolean; audit_immutable_trigger: boolean }[]>`
    SELECT EXISTS (
      SELECT FROM pg_constraint WHERE conrelid = 'reserva_detalle'::regclass
        AND conname = 'detalle_posicion' AND contype = 'c' AND convalidated
    ) AS detalle_posicion, EXISTS (
      SELECT FROM pg_trigger WHERE tgrelid = 'auditoria'::regclass
        AND tgname = 'audit_immutable_trigger' AND NOT tgisinternal AND tgenabled IN ('O', 'A')
    ) AS audit_immutable_trigger
  `

  try {
    execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'db', 'push', '--skip-generate'], { env })
    assert.deepEqual(await protections(), [{ detalle_posicion: false, audit_immutable_trigger: false }])

    const server = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], { env, stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr = ''
    server.stderr.on('data', chunk => { stderr += chunk.toString() })
    const stopped = once(server, 'close')
    try {
      let ready = false
      for (let attempt = 0; attempt < 100 && server.exitCode === null; attempt++) {
        const response = await fetch(origin + '/api/auth/config', { signal: AbortSignal.timeout(500) }).catch(() => null)
        if (response?.ok) { ready = true; break }
        await delay(100)
      }
      assert.ok(ready, 'El servidor no completó el arranque. ' + stderr)
      assert.deepEqual(await protections(), [{ detalle_posicion: true, audit_immutable_trigger: true }])
    } finally {
      server.kill()
      await stopped
    }
  } finally {
    await clean()
  }
})

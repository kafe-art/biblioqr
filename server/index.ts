import express from 'express'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import helmet from 'helmet'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { db } from './db'
import { env } from './env'
import { sweepExpired } from './domain'
import { errorHandler, HttpError } from './http'
import { authRoutes, codeFromEmail, nameFromEmail } from './routes/auth'
import { catalogRoutes } from './routes/catalog'
import { reservationRoutes } from './routes/reservations'
import { circulationRoutes } from './routes/circulation'
import { fineRoutes } from './routes/fines'
import { adminRoutes } from './routes/admin'
import { reportRoutes } from './routes/reports'

export const app = express()
app.disable('x-powered-by')
// Behind Render's proxy: needed for correct client IPs (rate limit) and secure cookies.
if (env.NODE_ENV === 'production') app.set('trust proxy', 1)
app.use(helmet({
  contentSecurityPolicy: { directives: { 'img-src': ["'self'", 'data:', 'blob:', 'https:'] } },
}))
app.use(cors({ origin: env.CORS_ORIGIN, credentials: true, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] }))
// Origin checks guard the API only; page navigations from other sites (links) must still load the SPA.
app.use('/api', (req, _res, next) => {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers.origin && req.headers.origin !== env.CORS_ORIGIN) { next(new HttpError(403, 'Origen de solicitud no permitido.')); return }
  if (req.headers['sec-fetch-site'] === 'cross-site') { next(new HttpError(403, 'Origen de solicitud no permitido.')); return }
  next()
})
app.use(express.json({ limit: '2mb' }))
app.use(cookieParser())
app.use('/api', authRoutes, catalogRoutes, reservationRoutes, circulationRoutes, fineRoutes, reportRoutes, adminRoutes)
// In production the same service serves the built SPA (vite build -> dist/).
const clientDir = resolve(process.cwd(), 'dist')
if (env.NODE_ENV === 'production' && existsSync(clientDir)) {
  app.use(express.static(clientDir, { index: false, maxAge: '1h' }))
  app.get(/^(?!\/api(?:\/|$)).*/, (_req, res) => { res.sendFile(resolve(clientDir, 'index.html')) })
}
app.use((_req, res) => { res.status(404).json({ ok: false, error: 'Ruta no encontrada.' }) })
app.use(errorHandler)

async function start() {
  await db.$connect()
  // Database-level append-only enforcement, even for accidental ORM updates.
  if (env.DATABASE_URL.startsWith('file:')) {
    await db.$executeRaw`CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON "AuditEntry" BEGIN SELECT RAISE(ABORT, 'AuditEntry append-only'); END`
    await db.$executeRaw`CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON "AuditEntry" BEGIN SELECT RAISE(ABORT, 'AuditEntry append-only'); END`
  } else {
    await db.$executeRaw`CREATE OR REPLACE FUNCTION audit_immutable() RETURNS trigger LANGUAGE plpgsql AS 'BEGIN RAISE EXCEPTION ''AuditEntry append-only''; END;'`
    await db.$executeRaw`DROP TRIGGER IF EXISTS audit_immutable_trigger ON "AuditEntry"`
    await db.$executeRaw`CREATE TRIGGER audit_immutable_trigger BEFORE UPDATE OR DELETE OR TRUNCATE ON "AuditEntry" FOR EACH STATEMENT EXECUTE FUNCTION audit_immutable()`
  }
  // The owner's account (ADMIN_EMAIL) always exists as an active administrator.
  if (env.ADMIN_EMAIL) {
    const owner = await db.user.findUnique({ where: { email: env.ADMIN_EMAIL } })
    if (!owner) await db.user.create({ data: { email: env.ADMIN_EMAIL, name: nameFromEmail(env.ADMIN_EMAIL), role: 'admin', code: await codeFromEmail(db, env.ADMIN_EMAIL, 'P-') } })
    else if (owner.role !== 'admin' || owner.status !== 'active') await db.user.update({ where: { id: owner.id }, data: { role: 'admin', status: 'active' } })
  }
  await sweepExpired()
  let sweeping = false
  const timer = setInterval(async () => {
    if (sweeping) return
    sweeping = true
    try { await sweepExpired() } catch { console.error('No se pudo ejecutar la caducidad de reservas.') } finally { sweeping = false }
  }, 20000)
  timer.unref()
  const server = app.listen(env.PORT, () => console.log(`BiblioQR API en puerto ${env.PORT}`))
  const stop = () => { clearInterval(timer); server.close(() => { void db.$disconnect().then(() => process.exit(0)) }) }
  process.once('SIGINT', stop); process.once('SIGTERM', stop)
}
start().catch(() => { console.error('No se pudo iniciar BiblioQR. Verifica la configuración y las migraciones.'); process.exitCode = 1 })

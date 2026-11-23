import { Router, type Request, type Response } from 'express'
import { createHmac, randomInt, randomUUID, timingSafeEqual } from 'node:crypto'
import { rateLimit } from 'express-rate-limit'
import { userDto } from '../dto'
import type { Usuario } from '@prisma/client'
import { z } from 'zod'
import { actor, checkPassword, cookieOptions, hashPassword, issueJwt, requireAuth, requirePermission, SESSION_MS } from '../auth'
import { db, transaction, type Tx } from '../db'
import { audit, snapshot } from '../domain'
import { env } from '../env'
import { emptyBody, fail, route } from '../http'
import { sendCodeEmail, type CodePurpose } from '../mail'

export const authRoutes = Router()

const CODE_MINUTES = 10
const RESEND_SECONDS = 60
const MAX_ATTEMPTS = 5
const MAX_CODES_PER_HOUR = 6

const limiter = (limit: number) => rateLimit({ windowMs: 15 * 60 * 1000, limit, standardHeaders: 'draft-8', legacyHeaders: false, handler: (_req, res) => { res.status(429).json({ ok: false, error: 'Demasiados intentos. Intenta más tarde.' }) } })
const email = z.string().trim().toLowerCase().email().max(254)
const otp = z.string().trim().regex(/^\d{6}$/)
export const isStudentEmail = (value: string) => value.endsWith('@' + env.STUDENT_EMAIL_DOMAIN)
const studentDomainError = () => `Acceso restringido. Por favor, ingresa tu correo institucional oficial (@${env.STUDENT_EMAIL_DOMAIN}).`

const hashCode = (address: string, purpose: CodePurpose, code: string) => createHmac('sha256', env.JWT_SECRET).update(`${purpose}:${address}:${code}`).digest()

async function issueCode(address: string, purpose: CodePurpose) {
  const now = Date.now()
  const recent = await db.emailCode.findMany({ where: { email: address, purpose, createdAt: { gt: new Date(now - 60 * 60 * 1000) } }, orderBy: { createdAt: 'desc' } })
  const wait = recent[0] ? Math.ceil((recent[0].createdAt.getTime() + RESEND_SECONDS * 1000 - now) / 1000) : 0
  if (wait > 0) fail(429, `Espera ${wait} s antes de pedir otro código.`)
  if (recent.length >= MAX_CODES_PER_HOUR) fail(429, 'Solicitaste demasiados códigos. Intenta nuevamente en una hora.')
  const code = randomInt(0, 1_000_000).toString().padStart(6, '0')
  // Only the newest code is valid: retire older ones, and drop stale rows.
  await db.emailCode.updateMany({ where: { email: address, purpose, expiresAt: { gt: new Date(now) } }, data: { expiresAt: new Date(0) } })
  await db.emailCode.deleteMany({ where: { createdAt: { lt: new Date(now - 24 * 60 * 60 * 1000) } } })
  const row = await db.emailCode.create({ data: { email: address, purpose, codeHash: hashCode(address, purpose, code).toString('hex'), expiresAt: new Date(now + CODE_MINUTES * 60 * 1000) } })
  try { await sendCodeEmail(address, code, purpose, CODE_MINUTES) }
  catch (error) { await db.emailCode.delete({ where: { id: row.id } }); throw error }
}

async function consumeCode(address: string, purpose: CodePurpose, code: string) {
  const latest = await db.emailCode.findFirst({ where: { email: address, purpose }, orderBy: { createdAt: 'desc' } })
  if (!latest || latest.expiresAt.getTime() < Date.now()) fail(400, 'El código caducó o ya fue usado. Solicita uno nuevo.')
  if (latest!.attempts >= MAX_ATTEMPTS) fail(429, 'Demasiados intentos fallidos. Solicita un código nuevo.')
  const valid = timingSafeEqual(Buffer.from(latest!.codeHash, 'hex'), hashCode(address, purpose, code))
  if (!valid) {
    const left = MAX_ATTEMPTS - latest!.attempts - 1
    await db.emailCode.update({ where: { id: latest!.id }, data: { attempts: { increment: 1 } } })
    fail(400, left > 0 ? `Código incorrecto. Te quedan ${left} intento${left === 1 ? '' : 's'}.` : 'Demasiados intentos fallidos. Solicita un código nuevo.')
  }
  await db.emailCode.update({ where: { id: latest!.id }, data: { expiresAt: new Date(0) } })
}

/** Readable name and unique library code derived from the email's local part. */
export function nameFromEmail(address: string) {
  const words = address.split('@')[0].replace(/\d+/g, ' ').split(/[._-]+|\s+/).filter(Boolean)
  return words.length ? words.map(w => w[0].toLocaleUpperCase('es') + w.slice(1)).join(' ') : address.split('@')[0]
}
export async function codeFromEmail(tx: Tx, address: string, prefix = '') {
  const base = prefix + address.split('@')[0].toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 30) || prefix + 'USUARIO'
  for (let n = 0; ; n++) {
    const code = n ? `${base}-${n + 1}` : base
    if (!await tx.usuario.findUnique({ where: { codigoUsuario: code } })) return code
  }
}

async function startSession(req: Request, res: Response, user: Usuario, detail: string) {
  const current = await transaction(async tx => {
    const updated = await tx.usuario.update({ where: { id: user.id }, data: { ultimoAcceso: new Date(), ip: req.ip ?? '' } })
    await audit(tx, updated, 'auth', detail, 'usuarios', user.id, { ultimoAcceso: user.ultimoAcceso }, { ultimoAcceso: updated.ultimoAcceso })
    return updated
  })
  res.cookie('session', issueJwt(current), { ...cookieOptions, maxAge: SESSION_MS }).json({ user: userDto(current) })
}

authRoutes.get('/auth/config', (_req, res) => { res.json({ studentDomain: env.STUDENT_EMAIL_DOMAIN }) })

// --- Students: passwordless code sent to the institutional inbox -------------
authRoutes.post('/auth/send-otp', limiter(10), route(async (req, res) => {
  const input = z.object({ email }).strict().parse(req.body)
  if (!isStudentEmail(input.email)) fail(400, studentDomainError())
  const existing = await db.usuario.findUnique({ where: { email: input.email } })
  if (existing && !existing.activo) fail(403, 'Tu cuenta está bloqueada. Acércate a la biblioteca para más información.')
  await issueCode(input.email, 'login')
  res.json({ ok: true, expiresInMinutes: CODE_MINUTES, resendInSeconds: RESEND_SECONDS })
}))

authRoutes.post('/auth/verify-otp', limiter(30), route(async (req, res) => {
  const input = z.object({ email, otp }).strict().parse(req.body)
  if (!isStudentEmail(input.email)) fail(400, studentDomainError())
  await consumeCode(input.email, 'login', input.otp)
  let user = await db.usuario.findUnique({ where: { email: input.email } })
  if (user && !user.activo) fail(403, 'Tu cuenta está bloqueada. Acércate a la biblioteca para más información.')
  if (!user) {
    user = await transaction(async tx => {
      const created = await tx.usuario.create({ data: { email: input.email, nombres: nameFromEmail(input.email), rol: 'student', codigoUsuario: await codeFromEmail(tx, input.email) } })
      await audit(tx, created, 'user', `Registro de estudiante ${created.id} verificado por correo.`)
      return created
    })
  }
  await startSession(req, res, user, 'Inicio de sesión con código por correo.')
}))

// --- Staff: personal email + password granted by an administrator ------------
const dummyHash = hashPassword(randomUUID())
authRoutes.post('/auth/login', limiter(20), route(async (req, res) => {
  const input = z.object({ identifier: z.string().trim().min(1).max(254), password: z.string().min(1).max(128) }).strict().parse(req.body)
  const user = await db.usuario.findFirst({ where: { OR: [{ email: input.identifier.toLowerCase() }, { codigoUsuario: input.identifier.toUpperCase() }] } })
  const valid = await checkPassword(input.password, user?.passwordHash || await dummyHash)
  if (!user || !user.passwordHash || !valid || !user.activo) fail(401, 'Correo o contraseña incorrectos.')
  await startSession(req, res, user!, 'Inicio de sesión con contraseña.')
}))

const staffAccount = async (address: string) => {
  const user = await db.usuario.findUnique({ where: { email: address } })
  return user && user.rol !== 'student' && user.activo ? user : null
}
// Always answers the same way so the endpoint does not reveal which emails have access.
authRoutes.post('/auth/staff/send-code', limiter(10), route(async (req, res) => {
  const input = z.object({ email }).strict().parse(req.body)
  if (await staffAccount(input.email)) await issueCode(input.email, 'password')
  res.json({ ok: true, expiresInMinutes: CODE_MINUTES, resendInSeconds: RESEND_SECONDS })
}))

authRoutes.post('/auth/staff/password', limiter(30), route(async (req, res) => {
  const input = z.object({ email, otp, password: z.string().min(10).max(128) }).strict().parse(req.body)
  const user = await staffAccount(input.email)
  if (!user) fail(400, 'El código caducó o ya fue usado. Solicita uno nuevo.')
  await consumeCode(input.email, 'password', input.otp)
  const updated = await db.usuario.update({ where: { id: user!.id }, data: { passwordHash: await hashPassword(input.password) } })
  await startSession(req, res, updated, 'Contraseña creada con código por correo.')
}))

authRoutes.post('/auth/logout', requireAuth, route(async (req, res) => {
  emptyBody.parse(req.body ?? {})
  await transaction(tx => audit(tx, actor(req), 'auth', 'Cierre de sesión.'))
  res.clearCookie('session', cookieOptions).json({ ok: true })
}))
authRoutes.get('/me', requireAuth, route(async (req, res) => res.json({ user: userDto(actor(req)) })))
authRoutes.get('/state', requireAuth, requirePermission('catalog:read'), route(async (req, res) => res.json(await snapshot(actor(req)))))

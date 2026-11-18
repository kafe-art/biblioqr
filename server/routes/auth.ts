import { Router } from 'express'
import { randomUUID } from 'node:crypto'
import { rateLimit } from 'express-rate-limit'
import { z } from 'zod'
import { actor, checkPassword, cookieOptions, hashPassword, issueJwt, requireAuth, requirePermission } from '../auth'
import { db, transaction } from '../db'
import { audit, snapshot } from '../domain'
import { emptyBody, fail, route, serialize } from '../http'

export const authRoutes = Router()
const loginSchema = z.object({ identifier: z.string().trim().min(1).max(254), password: z.string().min(1).max(128) }).strict()
// Dummy hash equalizes the expensive operation when the account is absent.
const dummyHash = hashPassword(randomUUID())
authRoutes.post('/auth/login', rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false, handler: (_req, res) => { res.status(401).json({ ok: false, error: 'Demasiados intentos. Intenta más tarde.' }) } }), route(async (req, res) => {
  const input = loginSchema.parse(req.body)
  const user = await db.user.findFirst({ where: { OR: [{ email: input.identifier.toLowerCase() }, { code: input.identifier.toUpperCase() }] } })
  const valid = await checkPassword(input.password, user?.passwordHash ?? await dummyHash)
  if (!user || !valid || user.status === 'blocked') return fail(401, 'Identificador o contraseña incorrectos.')
  const current = await transaction(async tx => {
    const updated = await tx.user.update({ where: { id: user.id }, data: { lastAccess: new Date(), ip: req.ip ?? '' } })
    await audit(tx, updated, 'auth', 'Inicio de sesión.')
    return updated
  })
  res.cookie('session', issueJwt(current), { ...cookieOptions, maxAge: 15 * 60 * 1000 }).json({ user: serialize(current) })
}))
authRoutes.post('/auth/logout', requireAuth, route(async (req, res) => {
  emptyBody.parse(req.body ?? {})
  await transaction(tx => audit(tx, actor(req), 'auth', 'Cierre de sesión.'))
  res.clearCookie('session', cookieOptions).json({ ok: true })
}))
authRoutes.get('/me', requireAuth, route(async (req, res) => res.json({ user: serialize(actor(req)) })))
authRoutes.get('/state', requireAuth, requirePermission('catalog:read'), route(async (req, res) => res.json(await snapshot(actor(req)))))

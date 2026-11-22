import type { User } from '@prisma/client'
import type { RequestHandler, Request } from 'express'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { PERMISSIONS, type Permission } from '../shared/access'
import { db } from './db'
import { env } from './env'
import { HttpError } from './http'

declare global { namespace Express { interface Request { user?: User } } }
export const hashPassword = (password: string) => bcrypt.hash(password, 12)
export const checkPassword = (password: string, hash: string) => bcrypt.compare(password, hash)
export const SESSION_MS = 12 * 60 * 60 * 1000
export const cookieOptions = { httpOnly: true, sameSite: 'strict' as const, secure: env.NODE_ENV === 'production', path: '/' }
export const issueJwt = (user: User) => jwt.sign({}, env.JWT_SECRET, { subject: user.id, algorithm: 'HS256', expiresIn: SESSION_MS / 1000, issuer: 'biblioqr', audience: 'biblioqr-web' })
export const requireAuth: RequestHandler = async (req, _res, next) => {
  try {
    const payload = jwt.verify(req.cookies?.session ?? '', env.JWT_SECRET, { algorithms: ['HS256'], issuer: 'biblioqr', audience: 'biblioqr-web' })
    if (typeof payload === 'string' || !payload.sub) throw new Error('JWT inválido')
    const user = await db.user.findUnique({ where: { id: payload.sub } })
    if (!user || user.status !== 'active') { next(new HttpError(401, 'Sesión inválida o cuenta bloqueada.')); return }
    req.user = user
    next()
  } catch { next(new HttpError(401, 'Inicia sesión para continuar.')) }
}
export const actor = (req: Request): User => {
  if (!req.user) throw new HttpError(401, 'Inicia sesión para continuar.')
  return req.user
}
export const requirePermission = (...permissions: Permission[]): RequestHandler => (req, _res, next) => {
  const user = req.user
  if (!user) { next(new HttpError(401, 'Inicia sesión para continuar.')); return }
  next(permissions.some(p => PERMISSIONS[user.role].includes(p)) ? undefined : new HttpError(403, 'Tu rol no tiene permiso para esta acción.'))
}

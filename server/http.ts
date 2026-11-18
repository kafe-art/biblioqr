import type { Request, Response, NextFunction, RequestHandler } from 'express'
import { z } from 'zod'
import { Prisma } from '@prisma/client'

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message) }
}
export const fail = (status: number, message: string): never => { throw new HttpError(status, message) }
export const route = (handler: (req: Request, res: Response) => Promise<unknown>): RequestHandler => (req, res, next) => { Promise.resolve(handler(req, res)).catch(next) }
export const idSchema = z.string().trim().min(1).max(200)
export const paramId = (req: Request) => idSchema.parse(req.params.id)
export const emptyBody = z.object({}).strict()
export const success = (res: Response, value: unknown = {}) => res.json(value)
export function serialize(value: unknown): unknown {
  if (value instanceof Date) return value.getTime()
  if (Array.isArray(value)) return value.map(serialize)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'passwordHash').map(([key, v]) => [key, serialize(v)]))
  return value
}
export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (error instanceof z.ZodError) { res.status(400).json({ ok: false, error: 'Datos inválidos. Revisa los campos enviados.' }); return }
  if (error instanceof HttpError) { res.status(error.status).json({ ok: false, error: error.message }); return }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const status = error.code === 'P2025' ? 404 : ['P2002', 'P2003', 'P2034', 'P1008'].includes(error.code) ? 409 : 500
    res.status(status).json({ ok: false, error: status === 404 ? 'Registro no encontrado.' : status === 409 ? 'Conflicto de datos. Actualiza e intenta nuevamente.' : 'No se pudo completar la operación.' }); return
  }
  const malformed = error instanceof SyntaxError || (error && typeof error === 'object' && 'status' in error && error.status === 413)
  res.status(malformed ? 400 : 500).json({ ok: false, error: malformed ? 'Solicitud inválida.' : 'No se pudo completar la operación.' })
}

import { Router } from 'express'
import { requireAuth, requirePermission } from '../auth'
import { db } from '../db'
import { policy } from '../env'
import { route, serialize } from '../http'
export const catalogRoutes = Router()
catalogRoutes.get('/books', requireAuth, requirePermission('catalog:read'), route(async (_req, res) => res.json({ books: serialize(await db.book.findMany({ include: { copies: true } })) })))
catalogRoutes.get('/policy', requireAuth, requirePermission('catalog:read'), route(async (_req, res) => res.json({ policy })))

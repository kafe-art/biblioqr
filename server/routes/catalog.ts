import { Router } from 'express'
import { requireAuth, requirePermission } from '../auth'
import { db } from '../db'
import { policy } from '../env'
import { bookDto, catalogInclude } from '../dto'
import { route } from '../http'
export const catalogRoutes = Router()
catalogRoutes.get('/books', requireAuth, requirePermission('catalog:read'), route(async (_req, res) => res.json({ books: (await db.libro.findMany({ include: catalogInclude })).map(bookDto) })))
catalogRoutes.get('/policy', requireAuth, requirePermission('catalog:read'), route(async (_req, res) => res.json({ policy })))

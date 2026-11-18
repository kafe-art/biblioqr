import { Router } from 'express'
import { z } from 'zod'
import { actor, hashPassword, requireAuth, requirePermission } from '../auth'
import { db, transaction, type Tx } from '../db'
import { audit, uniqueCode } from '../domain'
import { emptyBody, fail, idSchema, paramId, route, serialize } from '../http'

export const adminRoutes = Router()
adminRoutes.use(requireAuth)
const roleSchema = z.enum(['student', 'librarian', 'admin'])
const faculty = z.enum(['Ingeniería', 'Humanidades', 'Ciencias', 'Ciencias de la Salud', 'Ciencias Empresariales'])
const bookSchema = z.object({
  isbn: z.string().trim().min(1).max(40), title: z.string().trim().min(1).max(300), author: z.string().trim().min(1).max(300),
  year: z.number().int().min(1).max(new Date().getFullYear() + 1), genre: z.string().max(100), faculties: z.array(faculty).max(5),
  synopsis: z.string().max(20000), format: z.enum(['fisico', 'digital', 'ambos']), pages: z.number().int().min(0),
  pavilion: z.enum(['A', 'B', 'C']), copies: z.number().int().min(0).max(1000),
  coverUrl: z.union([z.literal(''), z.string().url().refine(u => ['https:', 'http:'].includes(new URL(u).protocol))]).optional(),
}).strict().refine(b => b.format === 'digital' || b.copies > 0, 'Se requiere un ejemplar físico')
async function saveBook(tx: Tx, input: z.infer<typeof bookSchema>, id?: string) {
  const { pavilion, copies, ...fields } = input
  if (id) {
    const prev = await tx.book.findUnique({ where: { id }, include: { copies: true } })
    if (!prev) return fail(404, 'Libro no encontrado.')
    if (input.format === 'digital' && prev.copies.length) return fail(409, 'No se puede convertir a digital un título con ejemplares físicos.')
    const location = prev.location as { shelf: number; row: number; col: number }
    return tx.book.update({ where: { id }, data: { ...fields, location: { ...location, pavilion } }, include: { copies: true } })
  }
  return tx.book.create({ data: { ...fields, location: { pavilion, shelf: 1, row: 1, col: 1 }, copies: { create: Array.from({ length: input.format === 'digital' ? 0 : copies }, () => ({ id: uniqueCode('EJ') })) } }, include: { copies: true } })
}
adminRoutes.get('/admin/users', requirePermission('user:manage'), route(async (_req, res) => res.json({ users: serialize(await db.user.findMany()) })))
adminRoutes.post('/admin/users', requirePermission('user:manage'), route(async (req, res) => {
  const input = z.object({ code: z.string().trim().min(1).max(40).transform(v => v.toUpperCase()), email: z.string().email().transform(v => v.toLowerCase()), name: z.string().trim().min(1).max(200), role: roleSchema, faculty, career: z.string().max(200).default(''), password: z.string().min(12).max(128) }).strict().parse(req.body)
  const { password, ...fields } = input
  const passwordHash = await hashPassword(password)
  const user = await transaction(async tx => {
    const user = await tx.user.create({ data: { ...fields, passwordHash } })
    await audit(tx, actor(req), 'user', `Alta de usuario ${user.id}.`)
    return user
  })
  res.status(201).json({ user: serialize(user) })
}))
adminRoutes.post('/admin/users/bulk', requirePermission('user:manage'), route(async (req, res) => {
  const input = z.object({ ids: z.array(idSchema).min(1).max(500), op: z.discriminatedUnion('type', [z.object({ type: z.literal('activate') }).strict(), z.object({ type: z.literal('block') }).strict(), z.object({ type: z.literal('role'), role: roleSchema }).strict(), z.object({ type: z.literal('reset'), password: z.string().min(12).max(128) }).strict()]) }).strict().parse(req.body)
  const who = actor(req)
  if (input.ids.includes(who.id) && (input.op.type === 'block' || (input.op.type === 'role' && input.op.role !== 'admin'))) return fail(403, 'No puedes bloquear ni degradar tu propia cuenta.')
  const data = input.op.type === 'activate' ? { status: 'active' as const } : input.op.type === 'block' ? { status: 'blocked' as const } : input.op.type === 'role' ? { role: input.op.role } : { passwordHash: await hashPassword(input.op.password) }
  const count = await transaction(async tx => {
    const changed = await tx.user.updateMany({ where: { id: { in: input.ids } }, data })
    if (!changed.count) return fail(404, 'Usuarios no encontrados.')
    await audit(tx, who, 'user', `Operación ${input.op.type} sobre ${changed.count} usuarios: ${input.ids.join(', ')}.`)
    return changed.count
  })
  res.json({ count })
}))
adminRoutes.get('/admin/audit', requirePermission('audit:read'), route(async (_req, res) => res.json({ audit: serialize(await db.auditEntry.findMany({ orderBy: { seq: 'desc' }, take: 1000 })) })))
adminRoutes.post('/admin/books/import', requirePermission('catalog:write'), route(async (req, res) => {
  const { books } = z.object({ books: z.array(bookSchema).min(1).max(1000) }).strict().parse(req.body)
  const result = await transaction(async tx => {
    let created = 0; let skipped = 0
    for (const input of books) {
      if (await tx.book.findUnique({ where: { isbn: input.isbn } })) { skipped++; continue }
      await saveBook(tx, input); created++
    }
    if (!created) return fail(409, 'Todos los ISBN ya existen.')
    await audit(tx, actor(req), 'inventory', `Importación de ${created} títulos; ${skipped} duplicados omitidos.`)
    return { created, skipped }
  })
  res.json(result)
}))
adminRoutes.post('/admin/books', requirePermission('catalog:write'), route(async (req, res) => {
  const input = bookSchema.parse(req.body)
  const book = await transaction(async tx => {
    const book = await saveBook(tx, input)
    await audit(tx, actor(req), 'inventory', `Alta del título ${book.id}.`)
    return book
  })
  res.status(201).json({ book: serialize(book) })
}))
adminRoutes.put('/admin/books/:id', requirePermission('catalog:write'), route(async (req, res) => {
  const id = paramId(req); const input = bookSchema.parse(req.body)
  const book = await transaction(async tx => {
    const book = await saveBook(tx, input, id)
    await audit(tx, actor(req), 'inventory', `Edición del título ${id}.`)
    return book
  })
  res.json({ book: serialize(book) })
}))
adminRoutes.delete('/admin/books/:id', requirePermission('catalog:write'), route(async (req, res) => {
  const id = paramId(req); emptyBody.parse(req.body ?? {})
  await transaction(async tx => {
    if (!await tx.book.findUnique({ where: { id } })) return fail(404, 'Libro no encontrado.')
    if (await tx.loan.count({ where: { bookId: id } }) || await tx.reservation.count({ where: { bookId: id } })) return fail(409, 'El título tiene historial de circulación y debe conservarse para trazabilidad.')
    await tx.copy.deleteMany({ where: { bookId: id } }); await tx.book.delete({ where: { id } })
    await audit(tx, actor(req), 'inventory', `Baja del título ${id}.`)
  })
  res.json({ ok: true })
}))
adminRoutes.post('/admin/books/:id/copies', requirePermission('catalog:write'), route(async (req, res) => {
  const id = paramId(req); emptyBody.parse(req.body ?? {})
  const copy = await transaction(async tx => {
    const book = await tx.book.findUnique({ where: { id } })
    if (!book) return fail(404, 'Libro no encontrado.')
    if (book.format === 'digital') return fail(409, 'Un título digital no admite ejemplares físicos.')
    const copy = await tx.copy.create({ data: { id: uniqueCode('EJ'), bookId: id } })
    await audit(tx, actor(req), 'inventory', `Alta de ejemplar ${copy.id}.`)
    return copy
  })
  res.status(201).json({ copy: serialize(copy) })
}))
adminRoutes.patch('/admin/copies/:id', requirePermission('catalog:write'), route(async (req, res) => {
  const id = paramId(req); const { condition } = z.object({ condition: z.enum(['excelente', 'regular', 'mantenimiento', 'baja']) }).strict().parse(req.body)
  await transaction(async tx => {
    const copy = await tx.copy.findUnique({ where: { id } })
    if (!copy) return fail(404, 'Ejemplar no encontrado.')
    if (copy.status !== 'available') return fail(409, 'Devuelve o cancela la reserva antes de cambiar la condición del ejemplar.')
    await tx.copy.update({ where: { id }, data: { condition } })
    await audit(tx, actor(req), 'inventory', `Condición del ejemplar ${id}: ${condition}.`)
  })
  res.json({ ok: true })
}))

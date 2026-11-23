import { Router } from 'express'
import { z } from 'zod'
import { actor, requireAuth, requirePermission } from '../auth'
import { env } from '../env'
import { codeFromEmail, isStudentEmail, nameFromEmail } from './auth'
import { db, transaction, type Tx } from '../db'
import { auditDto, bookDto, copyDto, userDto, catalogInclude } from '../dto'
import { audit } from '../domain'
import { emptyBody, fail, dbId, idSchema, paramId, route } from '../http'

export const adminRoutes = Router()
adminRoutes.use(requireAuth)
const roleSchema = z.enum(['student', 'librarian', 'admin'])
const faculty = z.enum(['Ingeniería', 'Humanidades', 'Ciencias', 'Ciencias de la Salud', 'Ciencias Empresariales'])
const bookSchema = z.object({
  isbn: z.string().trim().min(1).max(20), title: z.string().trim().min(1).max(255), author: z.string().trim().min(1).max(255),
  editorial: z.string().trim().max(150).optional(),
  year: z.number().int().min(1).max(new Date().getFullYear() + 1), genre: z.string().max(100), faculties: z.array(faculty).max(5),
  synopsis: z.string().max(20000), format: z.enum(['fisico', 'digital', 'ambos']), pages: z.number().int().min(0),
  pavilion: z.enum(['A', 'B', 'C']), copies: z.number().int().min(0).max(1000),
  coverUrl: z.union([z.literal(''), z.string().max(300).url().refine(u => ['https:', 'http:'].includes(new URL(u).protocol))]).optional(),
}).strict().refine(b => b.format === 'digital' || b.copies > 0, 'Se requiere un ejemplar físico')
async function saveBook(tx: Tx, input: z.infer<typeof bookSchema>, id?: bigint) {
  const category = input.genre.trim() || 'Sin género'
  const categoria = { connectOrCreate: { where: { nombre: category }, create: { nombre: category } } }
  const fields = { isbn: input.isbn, titulo: input.title, autor: input.author, editorial: input.editorial, anioPublicacion: input.year, categoria,
    facultades: input.faculties, descripcion: input.synopsis, formato: input.format, paginas: input.pages, portadaPath: input.coverUrl || null }
  if (id) {
    const prev = await tx.libro.findUniqueOrThrow({ where: { id }, include: catalogInclude })
    if (input.format === 'digital' && prev.ejemplares.length) return fail(409,'El título tiene ejemplares físicos.')
    return tx.libro.update({ where: { id }, data: { ...fields, ubicacion: { ...prev.ubicacion as object, pavilion: input.pavilion } }, include: catalogInclude })
  }
  return tx.libro.create({ data: { ...fields, ubicacion: { pavilion: input.pavilion, shelf: 1, row: 1, col: 1 },
    ejemplares: { create: Array.from({ length: input.format === 'digital' ? 0 : input.copies }, () => ({ ubicacion: input.pavilion })) } }, include: catalogInclude })
}
adminRoutes.get('/admin/users', requirePermission('user:manage'), route(async (_req, res) => res.json({ users: (await db.usuario.findMany()).map(userDto) })))
// Grants access: staff sign in with their personal email (and create their password
// with an emailed code); students must use the institutional domain.
adminRoutes.post('/admin/users', requirePermission('user:manage'), route(async (req, res) => {
  const input = z.object({ email: z.string().trim().toLowerCase().email().max(254), name: z.string().trim().max(100).default(''), role: roleSchema }).strict().parse(req.body)
  if (input.role === 'student' && !isStudentEmail(input.email)) return fail(400, `Los estudiantes deben usar su correo institucional (@${env.STUDENT_EMAIL_DOMAIN}).`)
  const user = await transaction(async tx => {
    const existing = await tx.usuario.findUnique({ where: { email: input.email } })
    const user = existing
      ? await tx.usuario.update({ where: { id: existing.id }, data: { rol: input.role, activo: true, ...(input.name ? { nombres: input.name } : {}) } })
      : await tx.usuario.create({ data: { email: input.email, nombres: input.name || nameFromEmail(input.email), rol: input.role, codigoUsuario: await codeFromEmail(tx, input.email, input.role === 'student' ? '' : 'P-') } })
    await audit(tx, actor(req), 'user', `${existing ? 'Actualización de acceso' : 'Alta de acceso'} ${user.id} (${input.email}) con rol ${input.role}.`, 'usuarios', user.id, existing && userDto(existing), userDto(user))
    return user
  })
  res.status(201).json({ user: userDto(user) })
}))
adminRoutes.post('/admin/users/bulk', requirePermission('user:manage'), route(async (req, res) => {
  const input = z.object({ ids: z.array(dbId).min(1).max(500), op: z.discriminatedUnion('type', [z.object({ type: z.literal('activate') }).strict(), z.object({ type: z.literal('block') }).strict(), z.object({ type: z.literal('role'), role: roleSchema }).strict(), z.object({ type: z.literal('reset') }).strict()]) }).strict().parse(req.body)
  const who = actor(req)
  if (input.ids.includes(who.id) && (input.op.type === 'block' || (input.op.type === 'role' && input.op.role !== 'admin'))) return fail(403, 'No puedes bloquear ni degradar tu propia cuenta.')
  const data = input.op.type === 'activate' ? { activo: true as const } : input.op.type === 'block' ? { activo: false as const } : input.op.type === 'role' ? { rol: input.op.role } : { passwordHash: '' }
  const count = await transaction(async tx => {
    const before = await tx.usuario.findMany({ where: { id: { in: input.ids } }, orderBy: { id: 'asc' } })
    const changed = await tx.usuario.updateMany({ where: { id: { in: input.ids } }, data })
    if (!changed.count) return fail(404, 'Usuarios no encontrados.')
    const after = await tx.usuario.findMany({ where: { id: { in: input.ids } }, orderBy: { id: 'asc' } })
    await audit(tx, who, 'user', `Operación ${input.op.type} sobre ${changed.count} usuarios: ${input.ids.join(', ')}.`, 'usuarios', null, before.map(userDto), after.map(userDto))
    return changed.count
  })
  res.json({ count })
}))
adminRoutes.get('/admin/audit', requirePermission('audit:read'), route(async (_req, res) => res.json({ audit: (await db.auditoria.findMany({ orderBy: { seq: 'desc' }, take: 1000 })).map(auditDto) })))
adminRoutes.post('/admin/books/import', requirePermission('catalog:write'), route(async (req, res) => {
  const { books } = z.object({ books: z.array(bookSchema).min(1).max(1000) }).strict().parse(req.body)
  const result = await transaction(async tx => {
    let created = 0; let skipped = 0
    for (const input of books) {
      if (await tx.libro.findUnique({ where: { isbn: input.isbn } })) { skipped++; continue }
      const book = await saveBook(tx, input)
      await audit(tx, actor(req), 'inventory', 'Importación de título.', 'libros', book.id, null, bookDto(book))
      created++
    }
    if (!created) return fail(409, 'Todos los ISBN ya existen.')
    return { created, skipped }
  })
  res.json(result)
}))
adminRoutes.post('/admin/books', requirePermission('catalog:write'), route(async (req, res) => {
  const input = bookSchema.parse(req.body)
  const book = await transaction(async tx => {
    const book = await saveBook(tx, input)
    await audit(tx, actor(req), 'inventory', `Alta del título ${book.id}.`, 'libros', book.id, null, bookDto(book))
    return book
  })
  res.status(201).json({ book: bookDto(book) })
}))
adminRoutes.put('/admin/books/:id', requirePermission('catalog:write'), route(async (req, res) => {
  const id = paramId(req); const input = bookSchema.parse(req.body)
  const book = await transaction(async tx => {
    const previous = await tx.libro.findUniqueOrThrow({ where: { id }, include: catalogInclude })
    const book = await saveBook(tx, input, id)
    await audit(tx, actor(req), 'inventory', `Edición del título ${id}.`, 'libros', id, bookDto(previous), bookDto(book))
    return book
  })
  res.json({ book: bookDto(book) })
}))
adminRoutes.delete('/admin/books/:id', requirePermission('catalog:write'), route(async (req, res) => {
  const id = paramId(req); emptyBody.parse(req.body ?? {})
  await transaction(async tx => {
    const previous = await tx.libro.findUnique({ where: { id }, include: catalogInclude })
    if (!previous) return fail(404, 'Libro no encontrado.')
    if (await tx.reservaDetalle.count({ where: { libroId: id } })) return fail(409, 'El título tiene historial de circulación y debe conservarse para trazabilidad.')
    await tx.ejemplar.deleteMany({ where: { libroId: id } }); await tx.libro.delete({ where: { id } })
    await audit(tx, actor(req), 'inventory', `Baja del título ${id}.`, 'libros', id, bookDto(previous))
  })
  res.json({ ok: true })
}))
adminRoutes.post('/admin/books/:id/copies', requirePermission('catalog:write'), route(async (req, res) => {
  const id = paramId(req); emptyBody.parse(req.body ?? {})
  const copy = await transaction(async tx => {
    const book = await tx.libro.findUnique({ where: { id } })
    if (!book) return fail(404, 'Libro no encontrado.')
    if (book.formato === 'digital') return fail(409, 'Un título digital no admite ejemplares físicos.')
    const copy = await tx.ejemplar.create({ data: { libroId: id, ubicacion: (book.ubicacion as { pavilion?: string })?.pavilion ?? '' } })
    await audit(tx, actor(req), 'inventory', `Alta de ejemplar ${copy.id}.`, 'ejemplares', copy.id, null, copyDto(copy))
    return copy
  })
  res.status(201).json({ copy: copyDto(copy) })
}))
adminRoutes.patch('/admin/copies/:id', requirePermission('catalog:write'), route(async (req, res) => {
  const code = idSchema.parse(req.params.id); const { condition } = z.object({ condition: z.enum(['excelente', 'regular', 'mantenimiento', 'baja']) }).strict().parse(req.body)
  await transaction(async tx => {
    const copy = await tx.ejemplar.findUnique({ where: { codigoInventario: code } })
    if (!copy) return fail(404, 'Ejemplar no encontrado.')
    if (copy.estado !== 'available') return fail(409, 'Devuelve o cancela la reserva antes de cambiar la condición del ejemplar.')
    await tx.ejemplar.update({ where: { id: copy.id }, data: { condicion: condition } })
    await audit(tx, actor(req), 'inventory', `Condición del ejemplar ${copy.codigoInventario}: ${condition}.`, 'ejemplares', copy.id, { condicion: copy.condicion }, { condicion: condition })
  })
  res.json({ ok: true })
}))

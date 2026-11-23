import type { Prisma } from '@prisma/client'
import { SEED } from '../src/data/seed'

export async function seedCatalog(tx: Prisma.TransactionClient) {
  let created = 0
  for (const b of SEED.books) {
    if (await tx.libro.findUnique({ where: { isbn: b.isbn } })) continue
    const category = await tx.categoria.upsert({ where: { nombre: b.genre }, create: { nombre: b.genre }, update: {} })
    await tx.libro.create({ data: { categoriaId: category.id, isbn: b.isbn, titulo: b.title, autor: b.author, anioPublicacion: b.year,
      facultades: b.faculties, descripcion: b.synopsis, formato: b.format, paginas: b.pages, ubicacion: { ...b.location }, createdAt: new Date(b.addedAt),
      ejemplares: { create: b.copies.map(c => ({ codigoInventario: c.id, condicion: c.condition, ubicacion: b.location.pavilion })) } } })
    created++
  }
  return created
}

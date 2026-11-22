// Loads only the book catalog (titles and physical copies). It creates no users,
// loans or history: every account comes from a real email sign-in or an admin grant.
// Idempotent: existing ISBNs are left untouched.
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { SEED } from '../src/data/seed'

const prisma = new PrismaClient()
async function main() {
  let created = 0
  for (const b of SEED.books) {
    if (await prisma.book.findUnique({ where: { isbn: b.isbn } })) continue
    await prisma.book.create({
      data: {
        id: b.id, isbn: b.isbn, title: b.title, author: b.author, year: b.year, genre: b.genre,
        faculties: b.faculties, synopsis: b.synopsis, format: b.format, pages: b.pages,
        location: b.location as object, demand: 0,
        copies: { create: b.copies.map(c => ({ id: c.id, condition: c.condition, status: 'available' as const })) },
      },
    })
    created++
  }
  console.log(`Catálogo listo: ${created} título(s) nuevo(s), ${SEED.books.length - created} ya existía(n).`)
}
main().catch(error => { console.error('No se pudo cargar el catálogo:', error); process.exitCode = 1 }).finally(() => prisma.$disconnect())

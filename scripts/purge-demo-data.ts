// Removes the fictitious demo data that db:seed-history created: the demo accounts
// listed in src/data/seed.ts (all @campus.edu) with their loans, reservations and
// fines, plus the generated activity log. The book catalog is kept.
// Idempotent: when no demo account exists it changes nothing.
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { SEED } from '../src/data/seed'

const prisma = new PrismaClient()
const postgres = !(process.env.DATABASE_URL ?? '').startsWith('file:')

async function main() {
  const demo = await prisma.user.findMany({ where: { email: { in: SEED.users.map(u => u.email) } }, select: { id: true } })
  if (!demo.length) { console.log('Sin datos de demostración: nada que limpiar.'); return }
  const ids = demo.map(u => u.id)
  const summary = await prisma.$transaction(async tx => {
    const fines = await tx.fine.deleteMany({ where: { userId: { in: ids } } })
    const loans = await tx.loan.deleteMany({ where: { userId: { in: ids } } })
    const reservations = await tx.reservation.deleteMany({ where: { userId: { in: ids } } })
    const users = await tx.user.deleteMany({ where: { id: { in: ids } } })
    await tx.emailCode.deleteMany({ where: { email: { in: SEED.users.map(u => u.email) } } })
    // The activity log so far is entirely the generated demo history (no real account
    // could sign in before this cleanup). Lift the append-only guard just for this;
    // the server recreates it on startup.
    if (postgres) await tx.$executeRawUnsafe('DROP TRIGGER IF EXISTS audit_immutable_trigger ON "AuditEntry"')
    else { await tx.$executeRawUnsafe('DROP TRIGGER IF EXISTS audit_no_delete'); await tx.$executeRawUnsafe('DROP TRIGGER IF EXISTS audit_no_update') }
    const audit = await tx.auditEntry.deleteMany({})
    // Copies held by the deleted loans/reservations are back on the shelf; demo
    // popularity counters go back to zero.
    const busy = new Set([
      ...(await tx.loan.findMany({ where: { returnedAt: null, copyId: { not: null } }, select: { copyId: true } })).map(l => l.copyId!),
      ...(await tx.reservation.findMany({ select: { copyId: true } })).map(r => r.copyId),
    ])
    const copies = await tx.copy.updateMany({ where: { status: { not: 'available' }, id: { notIn: [...busy] } }, data: { status: 'available' } })
    await tx.book.updateMany({ data: { demand: 0 } })
    return { users: users.count, loans: loans.count, reservations: reservations.count, fines: fines.count, audit: audit.count, copies: copies.count }
  }, { timeout: 120_000, maxWait: 20_000 })
  console.log(`Datos de demostración eliminados: ${summary.users} usuarios, ${summary.loans} préstamos, ${summary.reservations} reservas, ${summary.fines} multas, ${summary.audit} registros de auditoría; ${summary.copies} ejemplares devueltos al estante.`)
}
main().catch(error => { console.error('No se pudo limpiar los datos de demostración:', error); process.exitCode = 1 }).finally(() => prisma.$disconnect())

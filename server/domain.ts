import type { Reservation, User } from '@prisma/client'
import { randomUUID } from 'node:crypto'
import { db, transaction, type Tx } from './db'
import { env, policy } from './env'
import { fail, serialize } from './http'
import { signQr } from './qr'

export const DAY = 86400000
export const activeStatuses = ['pending', 'ready'] as const
export const lendable = ['excelente', 'regular'] as const
export const tokenFor = (r: Reservation) => signQr({ rid: r.id, cid: r.copyId, uid: r.userId, exp: r.expiresAt.getTime(), nonce: r.nonce }, env.QR_HMAC_SECRET)
export const reservationDto = (r: Reservation, includeToken = true) => ({ ...serialize(r) as object, ...(includeToken && activeStatuses.includes(r.status as 'pending' | 'ready') ? { qrToken: tokenFor(r) } : {}) })
export async function audit(tx: Tx, who: Pick<User, 'name' | 'role' | 'ip'> | null, action: string, detail: string) {
  await tx.auditEntry.create({ data: { actorName: who?.name ?? 'Sistema', actorRole: who?.role ?? 'system', ip: who?.ip ?? '', action, detail } })
}
export async function eligible(tx: Tx, userId: string, reservation = false) {
  const user = await tx.user.findUnique({ where: { id: userId } })
  if (!user) return fail(404, 'Usuario no encontrado.')
  if (user.status !== 'active') return fail(409, 'Cuenta bloqueada por sanción.')
  if (await tx.fine.count({ where: { userId, status: 'pending' } })) return fail(409, 'Regulariza tu multa pendiente para continuar.')
  if (await tx.loan.count({ where: { userId, returnedAt: null, dueAt: { lt: new Date() } } })) return fail(409, 'Tienes préstamos vencidos sin devolver.')
  if (!reservation && await tx.loan.count({ where: { userId, returnedAt: null } }) >= policy.maxLoans) return fail(409, `Límite de ${policy.maxLoans} préstamos simultáneos.`)
  return user
}
export async function createLoan(tx: Tx, bookId: string, copyId: string | null, userId: string) {
  return tx.loan.create({ data: { bookId, copyId, userId, dueAt: new Date(Date.now() + policy.loanDays * DAY) } })
}
export async function receipt(tx: Tx, loan: Awaited<ReturnType<typeof createLoan>>, kind: 'loan' | 'return', fine: unknown = null) {
  const user = await tx.user.findUniqueOrThrow({ where: { id: loan.userId } })
  const book = await tx.book.findUniqueOrThrow({ where: { id: loan.bookId }, include: { copies: true } })
  return serialize({ kind, loan, user, book, fine, at: loan.returnedAt ?? loan.loanedAt })
}
export async function sweepExpired() {
  await transaction(async tx => {
    const reservations = await tx.reservation.findMany({ where: { status: { in: [...activeStatuses] }, expiresAt: { lte: new Date() } } })
    for (const r of reservations) {
      const updated = await tx.reservation.updateMany({ where: { id: r.id, status: { in: [...activeStatuses] }, consumedAt: null }, data: { status: 'expired' } })
      if (!updated.count) continue
      await tx.copy.updateMany({ where: { id: r.copyId, status: 'reserved' }, data: { status: 'available' } })
      await audit(tx, null, 'reservation', `Reserva ${r.code} vencida; ejemplar ${r.copyId} liberado.`)
    }
  })
}
export async function snapshot(user: User) {
  const staff = user.role !== 'student'
  const own = staff ? {} : { userId: user.id }
  const [books, users, loans, reservations, fines, entries] = await Promise.all([
    db.book.findMany({ include: { copies: true } }),
    db.user.findMany({ where: staff ? {} : { id: user.id } }),
    db.loan.findMany({ where: own }), db.reservation.findMany({ where: own }),
    db.fine.findMany({ where: own }), user.role === 'admin' ? db.auditEntry.findMany({ orderBy: { seq: 'desc' }, take: 1000 }) : Promise.resolve([]),
  ])
  return { ...serialize({ books, users, loans, fines, audit: entries }) as object, reservations: reservations.map(r => reservationDto(r, !staff)) }
}
export const uniqueCode = (prefix: string) => `${prefix}-${randomUUID()}`

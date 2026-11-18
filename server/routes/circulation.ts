import { Router } from 'express'
import { z } from 'zod'
import { actor, requireAuth, requirePermission } from '../auth'
import { transaction } from '../db'
import { activeStatuses, audit, createLoan, DAY, eligible, lendable, receipt, sweepExpired } from '../domain'
import { env, policy } from '../env'
import { emptyBody, fail, idSchema, paramId, route, serialize } from '../http'
import { verifyQr, type QrPayload } from '../qr'

export const circulationRoutes = Router()
circulationRoutes.use(requireAuth)
circulationRoutes.post('/circulation/scan', requirePermission('circulation:write'), route(async (req, res) => {
  const { qrToken } = z.object({ qrToken: z.string().min(1).max(4096) }).strict().parse(req.body)
  let payload: QrPayload
  try { payload = verifyQr(qrToken, env.QR_HMAC_SECRET) } catch { return fail(401, 'Firma o contenido del ticket QR inválido.') }
  await sweepExpired()
  const result = await transaction(async tx => {
    const r = await tx.reservation.findUnique({ where: { id: payload.rid } })
    if (!r) return fail(404, 'Ticket de reserva no encontrado.')
    if (r.copyId !== payload.cid || r.userId !== payload.uid || r.nonce !== payload.nonce || r.expiresAt.getTime() !== payload.exp) return fail(401, 'El ticket no corresponde a la reserva.')
    if (r.consumedAt || r.status === 'collected') return fail(409, 'El ticket ya fue canjeado.')
    if (payload.exp <= Date.now() || r.status === 'expired') return fail(410, 'La reserva está vencida.')
    if (!activeStatuses.includes(r.status as 'pending' | 'ready')) return fail(409, 'La reserva ya no está activa.')
    if (r.pickupAt.getTime() > Date.now()) return fail(409, 'Aún no comienza la hora de retiro.')
    await eligible(tx, r.userId)
    const consumed = await tx.reservation.updateMany({ where: { id: r.id, nonce: payload.nonce, consumedAt: null, status: { in: [...activeStatuses] }, expiresAt: { gt: new Date() } }, data: { consumedAt: new Date(), status: 'collected' } })
    if (consumed.count !== 1) return fail(409, 'El ticket ya fue canjeado.')
    const claimed = await tx.copy.updateMany({ where: { id: r.copyId, bookId: r.bookId, status: 'reserved', condition: { in: [...lendable] } }, data: { status: 'loaned' } })
    if (claimed.count !== 1) return fail(409, 'El ejemplar no está reservado o está en mantenimiento o de baja.')
    const loan = await createLoan(tx, r.bookId, r.copyId, r.userId)
    await audit(tx, actor(req), 'loan', `Entrega de reserva ${r.code}; préstamo ${loan.id}.`)
    return receipt(tx, loan, 'loan')
  })
  res.json(result)
}))
circulationRoutes.post('/circulation/checkout', requirePermission('circulation:write'), route(async (req, res) => {
  const input = z.object({ userCode: idSchema, copyId: idSchema }).strict().parse(req.body)
  res.json(await transaction(async tx => {
    const found = await tx.user.findUnique({ where: { code: input.userCode.toUpperCase() } })
    if (!found) return fail(404, 'Carnet de usuario no reconocido.')
    const user = await eligible(tx, found.id)
    const copy = await tx.copy.findUnique({ where: { id: input.copyId } })
    if (!copy) return fail(404, 'Ejemplar no encontrado.')
    if (!lendable.includes(copy.condition as 'excelente' | 'regular')) return fail(409, 'Ejemplar en mantenimiento o de baja.')
    const changed = await tx.copy.updateMany({ where: { id: copy.id, status: 'available', condition: { in: [...lendable] } }, data: { status: 'loaned' } })
    if (!changed.count) return fail(409, 'Ejemplar no disponible. Para una reserva, escanea el ticket QR.')
    const loan = await createLoan(tx, copy.bookId, copy.id, user.id)
    await audit(tx, actor(req), 'loan', `Préstamo ${loan.id} del ejemplar ${copy.id}.`)
    return receipt(tx, loan, 'loan')
  }))
}))
circulationRoutes.post('/circulation/checkin', requirePermission('circulation:write'), route(async (req, res) => {
  const { copyId } = z.object({ copyId: idSchema }).strict().parse(req.body)
  res.json(await transaction(async tx => {
    const copy = await tx.copy.findUnique({ where: { id: copyId } })
    if (!copy) return fail(404, 'Ejemplar no encontrado.')
    const loan = await tx.loan.findFirst({ where: { copyId, returnedAt: null } })
    if (!loan) return fail(409, 'El ejemplar no tiene un préstamo activo.')
    const at = new Date()
    if (!(await tx.loan.updateMany({ where: { id: loan.id, returnedAt: null }, data: { returnedAt: at } })).count) return fail(409, 'La devolución ya fue registrada.')
    await tx.copy.update({ where: { id: copyId }, data: { status: 'available' } })
    const days = Math.max(0, Math.ceil((at.getTime() - loan.dueAt.getTime()) / DAY))
    const fine = days ? await tx.fine.create({ data: { userId: loan.userId, loanId: loan.id, bookId: loan.bookId, days, amount: Math.round(days * policy.finePerDay * 100) / 100 } }) : null
    await audit(tx, actor(req), 'return', `Devolución ${loan.id}${fine ? `; multa ${fine.id}: ${fine.amount}` : '; sin multa'}.`)
    return receipt(tx, { ...loan, returnedAt: at }, 'return', fine)
  }))
}))
circulationRoutes.post('/loans/:id/renew', requirePermission('loan:renew'), route(async (req, res) => {
  const id = paramId(req); emptyBody.parse(req.body ?? {})
  const loan = await transaction(async tx => {
    const loan = await tx.loan.findUnique({ where: { id } })
    if (!loan) return fail(404, 'Préstamo no encontrado.')
    if (loan.userId !== actor(req).id) return fail(403, 'No puedes renovar préstamos ajenos.')
    await eligible(tx, loan.userId, true)
    if (loan.returnedAt) return fail(409, 'El préstamo ya fue devuelto.')
    if (loan.renewals >= policy.maxRenewals) return fail(409, `Alcanzaste el máximo de ${policy.maxRenewals} renovaciones.`)
    if (await tx.reservation.count({ where: { bookId: loan.bookId, userId: { not: loan.userId }, status: { in: [...activeStatuses] } } })) return fail(409, 'El título tiene reservas pendientes de otros lectores.')
    const next = await tx.loan.updateMany({ where: { id, returnedAt: null, renewals: loan.renewals, dueAt: { gt: new Date() } }, data: { renewals: { increment: 1 }, dueAt: new Date(loan.dueAt.getTime() + policy.renewalDays * DAY) } })
    if (!next.count) return fail(409, 'El préstamo cambió o está vencido.')
    await audit(tx, actor(req), 'renewal', `Renovación del préstamo ${id}.`)
    return tx.loan.findUniqueOrThrow({ where: { id } })
  })
  res.json({ loan: serialize(loan) })
}))
circulationRoutes.post('/loans/digital', requirePermission('reservation:create'), route(async (req, res) => {
  const { bookId } = z.object({ bookId: idSchema }).strict().parse(req.body)
  const loan = await transaction(async tx => {
    const user = await eligible(tx, actor(req).id)
    const book = await tx.book.findUnique({ where: { id: bookId } })
    if (!book) return fail(404, 'Libro no encontrado.')
    if (book.format === 'fisico') return fail(409, 'Este título no tiene edición digital.')
    if (await tx.loan.count({ where: { bookId, userId: user.id, copyId: null, returnedAt: null } })) return fail(409, 'Ya tienes este e-book en tu casillero.')
    const loan = await createLoan(tx, bookId, null, user.id)
    await audit(tx, user, 'loan', `Préstamo digital ${loan.id}.`)
    return loan
  })
  res.status(201).json({ loan: serialize(loan) })
}))
circulationRoutes.post('/loans/:id/return-digital', requirePermission('loan:renew'), route(async (req, res) => {
  const id = paramId(req); emptyBody.parse(req.body ?? {})
  await transaction(async tx => {
    const loan = await tx.loan.findUnique({ where: { id } })
    if (!loan) return fail(404, 'Préstamo no encontrado.')
    if (loan.userId !== actor(req).id) return fail(403, 'No puedes devolver préstamos ajenos.')
    if (loan.copyId || loan.returnedAt) return fail(409, 'El préstamo no es digital o ya fue devuelto.')
    const at = new Date()
    await tx.loan.update({ where: { id }, data: { returnedAt: at } })
    const days = Math.max(0, Math.ceil((at.getTime() - loan.dueAt.getTime()) / DAY))
    if (days) await tx.fine.create({ data: { userId: loan.userId, loanId: loan.id, bookId: loan.bookId, days, amount: Math.round(days * policy.finePerDay * 100) / 100 } })
    await audit(tx, actor(req), 'return', `Devolución digital ${id}.`)
  })
  res.json({ ok: true })
}))

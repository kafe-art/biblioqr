import { Router } from 'express'
import { randomBytes, randomInt } from 'node:crypto'
import { z } from 'zod'
import { actor, requireAuth, requirePermission } from '../auth'
import { transaction } from '../db'
import { activeStatuses, audit, eligible, lendable, reservationDto, sweepExpired, tokenFor, uniqueCode } from '../domain'
import { policy } from '../env'
import { emptyBody, fail, idSchema, paramId, route } from '../http'

export const reservationRoutes = Router()
reservationRoutes.use(requireAuth)
reservationRoutes.post('/reservations', requirePermission('reservation:create'), route(async (req, res) => {
  const input = z.object({ bookId: idSchema, pickupAt: z.number().int().refine(n => Number.isFinite(n) && n >= Date.now() - 60000 && n <= Date.now() + 30 * 86400000, 'Hora de retiro inválida'), method: z.enum(['desk', 'locker']) }).strict().parse(req.body)
  await sweepExpired()
  const r = await transaction(async tx => {
    const user = await eligible(tx, actor(req).id, true)
    if (await tx.reservation.count({ where: { userId: user.id, bookId: input.bookId, status: { in: [...activeStatuses] } } })) return fail(409, 'Ya tienes una reserva activa de este título.')
    const book = await tx.book.findUnique({ where: { id: input.bookId } })
    if (!book) return fail(404, 'Libro no encontrado.')
    if (book.format === 'digital') return fail(409, 'Este título no tiene ejemplares físicos.')
    const copy = await tx.copy.findFirst({ where: { bookId: book.id, status: 'available', condition: { in: [...lendable] } }, orderBy: { id: 'asc' } })
    if (!copy) return fail(409, 'No quedan ejemplares disponibles en este momento.')
    const claimed = await tx.copy.updateMany({ where: { id: copy.id, status: 'available', condition: { in: [...lendable] } }, data: { status: 'reserved' } })
    if (claimed.count !== 1) return fail(409, 'El ejemplar acaba de ser reservado.')
    const reservation = await tx.reservation.create({ data: { code: uniqueCode('RSV'), bookId: book.id, copyId: copy.id, userId: user.id, pickupAt: new Date(input.pickupAt), expiresAt: new Date(input.pickupAt + policy.holdHours * 3600000), method: input.method, locker: input.method === 'locker' ? `C-${randomInt(10, 50)}` : null, nonce: randomBytes(32).toString('base64url') } })
    await audit(tx, user, 'reservation', `Reserva ${reservation.code} del ejemplar ${copy.id}.`)
    return reservation
  })
  res.status(201).json({ reservation: reservationDto(r), qrToken: tokenFor(r) })
}))
reservationRoutes.delete('/reservations/:id', requirePermission('reservation:create', 'reservation:manage'), route(async (req, res) => {
  const id = paramId(req); emptyBody.parse(req.body ?? {})
  await sweepExpired()
  await transaction(async tx => {
    const r = await tx.reservation.findUnique({ where: { id } })
    if (!r) return fail(404, 'Reserva no encontrada.')
    const user = actor(req)
    if (user.role === 'student' && r.userId !== user.id) return fail(403, 'No puedes cancelar una reserva ajena.')
    if (r.status === 'expired') return fail(410, 'La reserva está vencida.')
    const changed = await tx.reservation.updateMany({ where: { id, status: { in: [...activeStatuses] }, consumedAt: null }, data: { status: 'cancelled' } })
    if (!changed.count) return fail(409, 'La reserva ya no está activa.')
    await tx.copy.updateMany({ where: { id: r.copyId, status: 'reserved' }, data: { status: 'available' } })
    await audit(tx, user, 'reservation', `Reserva ${r.code} cancelada.`)
  })
  res.json({ ok: true })
}))
reservationRoutes.post('/reservations/:id/ready', requirePermission('reservation:manage'), route(async (req, res) => {
  const id = paramId(req); emptyBody.parse(req.body ?? {}); await sweepExpired()
  await transaction(async tx => {
    const r = await tx.reservation.findUnique({ where: { id } })
    if (!r) return fail(404, 'Reserva no encontrada.')
    if (r.status === 'expired') return fail(410, 'La reserva está vencida.')
    if (!(await tx.reservation.updateMany({ where: { id, status: 'pending', expiresAt: { gt: new Date() } }, data: { status: 'ready' } })).count) return fail(409, 'La reserva no está pendiente.')
    await audit(tx, actor(req), 'reservation', `Reserva ${r.code} lista para recoger.`)
  })
  res.json({ ok: true })
}))

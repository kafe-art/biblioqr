import { Router } from 'express'
import { randomInt } from 'node:crypto'
import { z } from 'zod'
import { actor, requireAuth, requirePermission } from '../auth'
import { transaction } from '../db'
import { activeStatuses, audit, closeReservation, eligible, lendable, reservationDto, sweepExpired } from '../domain'
import { reservationInclude } from '../dto'
import { policy } from '../env'
import { dbId, emptyBody, fail, paramId, route } from '../http'
import { MAX_RESERVATION_BOOKS } from '../../shared/reservations'

export const reservationRoutes = Router()
reservationRoutes.use(requireAuth)
const options = { pickupAt: z.number().int().refine(n => n >= Date.now()-60000 && n <= Date.now()+30*86400000), method: z.enum(['desk','locker']) }
const inputSchema = z.union([
  z.object({ ...options, bookIds: z.array(dbId).min(1).max(MAX_RESERVATION_BOOKS).refine(ids => new Set(ids).size === ids.length) }).strict(),
  z.object({ ...options, bookId: dbId }).strict().transform(v => ({ ...v, bookIds: [v.bookId] })),
])
reservationRoutes.post('/reservations', requirePermission('reservation:create'), route(async (req,res) => {
  const input = inputSchema.parse(req.body)
  await sweepExpired()
  const reservation = await transaction(async tx => {
    const user = await eligible(tx, actor(req).id)
    const detalles = []
    for (const libroId of input.bookIds) {
      if (await tx.reservaDetalle.count({ where: { libroId, reserva: { usuarioId: user.id, estado: { in: [...activeStatuses] } } } })) return fail(409, 'Ya tienes una reserva activa de este título.')
      const book = await tx.libro.findUniqueOrThrow({ where: { id: libroId } })
      if (book.formato === 'digital') return fail(409, 'Este título solo tiene edición digital.')
      const copy = await tx.ejemplar.findFirst({ where: { libroId, estado: 'available', condicion: { in: [...lendable] } }, orderBy: { id: 'asc' } })
      if (!copy) return fail(409, 'No hay ejemplares disponibles de ' + book.titulo + '.')
      await tx.ejemplar.update({ where: { id: copy.id, estado: 'available' }, data: { estado: 'reserved' } })
      detalles.push({ libroId, ejemplarId: copy.id, posicion: detalles.length + 1 })
    }
    await tx.libro.updateMany({ where: { id: { in: input.bookIds } }, data: { demanda: { increment: 1 } } })
    const r = await tx.reserva.create({ data: { usuarioId: user.id, retiroProgramado: new Date(input.pickupAt), fechaExpiracion: new Date(input.pickupAt + policy.holdHours*3600000),
      metodoRetiro: input.method, casillero: input.method === 'locker' ? 'C-'+randomInt(10,50) : null, detalles: { create: detalles } }, include: reservationInclude })
    await audit(tx,user,'reservation','Creación de reserva.','reservas',r.id,null,{ estado: r.estado, detalles })
    return reservationDto(r)
  })
  res.status(201).json({ reservation, qrToken: reservation.qrToken })
}))
reservationRoutes.delete('/reservations/:id', requirePermission('reservation:create','reservation:manage'), route(async (req,res) => {
  const id = paramId(req)
  emptyBody.parse(req.body ?? {})
  await sweepExpired()
  await transaction(async tx => {
    const r = await tx.reserva.findUniqueOrThrow({ where: { id }, include: reservationInclude })
    const user = actor(req)
    if (user.rol === 'student' && r.usuarioId !== user.id) return fail(403,'No puedes cancelar una reserva ajena.')
    if (r.estado === 'expired') return fail(410,'La reserva está vencida.')
    await closeReservation(tx,r,'cancelled',user)
  })
  res.json({ ok: true })
}))
reservationRoutes.post('/reservations/:id/ready', requirePermission('reservation:manage'), route(async (req,res) => {
  const id = paramId(req)
  emptyBody.parse(req.body ?? {})
  await sweepExpired()
  await transaction(async tx => {
    const r = await tx.reserva.findUniqueOrThrow({ where: { id } })
    if (r.estado === 'expired') return fail(410,'La reserva está vencida.')
    if (r.estado !== 'pending') return fail(409,'La reserva ya no está pendiente.')
    await tx.reserva.update({ where: { id }, data: { estado: 'ready', detalles: { updateMany: { where: {}, data: { estado: 'ready' } } } } })
    await tx.notificacion.create({ data: { usuarioId: r.usuarioId, reservaId: id, tipo: 'reserva', asunto: 'Reserva lista', mensaje: 'Ya puedes recoger los libros de tu reserva.', estado: 'enviada', fechaEnvio: new Date() } })
    await audit(tx,actor(req),'reservation','Reserva lista para recoger.','reservas',id,{ estado: r.estado },{ estado: 'ready' })
  })
  res.json({ ok: true })
}))

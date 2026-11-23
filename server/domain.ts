import { Prisma, type Usuario } from '@prisma/client'
import { isIP } from 'node:net'
import { db, transaction, type Tx } from './db'
import { env, policy } from './env'
import { fail, serialize } from './http'
import { signQr } from './qr'
import { auditDto, bookDto, catalogInclude, fineDto, fineInclude, loanDto, loanInclude, reservationInclude, userDto } from './dto'

export const DAY = 86400000
export const activeStatuses = ['pending', 'ready'] as const
export const lendable = ['excelente', 'regular'] as const
type Header = Prisma.ReservaGetPayload<{ include: typeof reservationInclude }>
export function ticketPayload(r: Header) {
  return { rid: String(r.id), cid: r.detalles.map(d => String(d.ejemplarId)).join(','), uid: String(r.usuarioId), exp: r.fechaExpiracion.getTime(), nonce: r.nonce }
}
export function reservationDto(r: Header, includeToken = true) {
  const details = r.detalles.map(d => ({ id: String(d.id), bookId: String(d.libroId), copyId: d.ejemplar?.codigoInventario ?? null, status: d.estado }))
  return { id: String(r.id), userId: String(r.usuarioId), code: r.codigoReserva, bookId: details[0]?.bookId, copyId: details[0]?.copyId, details,
    createdAt: r.fechaReserva.getTime(), pickupAt: r.retiroProgramado.getTime(), expiresAt: r.fechaExpiracion.getTime(), method: r.metodoRetiro,
    locker: r.casillero, status: r.estado, consumedAt: r.consumidoEn?.getTime() ?? null,
    ...(includeToken && (r.estado === 'pending' || r.estado === 'ready') ? { qrToken: signQr(ticketPayload(r), env.QR_HMAC_SECRET) } : {}) }
}
export async function audit(tx: Tx, who: Usuario | null, action: string, detail: string, entity = 'usuarios', id: bigint | null = who?.id ?? null, before?: unknown, after?: unknown) {
  await tx.auditoria.create({ data: { usuarioId: who?.id, actorNombre: who?.nombres ?? 'Sistema', actorRol: who?.rol ?? 'system',
    ipOrigen: who && isIP(who.ip) ? who.ip : null, accion: action, descripcion: detail, entidad: entity, entidadId: id,
    datosAnteriores: before == null ? Prisma.DbNull : serialize(before) as Prisma.InputJsonValue,
    datosNuevos: after == null ? Prisma.DbNull : serialize(after) as Prisma.InputJsonValue } })
}
export async function eligible(tx: Tx, usuarioId: bigint, count = 0) {
  const user = await tx.usuario.findUniqueOrThrow({ where: { id: usuarioId } })
  if (!user.activo) return fail(409, 'Cuenta bloqueada.')
  if (await tx.sancion.count({ where: { usuarioId, estado: 'pending' } })) return fail(409, 'Regulariza tu sanción pendiente.')
  const active = { reserva: { usuarioId }, estado: 'collected' as const }
  if (await tx.reservaDetalle.count({ where: { ...active, fechaLimiteDevol: { lt: new Date() } } })) return fail(409, 'Tienes préstamos vencidos.')
  if (count && count + await tx.reservaDetalle.count({ where: active }) > policy.maxLoans) return fail(409, 'Límite de préstamos simultáneos.')
  return user
}
export async function closeReservation(tx: Tx, r: Header, estado: 'expired' | 'cancelled', who: Usuario | null) {
  const changed = await tx.reserva.updateMany({ where: { id: r.id, estado: { in: [...activeStatuses] }, consumidoEn: null }, data: { estado } })
  if (!changed.count) return fail(409, 'La reserva ya no está activa.')
  await tx.reservaDetalle.updateMany({ where: { reservaId: r.id }, data: { estado } })
  await tx.ejemplar.updateMany({ where: { id: { in: r.detalles.flatMap(d => d.ejemplarId ? [d.ejemplarId] : []) }, estado: 'reserved' }, data: { estado: 'available' } })
  await audit(tx, who, 'reservation', estado === 'expired' ? 'Reserva vencida.' : 'Reserva cancelada.', 'reservas', r.id, { estado: r.estado }, { estado })
}
export async function sweepExpired() {
  await transaction(async tx => {
    const expired = await tx.reserva.findMany({ where: { estado: { in: [...activeStatuses] }, fechaExpiracion: { lte: new Date() } }, include: reservationInclude })
    for (const r of expired) await closeReservation(tx, r, 'expired', null)
  })
}
export async function snapshot(user: Usuario) {
  const staff = user.rol !== 'student'
  const own = staff ? {} : { usuarioId: user.id }
  const [books, users, loans, reservations, fines, entries, incidencias, avisos] = await Promise.all([
    db.libro.findMany({ include: catalogInclude }), db.usuario.findMany({ where: staff ? {} : { id: user.id } }),
    db.reservaDetalle.findMany({ where: { reserva: own, fechaLimiteDevol: { not: null } }, include: loanInclude }),
    db.reserva.findMany({ where: own, include: reservationInclude }), db.sancion.findMany({ where: own, include: fineInclude }),
    user.rol === 'admin' ? db.auditoria.findMany({ orderBy: { seq: 'desc' }, take: 1000 }) : [],
    db.incidencia.findMany({ where: own, orderBy: { id: 'desc' } }), db.notificacion.findMany({ where: own, orderBy: { id: 'desc' } }),
  ])
  return { books: books.map(bookDto), users: users.map(userDto), loans: loans.map(loanDto), fines: fines.map(fineDto), audit: entries.map(auditDto),
    reservations: reservations.map(r => reservationDto(r, !staff)), incidencias: serialize(incidencias), avisos: serialize(avisos) }
}

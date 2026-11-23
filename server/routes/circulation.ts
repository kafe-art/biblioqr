import { Router } from 'express'
import { z } from 'zod'
import type { Usuario } from '@prisma/client'
import { actor, requireAuth, requirePermission } from '../auth'
import { transaction, type Tx } from '../db'
import { activeStatuses, audit, DAY, eligible, lendable, sweepExpired, ticketPayload } from '../domain'
import { bookDto, catalogInclude, fineDto, fineInclude, loanDto, loanInclude, reservationInclude, userDto } from '../dto'
import { env, policy } from '../env'
import { dbId, emptyBody, fail, idSchema, paramId, route } from '../http'
import { verifyQr, type QrPayload } from '../qr'

export const circulationRoutes = Router()
circulationRoutes.use(requireAuth)
const due = (at: Date) => new Date(at.getTime() + policy.loanDays * DAY)
async function receipt(tx: Tx, id: bigint, kind: 'loan' | 'return', fine: unknown = null) {
  const d = await tx.reservaDetalle.findUniqueOrThrow({ where: { id }, include: { ...loanInclude, libro: { include: catalogInclude }, reserva: { include: { usuario: true } } } })
  return { kind, loan: loanDto(d), user: userDto(d.reserva.usuario), book: bookDto(d.libro), fine, at: (d.fechaDevolucion ?? d.reserva.fechaRetiro)!.getTime() }
}
async function immediate(tx: Tx, user: Usuario, who: Usuario, libroId: bigint, ejemplarId: bigint | null) {
  const at = new Date()
  await tx.libro.update({ where: { id: libroId }, data: { demanda: { increment: 1 } } })
  const r = await tx.reserva.create({ data: { usuarioId: user.id, bibliotecarioId: who.rol === 'student' ? null : who.id, estado: 'collected',
    retiroProgramado: at, fechaExpiracion: at, fechaRetiro: at, consumidoEn: at, metodoRetiro: 'desk',
    detalles: { create: { libroId, ejemplarId, posicion: 1, estado: 'collected', fechaLimiteDevol: due(at) } } }, include: reservationInclude })
  await audit(tx,who,'loan','Préstamo registrado.','reservas',r.id,null,{ estado: r.estado, libroId, ejemplarId })
  return r.detalles[0].id
}
circulationRoutes.post('/circulation/scan', requirePermission('circulation:write'), route(async (req,res) => {
  const { qrToken } = z.object({ qrToken: z.string().min(1).max(4096) }).strict().parse(req.body)
  let payload: QrPayload
  try { payload = verifyQr(qrToken, env.QR_HMAC_SECRET) } catch { return fail(401,'Ticket QR inválido.') }
  await sweepExpired()
  res.json(await transaction(async tx => {
    const r = await tx.reserva.findUniqueOrThrow({ where: { id: dbId.parse(payload.rid) }, include: reservationInclude })
    const expected = ticketPayload(r)
    if (expected.cid !== payload.cid || expected.uid !== payload.uid || expected.nonce !== payload.nonce || expected.exp !== payload.exp) return fail(401,'El ticket no corresponde a la reserva.')
    if (r.consumidoEn) return fail(409,'El ticket ya fue canjeado.')
    const at = new Date()
    if (r.fechaExpiracion <= at) return fail(410,'Reserva vencida.')
    if (r.retiroProgramado > at || !['pending','ready'].includes(r.estado)) return fail(409,'Reserva no disponible para retiro.')
    await eligible(tx,r.usuarioId,r.detalles.length)
    const changed = await tx.ejemplar.updateMany({ where: { id: { in: r.detalles.map(d => d.ejemplarId!) }, estado: 'reserved', condicion: { in: [...lendable] } }, data: { estado: 'loaned' } })
    if (!r.detalles.length || changed.count !== r.detalles.length) return fail(409,'Un ejemplar ya no está disponible.')
    await tx.reserva.update({ where: { id: r.id, consumidoEn: null }, data: { estado: 'collected', consumidoEn: at, fechaRetiro: at, bibliotecarioId: actor(req).id,
      detalles: { updateMany: { where: {}, data: { estado: 'collected', fechaLimiteDevol: due(at) } } } } })
    await audit(tx,actor(req),'loan','Entrega de reserva.','reservas',r.id,{ estado: r.estado },{ estado: 'collected', fechaRetiro: at })
    const receipts = await Promise.all(r.detalles.map(d => receipt(tx,d.id,'loan')))
    return { ...receipts[0], receipts }
  }))
}))
circulationRoutes.post('/circulation/checkout', requirePermission('circulation:write'), route(async (req,res) => {
  const input = z.object({ userCode: idSchema, copyId: idSchema }).strict().parse(req.body)
  res.json(await transaction(async tx => {
    const reader = await tx.usuario.findUniqueOrThrow({ where: { codigoUsuario: input.userCode.toUpperCase() } })
    await eligible(tx,reader.id,1)
    const copy = await tx.ejemplar.findUniqueOrThrow({ where: { codigoInventario: input.copyId } })
    if (!await tx.ejemplar.updateMany({ where: { id: copy.id, estado: 'available', condicion: { in: [...lendable] } }, data: { estado: 'loaned' } }).then(r => r.count)) return fail(409,'Ejemplar no disponible.')
    return receipt(tx,await immediate(tx,reader,actor(req),copy.libroId,copy.id),'loan')
  }))
}))
async function checkin(tx: Tx, id: bigint, who: Usuario) {
  const d = await tx.reservaDetalle.findUniqueOrThrow({ where: { id }, include: { reserva: true } })
  if (d.estado !== 'collected' || !d.fechaLimiteDevol) return fail(409,'El préstamo ya no está activo.')
  const at = new Date()
  await tx.reservaDetalle.update({ where: { id, estado: 'collected' }, data: { fechaDevolucion: at, estado: 'returned' } })
  if (d.ejemplarId) await tx.ejemplar.update({ where: { id: d.ejemplarId }, data: { estado: 'available' } })
  const days = Math.max(0, Math.ceil((at.getTime()-d.fechaLimiteDevol.getTime())/DAY))
  let fine = null
  if (days) {
    const usuarioId = d.reserva.usuarioId
    const incident = await tx.incidencia.create({ data: { usuarioId, registradoPor: who.id, reservaDetalleId: id, tipo: 'mora', descripcion: 'Devolución fuera de plazo.', evidencias: [] } })
    const s = await tx.sancion.create({ data: { usuarioId, registradoPor: who.id, incidenciaId: incident.id, dias: days, monto: Math.round(days*policy.finePerDay*100)/100 }, include: fineInclude })
    fine = fineDto(s)
    await tx.notificacion.create({ data: { usuarioId, sancionId: s.id, reservaDetalleId: id, tipo: 'sancion', asunto: 'Sanción por mora', mensaje: 'La devolución superó el plazo por '+days+' día(s).', estado: 'enviada', fechaEnvio: at } })
  }
  await audit(tx,who,'return','Devolución registrada.','reserva_detalle',id,{ estado: d.estado },{ estado: 'returned', fechaDevolucion: at, fine })
  return receipt(tx,id,'return',fine)
}
circulationRoutes.post('/circulation/checkin', requirePermission('circulation:write'), route(async (req,res) => {
  const { copyId } = z.object({ copyId: idSchema }).strict().parse(req.body)
  res.json(await transaction(async tx => {
    const d = await tx.reservaDetalle.findFirst({ where: { ejemplar: { codigoInventario: copyId }, estado: 'collected' } })
    if (!d) return fail(409,'El ejemplar no tiene un préstamo activo.')
    return checkin(tx,d.id,actor(req))
  }))
}))
circulationRoutes.post('/loans/:id/renew', requirePermission('loan:renew'), route(async (req,res) => {
  const id = paramId(req)
  emptyBody.parse(req.body ?? {})
  const loan = await transaction(async tx => {
    const d = await tx.reservaDetalle.findUniqueOrThrow({ where: { id }, include: loanInclude })
    if (d.reserva.usuarioId !== actor(req).id) return fail(403,'Préstamo ajeno.')
    await eligible(tx,actor(req).id)
    if (d.estado !== 'collected' || !d.fechaLimiteDevol || d.fechaLimiteDevol <= new Date() || d.renovaciones >= policy.maxRenewals) return fail(409,'El préstamo no admite renovación.')
    if (await tx.reservaDetalle.count({ where: { libroId: d.libroId, reserva: { usuarioId: { not: actor(req).id }, estado: { in: [...activeStatuses] } } } })) return fail(409,'Otro lector ha reservado el título.')
    const next = await tx.reservaDetalle.update({ where: { id }, data: { renovaciones: { increment: 1 }, fechaLimiteDevol: new Date(d.fechaLimiteDevol.getTime()+policy.renewalDays*DAY) }, include: loanInclude })
    await audit(tx,actor(req),'renewal','Renovación registrada.','reserva_detalle',id,loanDto(d),loanDto(next))
    return loanDto(next)
  })
  res.json({ loan })
}))
circulationRoutes.post('/loans/digital', requirePermission('reservation:create'), route(async (req,res) => {
  const { bookId } = z.object({ bookId: dbId }).strict().parse(req.body)
  const loan = await transaction(async tx => {
    const user = await eligible(tx,actor(req).id,1)
    const book = await tx.libro.findUniqueOrThrow({ where: { id: bookId } })
    if (book.formato === 'fisico') return fail(409,'Sin edición digital.')
    if (await tx.reservaDetalle.count({ where: { reserva: { usuarioId: user.id }, libroId: bookId, ejemplarId: null, estado: 'collected' } })) return fail(409,'Ya tienes este e-book.')
    const id = await immediate(tx,user,user,bookId,null)
    return loanDto(await tx.reservaDetalle.findUniqueOrThrow({ where: { id }, include: loanInclude }))
  })
  res.status(201).json({ loan })
}))
circulationRoutes.post('/loans/:id/return-digital', requirePermission('loan:renew'), route(async (req,res) => {
  const id = paramId(req)
  emptyBody.parse(req.body ?? {})
  await transaction(async tx => {
    const d = await tx.reservaDetalle.findUniqueOrThrow({ where: { id }, include: loanInclude })
    if (d.reserva.usuarioId !== actor(req).id) return fail(403,'Préstamo ajeno.')
    if (d.ejemplarId) return fail(409,'Devuelve este ejemplar en mostrador.')
    await checkin(tx,id,actor(req))
  })
  res.json({ ok: true })
}))

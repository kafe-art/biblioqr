import { z } from 'zod'
import { Router } from 'express'
import { actor, requireAuth, requirePermission } from '../auth'
import { transaction } from '../db'
import { audit } from '../domain'
import { dbId, emptyBody, fail, paramId, route } from '../http'

export const fineRoutes = Router()
fineRoutes.use(requireAuth)
for (const operation of ['pay', 'waive'] as const) {
  fineRoutes.post(`/fines/:id/${operation}`, requirePermission(operation === 'pay' ? 'circulation:write' : 'fine:waive'), route(async (req, res) => {
    const id = paramId(req); emptyBody.parse(req.body ?? {})
    await transaction(async tx => {
      const fine = await tx.sancion.findUnique({ where: { id } })
      if (!fine) return fail(404, 'Multa no encontrada.')
      if (!(await tx.sancion.updateMany({ where: { id, estado: 'pending' }, data: { fechaResolucion: new Date(), estado: operation === 'pay' ? 'paid' : 'waived' } })).count) return fail(409, 'La multa ya no está pendiente.')
      await tx.incidencia.update({ where: { id: fine.incidenciaId }, data: { estado: 'resuelta' } })
      await audit(tx, actor(req), 'fine', `Multa ${id} ${operation === 'pay' ? 'pagada' : 'condonada'}.`, 'sanciones', id, { estado: fine.estado }, { estado: operation === 'pay' ? 'paid' : 'waived' })
    })
    res.json({ ok: true })
  }))
}

fineRoutes.post('/incidencias', requirePermission('circulation:write'), route(async (req,res) => {
  const input = z.object({ loanId: dbId, tipo: z.enum(['dano','perdida','otro']), descripcion: z.string().trim().min(1).max(2000) }).strict().parse(req.body)
  const id = await transaction(async tx => {
    const d = await tx.reservaDetalle.findUniqueOrThrow({ where: { id: input.loanId, fechaLimiteDevol: { not: null } }, include: { reserva: true } })
    const i = await tx.incidencia.create({ data: { usuarioId: d.reserva.usuarioId, registradoPor: actor(req).id, reservaDetalleId: d.id, tipo: input.tipo, descripcion: input.descripcion, evidencias: [] } })
    await tx.notificacion.create({ data: { usuarioId: i.usuarioId, reservaDetalleId: d.id, tipo: 'incidencia', asunto: 'Incidencia registrada', mensaje: input.descripcion, estado: 'enviada', fechaEnvio: new Date() } })
    await audit(tx,actor(req),'inventory','Incidencia registrada.','incidencias',i.id,null,i)
    return String(i.id)
  })
  res.status(201).json({ id })
}))
fineRoutes.post('/avisos/:id/leer', requireAuth, route(async (req,res) => {
  const id = paramId(req)
  emptyBody.parse(req.body ?? {})
  await transaction(tx => tx.notificacion.update({ where: { id, usuarioId: actor(req).id }, data: { estado: 'leida' } }))
  res.json({ ok: true })
}))

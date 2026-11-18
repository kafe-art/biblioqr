import { Router } from 'express'
import { actor, requireAuth, requirePermission } from '../auth'
import { transaction } from '../db'
import { audit } from '../domain'
import { emptyBody, fail, paramId, route } from '../http'

export const fineRoutes = Router()
fineRoutes.use(requireAuth)
for (const operation of ['pay', 'waive'] as const) {
  fineRoutes.post(`/fines/:id/${operation}`, requirePermission(operation === 'pay' ? 'circulation:write' : 'fine:waive'), route(async (req, res) => {
    const id = paramId(req); emptyBody.parse(req.body ?? {})
    await transaction(async tx => {
      const fine = await tx.fine.findUnique({ where: { id } })
      if (!fine) return fail(404, 'Multa no encontrada.')
      if (!(await tx.fine.updateMany({ where: { id, status: 'pending' }, data: { status: operation === 'pay' ? 'paid' : 'waived' } })).count) return fail(409, 'La multa ya no está pendiente.')
      await audit(tx, actor(req), 'fine', `Multa ${id} ${operation === 'pay' ? 'pagada' : 'condonada'}.`)
    })
    res.json({ ok: true })
  }))
}

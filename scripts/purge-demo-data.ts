import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { SEED } from '../src/data/seed'

const db = new PrismaClient()
async function main() {
  await db.$transaction(async tx => {
    const markers = await tx.auditoria.findMany({ where: { actorNombre: 'seed-history', accion: 'seed-history', entidad: 'usuarios' }, select: { entidadId: true } })
    const users = await tx.usuario.findMany({ where: { id: { in: markers.flatMap(m => m.entidadId ? [m.entidadId] : []) }, email: { in: SEED.users.map(u => u.email) } } })
    const ids = users.map(u => u.id)
    if (!ids.length) return
    const demo = { usuarioId: { in: ids }, nonce: { startsWith: 'seed-history-v4-' } }
    const incident = { detalle: { reserva: demo } }
    await tx.sancion.deleteMany({ where: { incidencia: incident } })
    await tx.incidencia.deleteMany({ where: incident })
    await tx.reservaDetalle.deleteMany({ where: { reserva: demo } })
    await tx.reserva.deleteMany({ where: demo })
    for (const user of users) {
      const used = await tx.usuario.count({ where: { id: user.id, OR: [{ reservas: { some: {} } }, { retiros: { some: {} } }, { auditoria: { some: {} } },
        { avisos: { some: {} } }, { incidencias: { some: {} } }, { reportes: { some: {} } }, { registros: { some: {} } }, { sanciones: { some: {} } }] } })
      if (!used) await tx.usuario.delete({ where: { id: user.id } })
    }
  }, { isolationLevel: 'Serializable' })
}
main().catch(() => { console.error('No se pudo limpiar el historial de demostración.'); process.exitCode = 1 }).finally(() => db.$disconnect())

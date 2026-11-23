import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { SEED } from '../src/data/seed'
import { POLICY } from '../src/lib/rules'
import { seedCatalog } from './seed-data'

const db = new PrismaClient()
const day = 86400000

async function main() {
  const password = process.env.SEED_DEMO_PASSWORD
  if (!password || password.length < 12) throw new Error('Configura SEED_DEMO_PASSWORD con al menos 12 caracteres.')
  const passwordHash = await bcrypt.hash(password,12)
  await db.$transaction(async tx => {
    await seedCatalog(tx)
    if (await tx.reserva.findFirst({ where: { nonce: 'seed-history-v4-0' } })) return
    const readers: bigint[] = []
    for (const u of SEED.users) {
      const user = await tx.usuario.create({ data: { codigoUsuario: u.code, nombres: u.name, email: u.email, rol: u.role,
        activo: u.status === 'active', facultad: u.faculty, carrera: u.career, ip: u.ip, passwordHash } })
      await tx.auditoria.create({ data: { actorNombre: 'seed-history', actorRol: 'system', accion: 'seed-history', entidad: 'usuarios', entidadId: user.id, descripcion: 'Cuenta de demostración.' } })
      if (user.rol === 'student' && user.activo) readers.push(user.id)
    }
    const staff = await tx.usuario.findFirstOrThrow({ where: { rol: 'librarian', email: { in: SEED.users.map(u => u.email) } } })
    const books = await tx.libro.findMany({ where: { isbn: { in: SEED.books.map(b => b.isbn) }, ejemplares: { some: {} } }, include: { ejemplares: true }, orderBy: { id: 'asc' } })
    const circulating = books.slice(0,-5)
    if (!circulating.length || !readers.length) throw new Error('El catálogo de prueba requiere lectores y seis títulos físicos.')
    for (let i=0; i<56; i++) {
      const book = circulating[i % circulating.length]
      const usuarioId = readers[i % readers.length]
      const returned = new Date(Date.now() - (56-i)*day)
      const daysLate = i % 7 === 0 ? 2 : 0
      const at = new Date(returned.getTime() - (POLICY.loanDays+daysLate)*day)
      const expired = i % 9 === 1
      const r = await tx.reserva.create({ data: { nonce: 'seed-history-v4-'+i, usuarioId, bibliotecarioId: expired ? null : staff.id, metodoRetiro: 'desk',
        fechaReserva: at, retiroProgramado: at, fechaExpiracion: new Date(at.getTime()+day), fechaRetiro: expired ? null : at, consumidoEn: expired ? null : at,
        estado: expired ? 'expired' : 'collected', detalles: { create: { posicion: 1, libroId: book.id, ejemplarId: book.ejemplares[0].id,
          estado: expired ? 'expired' : 'returned', fechaLimiteDevol: expired ? null : new Date(returned.getTime()-daysLate*day), fechaDevolucion: expired ? null : returned } } }, include: { detalles: true } })
      if (daysLate && !expired) {
        const incident = await tx.incidencia.create({ data: { usuarioId, registradoPor: staff.id, tipo: 'mora', reservaDetalleId: r.detalles[0].id,
          descripcion: 'Devolución tardía de demostración.', evidencias: [], fechaIncidencia: returned, createdAt: returned } })
        const paid = i % 2 === 0
        await tx.sancion.create({ data: { usuarioId, incidenciaId: incident.id, registradoPor: staff.id, dias: daysLate, monto: daysLate*POLICY.finePerDay,
          fechaInicio: returned, createdAt: returned, estado: paid ? 'paid' : 'pending', fechaResolucion: paid ? returned : null } })
        if (paid) await tx.incidencia.update({ where: { id: incident.id }, data: { estado: 'resuelta' } })
      }
    }
  }, { timeout: 120000, isolationLevel: 'Serializable' })
  console.log('Historial de demostración listo.')
}
main().catch(e => { console.error(e.message); process.exitCode = 1 }).finally(() => db.$disconnect())

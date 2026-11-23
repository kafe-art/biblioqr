import type { Auditoria, Categoria, Ejemplar, Incidencia, Libro, Reserva, ReservaDetalle, Sancion, Usuario } from '@prisma/client'

export const catalogInclude = { categoria: true, ejemplares: true } as const
export const reservationInclude = { detalles: { orderBy: { posicion: 'asc' as const }, include: { ejemplar: true } } }
export const loanInclude = { reserva: true, ejemplar: true } as const
export const fineInclude = { incidencia: { include: { detalle: true } } } as const
export const userDto = (u: Usuario) => ({
  id: String(u.id), code: u.codigoUsuario, name: [u.nombres,u.apellidos].filter(Boolean).join(' '), email: u.email,
  role: u.rol, status: u.activo ? 'active' : 'blocked', ip: u.ip, faculty: u.facultad, career: u.carrera, lastAccess: u.ultimoAcceso.getTime(),
})
export const copyDto = (c: Ejemplar) => ({ id: c.codigoInventario, inventoryId: String(c.id), status: c.estado, condition: c.condicion })
export const bookDto = (b: Libro & { categoria: Categoria; ejemplares: Ejemplar[] }) => ({
  id: String(b.id), title: b.titulo, editorial: b.editorial, author: b.autor, year: b.anioPublicacion, genre: b.categoria.nombre, isbn: b.isbn,
  synopsis: b.descripcion, coverUrl: b.portadaPath, faculties: b.facultades, format: b.formato, pages: b.paginas, location: b.ubicacion,
  demand: b.demanda, addedAt: b.createdAt.getTime(), copies: b.ejemplares.map(copyDto),
})
export const loanDto = (d: ReservaDetalle & { reserva: Reserva; ejemplar: Ejemplar | null }) => ({
  id: String(d.id), reservationId: String(d.reservaId), userId: String(d.reserva.usuarioId), bookId: String(d.libroId),
  copyId: d.ejemplar?.codigoInventario ?? null, loanedAt: d.reserva.fechaRetiro?.getTime(), dueAt: d.fechaLimiteDevol?.getTime(),
  returnedAt: d.fechaDevolucion?.getTime() ?? null, renewals: d.renovaciones,
})
export const fineDto = (f: Sancion & { incidencia: Incidencia & { detalle: ReservaDetalle } }) => ({
  id: String(f.id), userId: String(f.usuarioId), loanId: String(f.incidencia.reservaDetalleId), bookId: String(f.incidencia.detalle.libroId),
  days: f.dias, amount: Number(f.monto), status: f.estado, createdAt: f.createdAt.getTime(), incidentId: String(f.incidenciaId),
})
export const auditDto = (a: Auditoria) => ({
  id: String(a.id), seq: String(a.seq), ts: a.createdAt.getTime(), actorName: a.actorNombre, actorRole: a.actorRol, action: a.accion,
  detail: a.descripcion, ip: a.ipOrigen, before: a.datosAnteriores, after: a.datosNuevos,
})

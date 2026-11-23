import { Prisma } from '@prisma/client'
import { Router } from 'express'
import { z } from 'zod'
import { requireAuth, requirePermission } from '../auth'
import { transaction, type Tx } from '../db'
import { route } from '../http'
import { POLICY } from '../../src/lib/rules'
import { REPORT_IDLE_LIMIT, type WeeklyKpis, type WeeklyReport } from '../../shared/reports'

const DAY = 86_400_000
const OFFSET = 5 * 3_600_000
const dateKey = (at: number) => new Date(at - OFFSET).toISOString().slice(0, 10)
const period = (from: number, to: number) => ({ gte: new Date(from), lt: new Date(to) })
const roundMoney = (amount: number) => Math.round(amount * 100) / 100
const querySchema = z.object({
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
    const date = new Date(`${value}T00:00:00Z`)
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value && date.getUTCFullYear() >= 1900 && date.getUTCFullYear() <= 9998
  }, 'Fecha inválida').optional(),
}).strict()

// Only static, quoted column fragments are passed here; dates remain SQL parameters.
function localParts(column: Prisma.Sql) {
  const local = Prisma.sql`(${column} AT TIME ZONE 'America/Lima')`
  return {
    weekday: Prisma.sql`CAST(EXTRACT(ISODOW FROM ${local}) AS INTEGER) - 1`,
    hour: Prisma.sql`CAST(EXTRACT(HOUR FROM ${local}) AS INTEGER)`,
  }
}

type SqlNumber = number | bigint

async function weeklyKpis(tx: Tx, from: number, to: number, now: number): Promise<WeeklyKpis> {
  const cutoff = new Date(Math.min(to, now))
  const window = period(from, to)
  const active: Prisma.ReservaDetalleWhereInput = { reserva: { fechaRetiro: { lt: cutoff } }, OR: [{ fechaDevolucion: null }, { fechaDevolucion: { gt: cutoff } }] }
  const resolved: Prisma.ReservaWhereInput = { fechaExpiracion: period(from, Math.min(to, now)), estado: { not: 'cancelled' } }
  const [loans, returns, open, overdue, issued, payments, reservations, expired, missed, activeUsers, added] = await Promise.all([
    tx.reservaDetalle.count({ where: { reserva: { fechaRetiro: window } } }),
    tx.reservaDetalle.count({ where: { fechaDevolucion: window } }), tx.reservaDetalle.count({ where: active }),
    tx.reservaDetalle.count({ where: { ...active, fechaLimiteDevol: { lt: cutoff } } }),
    tx.sancion.aggregate({ where: { createdAt: window }, _sum: { monto: true } }),
    tx.sancion.aggregate({ where: { estado: 'paid', fechaResolucion: window }, _sum: { monto: true } }),
    tx.reserva.count({ where: { fechaReserva: window } }), tx.reserva.count({ where: resolved }),
    tx.reserva.count({ where: { ...resolved, consumidoEn: null } }),
    tx.usuario.count({ where: { reservas: { some: { OR: [{ fechaReserva: window }, { fechaRetiro: window }, { detalles: { some: { fechaDevolucion: window } } }] } } } }),
    tx.usuario.count({ where: { createdAt: window } }),
  ])
  return {
    loans, returns, overdueRate: open ? overdue / open : 0,
    finesIssued: roundMoney(Number(issued._sum.monto ?? 0)),
    finesCollected: roundMoney(Number(payments._sum.monto ?? 0)),
    reservations, noShowRate: expired ? missed / expired : 0,
    activeUsers, newUsers: added,
  }
}

export const reportRoutes = Router()
reportRoutes.get('/admin/reports/weekly', requireAuth, requirePermission('analytics:read'), route(async (req, res) => {
  const input = querySchema.parse(req.query)
  const now = Date.now()
  const chosen = new Date(`${input.start ?? dateKey(now)}T00:00:00Z`)
  chosen.setUTCDate(chosen.getUTCDate() - (chosen.getUTCDay() + 6) % 7)
  const start = chosen.getTime() + OFFSET
  const end = start + 7 * DAY
  const asOf = Math.min(end, now)
  const idleBefore = asOf - POLICY.idleDays * DAY
  const loanParts = localParts(Prisma.sql`fecha_retiro`)
  const returnParts = localParts(Prisma.sql`fecha_devolucion`)

  // The shared helper applies a 10s timeout and retries serialization conflicts.
  // Only aggregates, the top 10, and at most REPORT_IDLE_LIMIT books leave SQL.
  const report = await transaction(async tx => {
    const [kpis, prev, slots, returnDays, top, idle, genres] = await Promise.all([
      weeklyKpis(tx, start, end, now),
      weeklyKpis(tx, start - 7 * DAY, start, now),
      tx.$queryRaw<{ weekday: number; hour: number; loans: SqlNumber }[]>(Prisma.sql`
        SELECT ${loanParts.weekday} AS "weekday", ${loanParts.hour} AS "hour", COUNT(*) AS "loans"
        FROM reserva_detalle d JOIN reservas r ON r.id = d.reserva_id WHERE fecha_retiro >= ${new Date(start)} AND fecha_retiro < ${new Date(end)}
        GROUP BY ${loanParts.weekday}, ${loanParts.hour}`),
      tx.$queryRaw<{ weekday: number; returns: SqlNumber }[]>(Prisma.sql`
        SELECT ${returnParts.weekday} AS "weekday", COUNT(*) AS "returns"
        FROM reserva_detalle d JOIN reservas r ON r.id = d.reserva_id WHERE fecha_devolucion >= ${new Date(start)} AND fecha_devolucion < ${new Date(end)}
        GROUP BY ${returnParts.weekday}`),
      tx.reservaDetalle.groupBy({
        by: ['libroId'], where: { reserva: { fechaRetiro: period(start, end) } },
        _count: { libroId: true }, orderBy: [{ _count: { libroId: 'desc' } }, { libroId: 'asc' }], take: 10,
      }),
      tx.libro.findMany({
        where: {
          createdAt: { lte: new Date(idleBefore) },
          detalles: { none: { reserva: { fechaRetiro: { gt: new Date(idleBefore), lt: new Date(asOf) } } } },
        },
        orderBy: [{ titulo: 'asc' }, { id: 'asc' }], take: REPORT_IDLE_LIMIT,
        select: {
          id: true, titulo: true, _count: { select: { ejemplares: true } },
          detalles: { where: { reserva: { fechaRetiro: { lt: new Date(asOf) } } }, orderBy: { reserva: { fechaRetiro: 'desc' } }, take: 1, select: { reserva: { select: { fechaRetiro: true } } } },
        },
      }),
      // Group by genre in SQL. Utilization counts only lendable physical copies
      // on both sides, once per copy even if it circulated repeatedly this week.
      tx.$queryRaw<{ genre: string; loans: SqlNumber; copies: SqlNumber; used: SqlNumber }[]>(Prisma.sql`
        SELECT COALESCE(NULLIF(g.nombre, ''), 'Sin género') AS "genre",
          SUM(COALESCE(l."total", 0)) AS "loans",
          SUM(CASE WHEN b.formato <> 'digital' THEN COALESCE(c."total", 0) ELSE 0 END) AS "copies",
          SUM(CASE WHEN b.formato <> 'digital' THEN COALESCE(c."used", 0) ELSE 0 END) AS "used"
        FROM libros b JOIN categorias g ON g.id = b.categoria_id
        LEFT JOIN (
          SELECT libro_id, COUNT(*) AS "total" FROM reserva_detalle d JOIN reservas r ON r.id = d.reserva_id
          WHERE fecha_retiro >= ${new Date(start)} AND fecha_retiro < ${new Date(end)} GROUP BY libro_id
        ) l ON l.libro_id = b."id"
        LEFT JOIN (
          SELECT c.libro_id, COUNT(*) AS "total", SUM(CASE WHEN EXISTS (
            SELECT 1 FROM reserva_detalle d JOIN reservas r ON r.id = d.reserva_id WHERE d.ejemplar_id = c."id" AND d.libro_id = c.libro_id
              AND r.fecha_retiro >= ${new Date(start)} AND r.fecha_retiro < ${new Date(end)}
          ) THEN 1 ELSE 0 END) AS "used"
          FROM ejemplares c WHERE c.condicion IN ('excelente', 'regular') GROUP BY c.libro_id
        ) c ON c.libro_id = b."id"
        WHERE b.created_at < ${new Date(asOf)}
        GROUP BY COALESCE(NULLIF(g.nombre, ''), 'Sin género')
        ORDER BY "loans" DESC, "genre" ASC`),
    ])
    const titles = await tx.libro.findMany({
      where: { id: { in: top.map(b => b.libroId) } }, take: 10, select: { id: true, titulo: true },
    })
    const bookTitles = new Map(titles.map(b => [b.id, b.titulo]))
    const hourly = Array.from({ length: 168 }, (_, i) => ({ weekday: Math.floor(i / 24), hour: i % 24, loans: 0 }))
    for (const slot of slots) hourly[Number(slot.weekday) * 24 + Number(slot.hour)].loans = Number(slot.loans)
    const daily = Array.from({ length: 7 }, (_, i) => ({
      date: dateKey(start + i * DAY),
      loans: hourly.slice(i * 24, (i + 1) * 24).reduce((sum, h) => sum + h.loans, 0),
      returns: Number(returnDays.find(d => Number(d.weekday) === i)?.returns ?? 0),
    }))
    return {
      range: { start: dateKey(start), end: dateKey(end - 1) }, kpis, prev, daily,
      topBooks: top.map(b => ({ bookId: String(b.libroId), title: bookTitles.get(b.libroId) ?? 'Libro no disponible', loans: b._count.libroId })),
      idleBooks: idle.map(b => ({ bookId: String(b.id), title: b.titulo, copies: b._count.ejemplares, lastLoanAt: b.detalles[0]?.reserva.fechaRetiro?.toISOString() ?? null })),
      byGenre: genres.map(g => ({ genre: g.genre, loans: Number(g.loans), utilization: Number(g.copies) ? Number(g.used) / Number(g.copies) : 0 })),
      hourly,
    } satisfies WeeklyReport
  })
  res.setHeader('Cache-Control', 'no-store')
  res.json(report)
}))

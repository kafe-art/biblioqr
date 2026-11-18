import { Prisma } from '@prisma/client'
import { Router } from 'express'
import { z } from 'zod'
import { requireAuth, requirePermission } from '../auth'
import { transaction, type Tx } from '../db'
import { env } from '../env'
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
// Prisma stores SQLite DateTime as epoch milliseconds and PostgreSQL timestamps as UTC.
function localParts(column: Prisma.Sql) {
  if (env.DATABASE_URL.startsWith('file:')) {
    const local = Prisma.sql`datetime(${column} / 1000.0, 'unixepoch', '-5 hours')`
    return {
      weekday: Prisma.sql`((CAST(strftime('%w', ${local}) AS INTEGER) + 6) % 7)`,
      hour: Prisma.sql`CAST(strftime('%H', ${local}) AS INTEGER)`,
    }
  }
  const local = Prisma.sql`((${column} AT TIME ZONE 'UTC') AT TIME ZONE 'America/Lima')`
  return {
    weekday: Prisma.sql`CAST(EXTRACT(ISODOW FROM ${local}) AS INTEGER) - 1`,
    hour: Prisma.sql`CAST(EXTRACT(HOUR FROM ${local}) AS INTEGER)`,
  }
}

type SqlNumber = number | bigint

async function weeklyKpis(tx: Tx, from: number, to: number, now: number): Promise<WeeklyKpis> {
  const cutoff = new Date(Math.min(to, now))
  const window = period(from, to)
  const active: Prisma.LoanWhereInput = {
    loanedAt: { lt: cutoff },
    OR: [{ returnedAt: null }, { returnedAt: { gt: cutoff } }],
  }
  const resolved: Prisma.ReservationWhereInput = {
    expiresAt: period(from, Math.min(to, now)), status: { not: 'cancelled' },
  }
  const [loans, returns, open, overdue, issued, payments, reservations, expired, missed, activeUsers, added] = await Promise.all([
    tx.loan.count({ where: { loanedAt: window } }),
    tx.loan.count({ where: { returnedAt: window } }),
    tx.loan.count({ where: active }),
    tx.loan.count({ where: { ...active, dueAt: { lt: cutoff } } }),
    tx.fine.aggregate({ where: { createdAt: window }, _sum: { amount: true } }),
    // Payment dates are recorded only in audit. EXISTS prevents duplicate events
    // from charging the same fine twice without loading any fine/event rows.
    tx.$queryRaw<{ amount: number }[]>(Prisma.sql`
      SELECT COALESCE(SUM(f."amount"), 0) AS "amount" FROM "Fine" f
      WHERE EXISTS (
        SELECT 1 FROM "AuditEntry" a
        WHERE a."action" = 'fine' AND a."ts" >= ${new Date(from)} AND a."ts" < ${new Date(to)}
          AND a."detail" = ('Multa ' || f."id" || ' pagada.')
      )`),
    tx.reservation.count({ where: { createdAt: window } }),
    tx.reservation.count({ where: resolved }),
    tx.reservation.count({ where: {
      ...resolved,
      OR: [{ consumedAt: null }, { consumedAt: { gte: tx.reservation.fields.expiresAt } }],
    } }),
    tx.user.count({ where: { OR: [
      { loans: { some: { loanedAt: window } } },
      { loans: { some: { returnedAt: window } } },
      { reservations: { some: { createdAt: window } } },
    ] } }),
    tx.$queryRaw<{ count: SqlNumber }[]>(Prisma.sql`
      SELECT COUNT(*) AS "count" FROM "User" u
      WHERE EXISTS (
        SELECT 1 FROM "AuditEntry" a
        WHERE a."action" = 'user' AND a."ts" >= ${new Date(from)} AND a."ts" < ${new Date(to)}
          AND a."detail" = ('Alta de usuario ' || u."id" || '.')
      )`),
  ])
  return {
    loans, returns, overdueRate: open ? overdue / open : 0,
    finesIssued: roundMoney(issued._sum.amount ?? 0),
    finesCollected: roundMoney(Number(payments[0]?.amount ?? 0)),
    reservations, noShowRate: expired ? missed / expired : 0,
    activeUsers, newUsers: Number(added[0]?.count ?? 0),
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
  const loanParts = localParts(Prisma.sql`"loanedAt"`)
  const returnParts = localParts(Prisma.sql`"returnedAt"`)

  // The shared helper applies a 10s timeout and retries serialization conflicts.
  // Only aggregates, the top 10, and at most REPORT_IDLE_LIMIT books leave SQL.
  const report = await transaction(async tx => {
    const [kpis, prev, slots, returnDays, top, idle, genres] = await Promise.all([
      weeklyKpis(tx, start, end, now),
      weeklyKpis(tx, start - 7 * DAY, start, now),
      tx.$queryRaw<{ weekday: number; hour: number; loans: SqlNumber }[]>(Prisma.sql`
        SELECT ${loanParts.weekday} AS "weekday", ${loanParts.hour} AS "hour", COUNT(*) AS "loans"
        FROM "Loan" WHERE "loanedAt" >= ${new Date(start)} AND "loanedAt" < ${new Date(end)}
        GROUP BY ${loanParts.weekday}, ${loanParts.hour}`),
      tx.$queryRaw<{ weekday: number; returns: SqlNumber }[]>(Prisma.sql`
        SELECT ${returnParts.weekday} AS "weekday", COUNT(*) AS "returns"
        FROM "Loan" WHERE "returnedAt" >= ${new Date(start)} AND "returnedAt" < ${new Date(end)}
        GROUP BY ${returnParts.weekday}`),
      tx.loan.groupBy({
        by: ['bookId'], where: { loanedAt: period(start, end) },
        _count: { bookId: true }, orderBy: [{ _count: { bookId: 'desc' } }, { bookId: 'asc' }], take: 10,
      }),
      tx.book.findMany({
        where: {
          addedAt: { lte: new Date(idleBefore) },
          loans: { none: { loanedAt: { gt: new Date(idleBefore), lt: new Date(asOf) } } },
        },
        orderBy: [{ title: 'asc' }, { id: 'asc' }], take: REPORT_IDLE_LIMIT,
        select: {
          id: true, title: true, _count: { select: { copies: true } },
          loans: { where: { loanedAt: { lt: new Date(asOf) } }, orderBy: { loanedAt: 'desc' }, take: 1, select: { loanedAt: true } },
        },
      }),
      // Group by genre in SQL. Utilization counts only lendable physical copies
      // on both sides, once per copy even if it circulated repeatedly this week.
      tx.$queryRaw<{ genre: string; loans: SqlNumber; copies: SqlNumber; used: SqlNumber }[]>(Prisma.sql`
        SELECT COALESCE(NULLIF(b."genre", ''), 'Sin género') AS "genre",
          SUM(COALESCE(l."total", 0)) AS "loans",
          SUM(CASE WHEN b."format" <> 'digital' THEN COALESCE(c."total", 0) ELSE 0 END) AS "copies",
          SUM(CASE WHEN b."format" <> 'digital' THEN COALESCE(c."used", 0) ELSE 0 END) AS "used"
        FROM "Book" b
        LEFT JOIN (
          SELECT "bookId", COUNT(*) AS "total" FROM "Loan"
          WHERE "loanedAt" >= ${new Date(start)} AND "loanedAt" < ${new Date(end)} GROUP BY "bookId"
        ) l ON l."bookId" = b."id"
        LEFT JOIN (
          SELECT c."bookId", COUNT(*) AS "total", SUM(CASE WHEN EXISTS (
            SELECT 1 FROM "Loan" u WHERE u."copyId" = c."id" AND u."bookId" = c."bookId"
              AND u."loanedAt" >= ${new Date(start)} AND u."loanedAt" < ${new Date(end)}
          ) THEN 1 ELSE 0 END) AS "used"
          FROM "Copy" c WHERE c."condition" IN ('excelente', 'regular') GROUP BY c."bookId"
        ) c ON c."bookId" = b."id"
        WHERE b."addedAt" < ${new Date(asOf)}
        GROUP BY COALESCE(NULLIF(b."genre", ''), 'Sin género')
        ORDER BY "loans" DESC, "genre" ASC`),
    ])
    const titles = await tx.book.findMany({
      where: { id: { in: top.map(b => b.bookId) } }, take: 10, select: { id: true, title: true },
    })
    const bookTitles = new Map(titles.map(b => [b.id, b.title]))
    const hourly = Array.from({ length: 168 }, (_, i) => ({ weekday: Math.floor(i / 24), hour: i % 24, loans: 0 }))
    for (const slot of slots) hourly[Number(slot.weekday) * 24 + Number(slot.hour)].loans = Number(slot.loans)
    const daily = Array.from({ length: 7 }, (_, i) => ({
      date: dateKey(start + i * DAY),
      loans: hourly.slice(i * 24, (i + 1) * 24).reduce((sum, h) => sum + h.loans, 0),
      returns: Number(returnDays.find(d => Number(d.weekday) === i)?.returns ?? 0),
    }))
    return {
      range: { start: dateKey(start), end: dateKey(end - 1) }, kpis, prev, daily,
      topBooks: top.map(b => ({ bookId: b.bookId, title: bookTitles.get(b.bookId) ?? 'Libro no disponible', loans: b._count.bookId })),
      idleBooks: idle.map(b => ({ bookId: b.id, title: b.title, copies: b._count.copies, lastLoanAt: b.loans[0]?.loanedAt.toISOString() ?? null })),
      byGenre: genres.map(g => ({ genre: g.genre, loans: Number(g.loans), utilization: Number(g.copies) ? Number(g.used) / Number(g.copies) : 0 })),
      hourly,
    } satisfies WeeklyReport
  })
  res.setHeader('Cache-Control', 'no-store')
  res.json(report)
}))

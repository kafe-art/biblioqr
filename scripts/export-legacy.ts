import { DatabaseSync } from 'node:sqlite'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

interface RawUserRow {
  id: string
  code: string
  email: string
  name: string
  role: string
  status: string
  passwordHash: string
  faculty: string
  career: string
  ip: string
  lastAccess: number | string
}

interface RawBookRow {
  id: string
  isbn: string
  title: string
  author: string
  year: number
  genre: string
  faculties: string
  synopsis: string
  format: string
  pages: number
  location: string
  addedAt: number | string
  demand: number
  coverUrl: string | null
}

interface RawCopyRow {
  id: string
  bookId: string
  condition: string
  status: string
}

interface RawReservationRow {
  id: string
  code: string
  bookId: string
  copyId: string
  userId: string
  createdAt: number | string
  pickupAt: number | string
  expiresAt: number | string
  method: string
  locker: string | null
  status: string
  nonce: string
  consumedAt: number | string | null
}

interface RawLoanRow {
  id: string
  bookId: string
  copyId: string | null
  userId: string
  loanedAt: number | string
  dueAt: number | string
  returnedAt: number | string | null
  renewals: number
}

interface RawFineRow {
  id: string
  userId: string
  loanId: string
  bookId: string
  days: number
  amount: number
  createdAt: number | string
  status: string
}

interface RawAuditRow {
  id: string
  seq: number
  ts: number | string
  actorName: string
  actorRole: string
  action: string
  detail: string
  ip: string
}

function toIso(value: number | string | null | undefined): string | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number') return new Date(value).toISOString()
  const numeric = Number(value)
  if (Number.isFinite(numeric) && /^\d+$/.test(String(value))) {
    return new Date(numeric).toISOString()
  }
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : String(value)
}

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function main() {
  const dbPath = resolve('prisma', 'dev.db')
  if (!existsSync(dbPath)) {
    throw new Error(`No se encontró la base SQLite heredada en ${dbPath}`)
  }

  const outDir = resolve('backups')
  mkdirSync(outDir, { recursive: true })

  const sqlite = new DatabaseSync(dbPath, { readOnly: true })
  try {
    const rawUsers = sqlite.prepare('SELECT id, code, email, name, role, status, passwordHash, faculty, career, ip, lastAccess FROM "User" ORDER BY id ASC').all() as unknown as RawUserRow[]
    const rawBooks = sqlite.prepare('SELECT id, isbn, title, author, year, genre, faculties, synopsis, format, pages, location, addedAt, demand, coverUrl FROM "Book" ORDER BY id ASC').all() as unknown as RawBookRow[]
    const rawCopies = sqlite.prepare('SELECT id, bookId, condition, status FROM "Copy" ORDER BY id ASC').all() as unknown as RawCopyRow[]
    const rawReservations = sqlite.prepare('SELECT id, code, bookId, copyId, userId, createdAt, pickupAt, expiresAt, method, locker, status, nonce, consumedAt FROM "Reservation" ORDER BY createdAt ASC, id ASC').all() as unknown as RawReservationRow[]
    const rawLoans = sqlite.prepare('SELECT id, bookId, copyId, userId, loanedAt, dueAt, returnedAt, renewals FROM "Loan" ORDER BY loanedAt ASC, id ASC').all() as unknown as RawLoanRow[]
    const rawFines = sqlite.prepare('SELECT id, userId, loanId, bookId, days, amount, createdAt, status FROM "Fine" ORDER BY createdAt ASC, id ASC').all() as unknown as RawFineRow[]
    const rawAudit = sqlite.prepare('SELECT id, seq, ts, actorName, actorRole, action, detail, ip FROM "AuditEntry" ORDER BY seq ASC').all() as unknown as RawAuditRow[]

    // Omit passwordHash and any plaintext password from backups.
    const usuarios = rawUsers.map(u => ({
      id: u.id,
      code: u.code,
      email: u.email,
      name: u.name,
      role: u.role,
      status: u.status,
      hasPassword: Boolean(u.passwordHash),
      faculty: u.faculty,
      career: u.career,
      ip: u.ip,
      lastAccess: toIso(u.lastAccess),
    }))

    const libros = rawBooks.map(b => ({
      id: b.id,
      isbn: b.isbn,
      title: b.title,
      author: b.author,
      year: b.year,
      genre: b.genre,
      faculties: parseJson<string[]>(b.faculties, []),
      synopsis: b.synopsis,
      format: b.format,
      pages: b.pages,
      location: parseJson<Record<string, unknown>>(b.location, {}),
      addedAt: toIso(b.addedAt),
      demand: b.demand,
      coverUrl: b.coverUrl,
    }))

    const ejemplares = rawCopies.map(c => ({
      id: c.id,
      bookId: c.bookId,
      condition: c.condition,
      status: c.status,
    }))

    const reservas = rawReservations.map(r => ({
      id: r.id,
      code: r.code,
      bookId: r.bookId,
      copyId: r.copyId,
      userId: r.userId,
      createdAt: toIso(r.createdAt),
      pickupAt: toIso(r.pickupAt),
      expiresAt: toIso(r.expiresAt),
      method: r.method,
      locker: r.locker,
      status: r.status,
      nonce: r.nonce,
      consumedAt: toIso(r.consumedAt),
    }))

    const prestamos = rawLoans.map(l => ({
      id: l.id,
      bookId: l.bookId,
      copyId: l.copyId,
      userId: l.userId,
      loanedAt: toIso(l.loanedAt),
      dueAt: toIso(l.dueAt),
      returnedAt: toIso(l.returnedAt),
      renewals: l.renewals,
    }))

    const multas = rawFines.map(f => ({
      id: f.id,
      userId: f.userId,
      loanId: f.loanId,
      bookId: f.bookId,
      days: f.days,
      amount: f.amount,
      createdAt: toIso(f.createdAt),
      status: f.status,
    }))

    const auditoria = rawAudit.map(a => ({
      id: a.id,
      seq: a.seq,
      ts: toIso(a.ts),
      actorName: a.actorName,
      actorRole: a.actorRole,
      action: a.action,
      detail: a.detail,
      ip: a.ip,
    }))

    const files: Record<string, unknown> = {
      'usuarios.json': usuarios,
      'libros.json': libros,
      'ejemplares.json': ejemplares,
      'reservas.json': reservas,
      'prestamos.json': prestamos,
      'multas.json': multas,
      'auditoria.json': auditoria,
      'legacy-export.json': {
        exportedAt: new Date().toISOString(),
        source: 'prisma/dev.db',
        counts: {
          usuarios: usuarios.length,
          libros: libros.length,
          ejemplares: ejemplares.length,
          reservas: reservas.length,
          prestamos: prestamos.length,
          multas: multas.length,
          auditoria: auditoria.length,
        },
        usuarios,
        libros,
        ejemplares,
        reservas,
        prestamos,
        multas,
        auditoria,
      },
    }

    for (const [name, payload] of Object.entries(files)) {
      writeFileSync(resolve(outDir, name), JSON.stringify(payload, null, 2) + '\n', 'utf8')
    }

    console.log('Exportación completada en backups/:', {
      usuarios: usuarios.length,
      libros: libros.length,
      ejemplares: ejemplares.length,
      reservas: reservas.length,
      prestamos: prestamos.length,
      multas: multas.length,
      auditoria: auditoria.length,
    })
  } finally {
    sqlite.close()
  }
}

main()

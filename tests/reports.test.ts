import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import type { WeeklyReport } from '../src/lib/reports'

declare global {
  interface ImportMeta {
    readonly env: Record<string, string | undefined>
  }
}

const secret = randomBytes(32).toString('hex')
const temporary = mkdtempSync(resolve('tests', '.integration-reports-'))
const databaseUrl = `file:${resolve(temporary, 'test.db').replaceAll('\\', '/')}`
const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
const port = 19000 + (randomBytes(2).readUInt16BE() % 10000)
const base = `http://localhost:${port}/api`
const password = randomBytes(20).toString('hex')
const env = {
  ...process.env,
  NODE_ENV: 'test',
  DATABASE_URL: databaseUrl,
  PORT: String(port),
  JWT_SECRET: randomBytes(32).toString('hex'),
  QR_HMAC_SECRET: secret,
  CORS_ORIGIN: 'http://localhost:5173',
  POLICY_LOAN_DAYS: '14',
  POLICY_RENEWAL_DAYS: '7',
  POLICY_MAX_RENEWALS: '2',
  POLICY_MAX_LOANS: '3',
  POLICY_HOLD_HOURS: '24',
  POLICY_FINE_PER_DAY: '1.5',
  POLICY_CURRENCY: 'S/',
  POLICY_WARN_DAYS: '3',
}

let server: ChildProcess
let studentCookie = ''
let staffCookie = ''
let adminCookie = ''
let serverOutput = ''

const adminId = randomUUID()
const studentId = randomUUID()
const staffId = randomUUID()

const bookTop1Id = randomUUID()
const bookTop2Id = randomUUID()
const bookPrevId = randomUUID()
const bookIdleOldId = randomUUID()
const bookIdleNeverId = randomUUID()
const bookRecentId = randomUUID()

const DAY = 86_400_000
const HOUR = 3_600_000

// Semana de prueba: Lunes 2026-03-02 a Domingo 2026-03-08
const testWeekStartStr = '2026-03-02'
const startMs = Date.UTC(2026, 2, 2, 5, 0, 0) // 2026-03-02 00:00:00 Lima
const endMs = startMs + 7 * DAY
const prevMs = startMs - 7 * DAY
const oldLoanDate = new Date(endMs - 120 * DAY)

async function request(path: string, cookie = '', body?: unknown, method = 'GET') {
  const response = await fetch(base + path, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const text = await response.text()
  let json: any = null
  try { json = JSON.parse(text) } catch {}
  return { status: response.status, body: json ?? text, cookie: response.headers.get('set-cookie')?.split(';')[0] ?? '' }
}

before(async () => {
  execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'db', 'push', '--skip-generate'], { env, stdio: 'pipe' })
  const hash = await bcrypt.hash(password, 12)

  // Crear usuarios de prueba con diferentes roles
  await prisma.user.createMany({
    data: [
      { id: adminId, code: 'TEST-ADMIN-REP', email: 'admin-rep@example.test', name: 'Admin de Reportes', role: 'admin', faculty: 'Ciencias Empresariales', passwordHash: hash },
      { id: studentId, code: 'TEST-STUDENT-REP', email: 'student-rep@example.test', name: 'Estudiante de Reportes', role: 'student', faculty: 'Ciencias', passwordHash: hash },
      { id: staffId, code: 'TEST-STAFF-REP', email: 'staff-rep@example.test', name: 'Bibliotecario de Reportes', role: 'librarian', faculty: 'Humanidades', passwordHash: hash },
    ],
  })

  // Crear catálogo de libros con fechas y configuraciones conocidas
  await prisma.book.createMany({
    data: [
      { id: bookTop1Id, isbn: randomUUID(), title: 'Algoritmos Avanzados', author: 'Autor A', year: 2024, genre: 'Tecnología', faculties: ['Ciencias'], synopsis: '', format: 'fisico', pages: 300, location: { pavilion: 'A', shelf: 1, row: 1, col: 1 }, addedAt: new Date(Date.UTC(2025, 0, 1)) },
      { id: bookTop2Id, isbn: randomUUID(), title: 'Bases de Datos Distribuidas', author: 'Autor B', year: 2024, genre: 'Tecnología', faculties: ['Ciencias'], synopsis: '', format: 'fisico', pages: 400, location: { pavilion: 'A', shelf: 1, row: 1, col: 2 }, addedAt: new Date(Date.UTC(2025, 0, 1)) },
      { id: bookPrevId, isbn: randomUUID(), title: 'Redes de Computadoras', author: 'Autor C', year: 2024, genre: 'Tecnología', faculties: ['Ciencias'], synopsis: '', format: 'fisico', pages: 250, location: { pavilion: 'A', shelf: 1, row: 1, col: 3 }, addedAt: new Date(Date.UTC(2025, 0, 1)) },
      { id: bookIdleOldId, isbn: randomUUID(), title: 'Historia Antigua', author: 'Autor D', year: 2020, genre: 'Humanidades', faculties: ['Humanidades'], synopsis: '', format: 'fisico', pages: 180, location: { pavilion: 'B', shelf: 1, row: 1, col: 1 }, addedAt: new Date(Date.UTC(2025, 0, 1)) },
      { id: bookIdleNeverId, isbn: randomUUID(), title: 'Filosofía Clásica', author: 'Autor E', year: 2019, genre: 'Humanidades', faculties: ['Humanidades'], synopsis: '', format: 'fisico', pages: 220, location: { pavilion: 'B', shelf: 1, row: 1, col: 2 }, addedAt: new Date(endMs - 150 * DAY) },
      { id: bookRecentId, isbn: randomUUID(), title: 'Manual Reciente', author: 'Autor F', year: 2026, genre: 'General', faculties: ['Ciencias'], synopsis: '', format: 'fisico', pages: 50, location: { pavilion: 'C', shelf: 1, row: 1, col: 1 }, addedAt: new Date(endMs - 10 * DAY) },
    ],
  })

  // Crear copias físicas
  await prisma.copy.createMany({
    data: [
      { id: randomUUID(), bookId: bookTop1Id, status: 'available' },
      { id: randomUUID(), bookId: bookTop2Id, status: 'available' },
      { id: randomUUID(), bookId: bookPrevId, status: 'available' },
      { id: randomUUID(), bookId: bookIdleOldId, status: 'available' },
      { id: randomUUID(), bookId: bookIdleNeverId, status: 'available' },
      { id: randomUUID(), bookId: bookRecentId, status: 'available' },
    ],
  })

  // Cargar préstamos con fechas conocidas:
  // Semana seleccionada [startMs, endMs): 5 préstamos
  // - TopBook 1: 3 préstamos (Lunes, Martes, Miércoles)
  // - TopBook 2: 2 préstamos (Jueves, Viernes)
  // Semana anterior [prevMs, startMs): 2 préstamos
  // - PrevBook: 2 préstamos
  // Préstamo antiguo (>90 días antes):
  // - IdleOldBook: 1 préstamo hace 120 días
  await prisma.loan.createMany({
    data: [
      // Semana actual (5 préstamos en días conocidos)
      { id: randomUUID(), bookId: bookTop1Id, userId: studentId, loanedAt: new Date(startMs + 10 * HOUR), dueAt: new Date(startMs + 14 * DAY) }, // Lunes
      { id: randomUUID(), bookId: bookTop1Id, userId: studentId, loanedAt: new Date(startMs + 1 * DAY + 11 * HOUR), dueAt: new Date(startMs + 15 * DAY) }, // Martes
      { id: randomUUID(), bookId: bookTop1Id, userId: studentId, loanedAt: new Date(startMs + 2 * DAY + 12 * HOUR), dueAt: new Date(startMs + 16 * DAY) }, // Miércoles
      { id: randomUUID(), bookId: bookTop2Id, userId: studentId, loanedAt: new Date(startMs + 3 * DAY + 14 * HOUR), dueAt: new Date(startMs + 17 * DAY) }, // Jueves
      { id: randomUUID(), bookId: bookTop2Id, userId: studentId, loanedAt: new Date(startMs + 4 * DAY + 15 * HOUR), dueAt: new Date(startMs + 18 * DAY) }, // Viernes

      // Semana anterior (2 préstamos)
      { id: randomUUID(), bookId: bookPrevId, userId: studentId, loanedAt: new Date(prevMs + 1 * DAY + 10 * HOUR), dueAt: new Date(prevMs + 15 * DAY) },
      { id: randomUUID(), bookId: bookPrevId, userId: studentId, loanedAt: new Date(prevMs + 3 * DAY + 14 * HOUR), dueAt: new Date(prevMs + 17 * DAY) },

      // Préstamo antiguo de Historia Antigua (hace 120 días respecto a fin de semana de prueba)
      { id: randomUUID(), bookId: bookIdleOldId, userId: studentId, loanedAt: oldLoanDate, dueAt: new Date(oldLoanDate.getTime() + 14 * DAY), returnedAt: new Date(oldLoanDate.getTime() + 10 * DAY) },
    ],
  })

  // Iniciar servidor API real
  server = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], { env, stdio: ['ignore', 'pipe', 'pipe'] })
  server.stdout?.on('data', chunk => { serverOutput += chunk.toString() })
  server.stderr?.on('data', chunk => { serverOutput += chunk.toString() })

  let ready = false
  for (let i = 0; i < 100; i++) {
    try { await fetch(base + '/me'); ready = true; break } catch { await new Promise(r => setTimeout(r, 100)) }
  }
  assert.ok(ready, serverOutput)

  // Obtener cookies de sesión mediante login
  const student = await request('/auth/login', '', { identifier: 'TEST-STUDENT-REP', password }, 'POST')
  const staff = await request('/auth/login', '', { identifier: 'TEST-STAFF-REP', password }, 'POST')
  const admin = await request('/auth/login', '', { identifier: 'TEST-ADMIN-REP', password }, 'POST')
  assert.equal(student.status, 200)
  assert.equal(staff.status, 200)
  assert.equal(admin.status, 200)
  studentCookie = student.cookie
  staffCookie = staff.cookie
  adminCookie = admin.cookie
})

after(async () => {
  if (server && server.exitCode === null) {
    server.kill()
    await new Promise<void>(res => { server.once('exit', () => res()); setTimeout(res, 3000).unref() })
  }
  await prisma.$disconnect()
  assert.ok(temporary.startsWith(resolve('tests') + (process.platform === 'win32' ? '\\' : '/')))
  rmSync(temporary, { recursive: true, force: true })
})

test('GET /api/admin/reports/weekly rechaza sin sesión con 401', async () => {
  const res = await request(`/admin/reports/weekly?start=${testWeekStartStr}`)
  assert.equal(res.status, 401)
})

test('GET /api/admin/reports/weekly rechaza a estudiante con 403', async () => {
  const res = await request(`/admin/reports/weekly?start=${testWeekStartStr}`, studentCookie)
  assert.equal(res.status, 403)
})

test('GET /api/admin/reports/weekly rechaza a bibliotecario con 403', async () => {
  const res = await request(`/admin/reports/weekly?start=${testWeekStartStr}`, staffCookie)
  assert.equal(res.status, 403)
})

test('GET /api/admin/reports/weekly devuelve kpis.loans, prev, daily, topBooks e idleBooks correctos para administrador', async () => {
  const res = await request(`/admin/reports/weekly?start=${testWeekStartStr}`, adminCookie)
  assert.equal(res.status, 200)

  const report = res.body as WeeklyReport
  assert.equal(report.range.start, '2026-03-02')
  assert.equal(report.range.end, '2026-03-08')

  // 1. kpis.loans y prev de la semana anterior
  assert.equal(report.kpis.loans, 5, 'kpis.loans debe ser 5 (3 de Top1 + 2 de Top2)')
  assert.equal(report.prev.loans, 2, 'prev.loans debe ser 2 (de la semana anterior)')

  // 2. daily (desglose diario de lunes a domingo)
  assert.equal(report.daily.length, 7)
  assert.equal(report.daily[0].date, '2026-03-02')
  assert.equal(report.daily[0].loans, 1, 'Lunes debe tener 1 préstamo')
  assert.equal(report.daily[1].date, '2026-03-03')
  assert.equal(report.daily[1].loans, 1, 'Martes debe tener 1 préstamo')
  assert.equal(report.daily[2].date, '2026-03-04')
  assert.equal(report.daily[2].loans, 1, 'Miércoles debe tener 1 préstamo')
  assert.equal(report.daily[3].date, '2026-03-05')
  assert.equal(report.daily[3].loans, 1, 'Jueves debe tener 1 préstamo')
  assert.equal(report.daily[4].date, '2026-03-06')
  assert.equal(report.daily[4].loans, 1, 'Viernes debe tener 1 préstamo')
  assert.equal(report.daily[5].date, '2026-03-07')
  assert.equal(report.daily[5].loans, 0, 'Sábado debe tener 0 préstamos')
  assert.equal(report.daily[6].date, '2026-03-08')
  assert.equal(report.daily[6].loans, 0, 'Domingo debe tener 0 préstamos')

  // 3. topBooks (ordenados por cantidad de préstamos descendente)
  assert.equal(report.topBooks.length, 2)
  assert.equal(report.topBooks[0].bookId, bookTop1Id)
  assert.equal(report.topBooks[0].title, 'Algoritmos Avanzados')
  assert.equal(report.topBooks[0].loans, 3)

  assert.equal(report.topBooks[1].bookId, bookTop2Id)
  assert.equal(report.topBooks[1].title, 'Bases de Datos Distribuidas')
  assert.equal(report.topBooks[1].loans, 2)

  // 4. idleBooks (libros sin préstamos en los últimos 90 días respecto a asOf)
  // - bookIdleOldId: préstamo hace 120 días (> 90 días) -> incluido con lastLoanAt
  // - bookIdleNeverId: sin préstamos, añadido hace 150 días (> 90 días) -> incluido con lastLoanAt null
  // - bookRecentId: añadido hace 10 días (< 90 días) -> NO debe estar incluido
  // - bookTop1Id, bookTop2Id, bookPrevId: tuvieron préstamos recientes -> NO deben estar incluidos
  const idleOld = report.idleBooks.find(b => b.bookId === bookIdleOldId)
  assert.ok(idleOld, 'Historia Antigua debe aparecer en idleBooks')
  assert.equal(idleOld?.title, 'Historia Antigua')
  assert.equal(idleOld?.lastLoanAt, oldLoanDate.toISOString())

  const idleNever = report.idleBooks.find(b => b.bookId === bookIdleNeverId)
  assert.ok(idleNever, 'Filosofía Clásica debe aparecer en idleBooks')
  assert.equal(idleNever?.title, 'Filosofía Clásica')
  assert.equal(idleNever?.lastLoanAt, null)

  assert.equal(report.idleBooks.some(b => b.bookId === bookRecentId), false, 'Manual Reciente no debe ser idle')
  assert.equal(report.idleBooks.some(b => b.bookId === bookTop1Id), false, 'Top1 no debe ser idle')
  assert.equal(report.idleBooks.some(b => b.bookId === bookTop2Id), false, 'Top2 no debe ser idle')
  assert.equal(report.idleBooks.some(b => b.bookId === bookPrevId), false, 'Prev no debe ser idle')
})

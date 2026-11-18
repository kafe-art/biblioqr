import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { signQr, verifyQr } from '../server/qr'

const secret = randomBytes(32).toString('hex')
const temporary = mkdtempSync(resolve('tests', '.integration-'))
const databaseUrl = `file:${resolve(temporary, 'test.db').replaceAll('\\', '/')}`
const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
const port = 18000 + randomBytes(2).readUInt16BE() % 10000
const base = `http://localhost:${port}/api`
const password = randomBytes(20).toString('hex')
const env = {
  ...process.env, NODE_ENV: 'test', DATABASE_URL: databaseUrl, PORT: String(port),
  JWT_SECRET: randomBytes(32).toString('hex'), QR_HMAC_SECRET: secret,
  CORS_ORIGIN: 'http://localhost:5173', POLICY_LOAN_DAYS: '14', POLICY_RENEWAL_DAYS: '7',
  POLICY_MAX_RENEWALS: '2', POLICY_MAX_LOANS: '3', POLICY_HOLD_HOURS: '24',
  POLICY_FINE_PER_DAY: '1.5', POLICY_CURRENCY: 'S/', POLICY_WARN_DAYS: '3',
}
let server: ChildProcess
let studentCookie = ''
let staffCookie = ''
let serverOutput = ''
const userId = randomUUID()
const staffId = randomUUID()
const bookId = randomUUID()
const copyId = randomUUID()

async function request(path: string, cookie = '', body?: unknown, method = 'POST') {
  const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: body === undefined ? undefined : JSON.stringify(body) })
  return { status: response.status, body: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] ?? '' }
}
before(async () => {
  execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'db', 'push', '--skip-generate'], { env, stdio: 'pipe' })
  const hash = await bcrypt.hash(password, 12)
  await prisma.user.createMany({ data: [
    { id: userId, code: 'TEST-STUDENT', email: 'student@example.test', name: 'Lector de prueba', role: 'student', faculty: 'Ciencias', passwordHash: hash },
    { id: staffId, code: 'TEST-STAFF', email: 'staff@example.test', name: 'Mostrador de prueba', role: 'librarian', faculty: 'Ciencias', passwordHash: hash },
  ] })
  await prisma.book.create({ data: { id: bookId, isbn: randomUUID(), title: 'Catálogo de integración', author: 'Prueba', year: 2026, genre: 'Prueba', faculties: ['Ciencias'], synopsis: '', format: 'fisico', pages: 20, location: { pavilion: 'A', shelf: 1, row: 1, col: 1 }, copies: { create: { id: copyId } } } })
  server = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], { env, stdio: ['ignore', 'pipe', 'pipe'] })
  server.stdout?.on('data', chunk => { serverOutput += chunk.toString() })
  server.stderr?.on('data', chunk => { serverOutput += chunk.toString() })
  let ready = false
  for (let i = 0; i < 100; i++) {
    try { await fetch(base + '/me'); ready = true; break } catch { await new Promise(resolve => setTimeout(resolve, 100)) }
  }
  assert.ok(ready, serverOutput)
  const student = await request('/auth/login', '', { identifier: 'TEST-STUDENT', password })
  const staff = await request('/auth/login', '', { identifier: 'TEST-STAFF', password })
  assert.equal(student.status, 200); assert.equal(staff.status, 200)
  studentCookie = student.cookie; staffCookie = staff.cookie
})
after(async () => {
  if (server && server.exitCode === null) {
    server.kill()
    await new Promise<void>(resolve => { server.once('exit', () => resolve()); setTimeout(resolve, 3000).unref() })
  }
  await prisma.$disconnect()
  assert.ok(temporary.startsWith(resolve('tests') + (process.platform === 'win32' ? '\\' : '/')))
  rmSync(temporary, { recursive: true, force: true })
})

test('QR firma el vencimiento y rechaza cambios en payload o firma', () => {
  const payload = { rid: randomUUID(), cid: randomUUID(), uid: randomUUID(), exp: Date.now() + 60000, nonce: randomBytes(32).toString('hex') }
  const token = signQr(payload, secret)
  assert.deepEqual(verifyQr(token, secret), payload)
  const changed = `${token[0] === 'A' ? 'B' : 'A'}${token.slice(1)}`
  assert.throws(() => verifyQr(changed, secret))
  assert.throws(() => verifyQr(token, randomBytes(32).toString('hex')))
})
test('reserva, falsificación y dos escaneos simultáneos: exactamente una entrega', async () => {
  const reservation = await request('/reservations', studentCookie, { bookId, pickupAt: Date.now() - 1000, method: 'desk' })
  assert.equal(reservation.status, 201)
  const token = reservation.body.qrToken as string
  const [payload, signature] = token.split('.')
  const forged = `${payload}.${signature[0] === 'A' ? 'B' : 'A'}${signature.slice(1)}`
  assert.equal((await request('/circulation/scan', staffCookie, { qrToken: forged })).status, 401)
  const mismatch = signQr({ ...verifyQr(token, secret), cid: randomUUID() }, secret)
  assert.equal((await request('/circulation/scan', staffCookie, { qrToken: mismatch })).status, 401)
  const attempts = await Promise.all([request('/circulation/scan', staffCookie, { qrToken: token }), request('/circulation/scan', staffCookie, { qrToken: token })])
  assert.deepEqual(attempts.map(r => r.status).sort(), [200, 409])
  assert.equal((await request('/circulation/scan', staffCookie, { qrToken: token })).status, 409)
  assert.equal(await prisma.loan.count({ where: { copyId, returnedAt: null } }), 1)
  assert.equal((await request('/circulation/checkin', studentCookie, { copyId })).status, 403)
  await prisma.loan.updateMany({ where: { copyId, returnedAt: null }, data: { dueAt: new Date(Date.now() - 2 * 86400000) } })
  const returned = await request('/circulation/checkin', staffCookie, { copyId })
  assert.equal(returned.status, 200)
  assert.ok(returned.body.fine.amount > 0)
  assert.equal((await request('/circulation/checkin', staffCookie, { copyId })).status, 409)
  assert.equal((await request('/reservations', studentCookie, { bookId, pickupAt: Date.now(), method: 'desk' })).status, 409)
})
test('auditoría persistente rechaza actualización y borrado', async () => {
  const entry = await prisma.auditEntry.findFirstOrThrow()
  await assert.rejects(prisma.auditEntry.update({ where: { seq: entry.seq }, data: { detail: 'alteración' } }))
  await assert.rejects(prisma.auditEntry.delete({ where: { seq: entry.seq } }))
})
test('reserva vencida devuelve 410, libera ejemplar y no permite cancelación ajena', async () => {
  const id = randomUUID(); const anotherUser = randomUUID(); const anotherCopy = randomUUID()
  await prisma.user.create({ data: { id: anotherUser, code: randomUUID(), email: `${anotherUser}@example.test`, name: 'Otro lector', role: 'student', faculty: 'Ciencias', passwordHash: await bcrypt.hash(password, 12) } })
  await prisma.copy.create({ data: { id: anotherCopy, bookId, status: 'reserved' } })
  const r = await prisma.reservation.create({ data: { id, code: randomUUID(), bookId, copyId: anotherCopy, userId: anotherUser, pickupAt: new Date(Date.now() - 10000), expiresAt: new Date(Date.now() - 1000), method: 'desk', nonce: randomBytes(32).toString('hex') } })
  const token = signQr({ rid: id, cid: anotherCopy, uid: anotherUser, exp: r.expiresAt.getTime(), nonce: r.nonce }, secret)
  assert.equal((await request(`/reservations/${id}`, studentCookie, {}, 'DELETE')).status, 403)
  assert.equal((await request('/circulation/scan', staffCookie, { qrToken: token })).status, 410)
  assert.equal((await prisma.copy.findUniqueOrThrow({ where: { id: anotherCopy } })).status, 'available')
})
test('login no revela cuentas, y el estado del estudiante oculta datos ajenos', async () => {
  const absent = await request('/auth/login', '', { identifier: randomUUID(), password })
  const wrong = await request('/auth/login', '', { identifier: 'TEST-STUDENT', password: randomUUID() })
  assert.equal(absent.status, 401); assert.equal(wrong.status, 401)
  assert.equal(absent.body.error, wrong.body.error)
  const state = await request('/state', studentCookie, undefined, 'GET')
  assert.equal(state.status, 200)
  assert.ok(state.body.users.every((user: { id: string; passwordHash?: string }) => user.id === userId && user.passwordHash === undefined))
  assert.equal((await request('/admin/audit', studentCookie, undefined, 'GET')).status, 403)
})

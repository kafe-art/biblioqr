import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac, randomBytes, randomInt, randomUUID } from 'node:crypto'
import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { testDatabase } from './database'
import bcrypt from 'bcryptjs'
import { signQr, verifyQr } from '../server/qr'

const secret = randomBytes(32).toString('hex')
const { databaseUrl, prisma, clean } = testDatabase()
const port = 18000 + randomBytes(2).readUInt16BE() % 10000
const base = `http://localhost:${port}/api`
const password = randomBytes(20).toString('hex')
const env = {
  ...process.env, ADMIN_EMAIL: '', NODE_ENV: 'test', DATABASE_URL: databaseUrl, PORT: String(port),
  JWT_SECRET: randomBytes(32).toString('hex'), QR_HMAC_SECRET: secret,
  CORS_ORIGIN: 'http://localhost:5173', POLICY_LOAN_DAYS: '14', POLICY_RENEWAL_DAYS: '7',
  POLICY_MAX_RENEWALS: '2', POLICY_MAX_LOANS: '3', POLICY_HOLD_HOURS: '24',
  POLICY_FINE_PER_DAY: '1.5', POLICY_CURRENCY: 'S/', POLICY_WARN_DAYS: '3',
}
let server: ChildProcess
let studentCookie = ''
let staffCookie = ''
let serverOutput = ''
const userId = '101'
const staffId = '102'
const bookId = '201'
const copyId = randomUUID().slice(0,30)

async function request(path: string, cookie = '', body?: unknown, method = 'POST') {
  const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: body === undefined ? undefined : JSON.stringify(body) })
  return { status: response.status, body: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] ?? '' }
}
before(async () => {
  execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], { env, stdio: 'pipe' })
  const hash = await bcrypt.hash(password, 12)
  await prisma.usuario.createMany({ data: [
    { id: BigInt(userId), codigoUsuario: 'TEST-STUDENT', email: 'student@example.test', nombres: 'Lector de prueba', rol: 'student', facultad: 'Ciencias', passwordHash: hash },
    { id: BigInt(staffId), codigoUsuario: 'TEST-STAFF', email: 'staff@example.test', nombres: 'Mostrador de prueba', rol: 'librarian', facultad: 'Ciencias', passwordHash: hash },
  ] })
  const category = await prisma.categoria.create({ data: { nombre: 'Prueba' } })
  for (const id of ['201','202','203']) {
    await prisma.libro.create({ data: { id: BigInt(id), categoriaId: category.id, isbn: id, titulo: 'Catálogo '+id, autor: 'Prueba', anioPublicacion: 2026,
      facultades: ['Ciencias'], descripcion: '', formato: 'fisico', paginas: 20, ubicacion: { pavilion: 'A', shelf: 1, row: 1, col: 1 },
      ejemplares: { create: { codigoInventario: id === bookId ? copyId : 'TEST-'+id } } } })
  }
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
  await clean()
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
  assert.equal((await request('/reservations', studentCookie, { bookIds: ['201','202','203','204'], pickupAt: Date.now(), method: 'desk' })).status, 400)
  assert.equal((await request('/reservations',studentCookie,{ bookIds: ['201','99999'], pickupAt: Date.now(), method: 'desk' })).status,404)
  assert.equal((await prisma.ejemplar.findUniqueOrThrow({ where: { codigoInventario: copyId } })).estado,'available')
  const reservation = await request('/reservations', studentCookie, { bookIds: ['201','202','203'], pickupAt: Date.now() - 1000, method: 'desk' })
  assert.equal(reservation.status, 201)
  assert.equal(reservation.body.reservation.details.length, 3)
  await assert.rejects(prisma.reservaDetalle.update({ where: { id: BigInt(reservation.body.reservation.details[0].id) }, data: { posicion: 4 } }))
  const token = reservation.body.qrToken as string
  const [payload, signature] = token.split('.')
  const forged = `${payload}.${signature[0] === 'A' ? 'B' : 'A'}${signature.slice(1)}`
  assert.equal((await request('/circulation/scan', staffCookie, { qrToken: forged })).status, 401)
  const mismatch = signQr({ ...verifyQr(token, secret), cid: randomUUID() }, secret)
  assert.equal((await request('/circulation/scan', staffCookie, { qrToken: mismatch })).status, 401)
  const attempts = await Promise.all([request('/circulation/scan', staffCookie, { qrToken: token }), request('/circulation/scan', staffCookie, { qrToken: token })])
  assert.deepEqual(attempts.map(r => r.status).sort(), [200, 409])
  assert.equal((await request('/circulation/scan', staffCookie, { qrToken: token })).status, 409)
  assert.equal(await prisma.reservaDetalle.count({ where: { ejemplar: { codigoInventario: copyId }, estado: 'collected' } }), 1)
  assert.equal((await request('/circulation/checkin', studentCookie, { copyId })).status, 403)
  await prisma.reservaDetalle.updateMany({ where: { ejemplar: { codigoInventario: copyId }, estado: 'collected' }, data: { fechaLimiteDevol: new Date(Date.now() - 2 * 86400000) } })
  const returned = await request('/circulation/checkin', staffCookie, { copyId })
  assert.equal(returned.status, 200)
  assert.ok(returned.body.fine.amount > 0)
  assert.equal(await prisma.incidencia.count({ where: { tipo: 'mora', sanciones: { some: {} } } }), 1)
  assert.equal(await prisma.reservaDetalle.count({ where: { estado: 'collected' } }), 2)
  assert.equal((await request('/circulation/checkin', staffCookie, { copyId })).status, 409)
  assert.equal((await request('/reservations', studentCookie, { bookId, pickupAt: Date.now(), method: 'desk' })).status, 409)
})
test('auditoría persistente rechaza actualización y borrado', async () => {
  const entry = await prisma.auditoria.findFirstOrThrow()
  await assert.rejects(prisma.auditoria.update({ where: { seq: entry.seq }, data: { descripcion: 'alteración' } }))
  await assert.rejects(prisma.auditoria.delete({ where: { seq: entry.seq } }))
})
test('reserva vencida devuelve 410, libera ejemplar y no permite cancelación ajena', async () => {
  const id = '301'; const anotherUser = '401'; const anotherCopy = randomUUID().slice(0,30)
  await prisma.usuario.create({ data: { id: BigInt(anotherUser), codigoUsuario: 'OTRO', email: `${anotherUser}@example.test`, nombres: 'Otro lector', rol: 'student', facultad: 'Ciencias', passwordHash: await bcrypt.hash(password, 12) } })
  const c = await prisma.ejemplar.create({ data: { codigoInventario: anotherCopy, libroId: BigInt(bookId), estado: 'reserved' } })
  const r = await prisma.reserva.create({ data: { id: BigInt(id), usuarioId: BigInt(anotherUser), retiroProgramado: new Date(Date.now()-10000), fechaExpiracion: new Date(Date.now()-1000), metodoRetiro: 'desk',
    detalles: { create: { libroId: BigInt(bookId), ejemplarId: c.id, posicion: 1 } } } })
  const token = signQr({ rid: id, cid: String(c.id), uid: anotherUser, exp: r.fechaExpiracion.getTime(), nonce: r.nonce },secret)
  assert.equal((await request(`/reservations/${id}`, studentCookie, {}, 'DELETE')).status, 403)
  assert.equal((await request('/circulation/scan', staffCookie, { qrToken: token })).status, 410)
  assert.equal((await prisma.ejemplar.findUniqueOrThrow({ where: { codigoInventario: anotherCopy } })).estado, 'available')
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

test('el OTP institucional abre sesión y se consume una sola vez', async () => {
  const email = 'lector@alumnos.unp.edu.pe'
  const otp = randomInt(100000,1000000).toString()
  const codeHash = createHmac('sha256', env.JWT_SECRET).update('login:'+email+':'+otp).digest('hex')
  await prisma.emailCode.create({ data: { email, purpose: 'login', codeHash, expiresAt: new Date(Date.now()+60000) } })
  const session = await request('/auth/verify-otp','',{ email, otp })
  assert.equal(session.status,200)
  assert.equal(session.body.user.role,'student')
  assert.equal(session.body.user.passwordHash,undefined)
  assert.equal((await request('/me',session.cookie,undefined,'GET')).status,200)
  assert.equal((await request('/auth/verify-otp','',{ email, otp })).status,400)
})

test('mostrador, incidencia, sanción resuelta y aviso de lectura', async () => {
  const fine = await prisma.sancion.findFirstOrThrow({ where: { usuarioId: BigInt(userId) } })
  assert.equal((await request('/fines/'+fine.id+'/pay',staffCookie,{})).status,200)
  assert.equal((await prisma.incidencia.findUniqueOrThrow({ where: { id: fine.incidenciaId } })).estado,'resuelta')
  const checkout = await request('/circulation/checkout',staffCookie,{ userCode: 'TEST-STUDENT', copyId })
  assert.equal(checkout.status,200)
  const d = await prisma.reservaDetalle.findUniqueOrThrow({ where: { id: BigInt(checkout.body.loan.id) }, include: { reserva: true } })
  assert.equal(d.reserva.bibliotecarioId,BigInt(staffId))
  assert.equal(d.reserva.consumidoEn?.getTime(),d.reserva.fechaRetiro?.getTime())
  const incident = await request('/incidencias',staffCookie,{ loanId: String(d.id), tipo: 'dano', descripcion: 'Cubierta dañada.' })
  assert.equal(incident.status,201)
  const notice = await prisma.notificacion.findFirstOrThrow({ where: { reservaDetalleId: d.id, tipo: 'incidencia' } })
  assert.equal((await request('/avisos/'+notice.id+'/leer',staffCookie,{})).status,404)
  assert.equal((await request('/avisos/'+notice.id+'/leer',studentCookie,{})).status,200)
  const event = await prisma.auditoria.findFirstOrThrow({ where: { entidad: 'sanciones', entidadId: fine.id, accion: 'fine' } })
  assert.deepEqual(event.datosAnteriores,{ estado: 'pending' })
  assert.deepEqual(event.datosNuevos,{ estado: 'paid' })
})

test('el préstamo digital usa un detalle sin ejemplar y admite renovación y devolución', async () => {
  const b = await prisma.libro.update({ where: { id: BigInt(bookId) }, data: { formato: 'ambos' } })
  const session = await request('/auth/login','',{ identifier: '401', password })
  assert.equal(session.status,401)
  const other = await request('/auth/login','',{ identifier: 'OTRO', password })
  assert.equal(other.status,200)
  const loan = await request('/loans/digital',other.cookie,{ bookId: String(b.id) })
  assert.equal(loan.status,201)
  assert.equal(loan.body.loan.copyId,null)
  const renewed = await request('/loans/'+loan.body.loan.id+'/renew',other.cookie,{})
  assert.equal(renewed.status,200)
  assert.equal(renewed.body.loan.renewals,1)
  assert.equal((await request('/loans/'+loan.body.loan.id+'/return-digital',other.cookie,{})).status,200)
  assert.equal((await request('/loans/'+loan.body.loan.id+'/return-digital',other.cookie,{})).status,409)
})

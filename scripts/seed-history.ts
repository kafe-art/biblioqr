import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { randomBytes, randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { SEED } from '../src/data/seed'
import { POLICY } from '../src/lib/rules'

const DAY = 86_400_000
const HOUR = 3_600_000
const OFFSET = 5 * HOUR // America/Lima UTC-5

const databaseUrl = process.env.DATABASE_URL || `file:${resolve('prisma', 'dev.db').replaceAll('\\', '/')}`
process.env.DATABASE_URL = databaseUrl

function ensureDatabaseSchema() {
  try {
    execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'db', 'push', '--skip-generate'], {
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: 'ignore',
    })
  } catch (err) {
    console.warn('Advertencia al sincronizar esquema con prisma db push:', err)
  }
}

async function main() {
  const demoPassword = process.env.SEED_DEMO_PASSWORD
  if (!demoPassword || demoPassword.length < 12) {
    throw new Error('SEED_DEMO_PASSWORD es obligatoria y debe tener al menos 12 caracteres.')
  }

  const codesByEmail = new Map<string, string>()
  for (const user of SEED.users) {
    const previousCode = codesByEmail.get(user.email)
    if (previousCode) {
      throw new Error(`Correo duplicado en src/data/seed.ts: ${user.email} (${previousCode} y ${user.code}). Corrige los datos de origen; los correos deben ser únicos y se usan sin modificar.`)
    }
    codesByEmail.set(user.email, user.code)
  }

  ensureDatabaseSchema()
  const client = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
  try {
    await client.$transaction(async (prisma) => {
      const historyMarkerId = 'seed-history:8-weeks:v1'
      const printUsersByRole = (users: { role: string; code: string; email: string }[]) => {
        console.log('--- Usuarios por rol (código | correo) ---')
        for (const role of ['admin', 'librarian', 'student'] as const) {
          const roleUsers = users.filter(u => u.role === role).sort((a, b) => a.code.localeCompare(b.code))
          console.log(`${role}: ${roleUsers.length}`)
          for (const user of roleUsers) console.log(`  ${user.code} | ${user.email}`)
        }
      }

      console.log('--- Iniciando generación de historial de 8 semanas ---')

      // 1. Asegurar usuarios existentes
      console.log('Sembrando usuarios iniciales...')
      const defaultHash = await bcrypt.hash(demoPassword, 10)
      for (const u of SEED.users) {
        const email = u.email
        await prisma.user.upsert({
          where: { code: u.code },
          update: { email, passwordHash: defaultHash },
          create: {
            id: u.id,
            code: u.code,
            name: u.name,
            email,
            role: u.role,
            faculty: u.faculty,
            career: u.career,
            status: u.status,
            ip: u.ip,
            lastAccess: new Date(u.lastAccess),
            passwordHash: defaultHash,
          },
        })
      }
      const users = await prisma.user.findMany()

      // 2. Asegurar libros existentes
      console.log('Sembrando libros iniciales...')
      for (const b of SEED.books) {
        await prisma.book.upsert({
          where: { isbn: b.isbn },
          update: {},
          create: {
            id: b.id,
            isbn: b.isbn,
            title: b.title,
            author: b.author,
            year: b.year,
            genre: b.genre,
            faculties: b.faculties,
            synopsis: b.synopsis,
            format: b.format,
            pages: b.pages,
            location: b.location as any,
            addedAt: new Date(b.addedAt),
            demand: b.demand,
            copies: {
              create: b.copies.map(c => ({ id: c.id, condition: c.condition, status: c.status })),
            },
          },
        })
      }
      const books = await prisma.book.findMany({ include: { copies: true }, orderBy: { id: 'asc' } })

      if (await prisma.auditEntry.findUnique({ where: { id: historyMarkerId } })) {
        console.log('El historial de 8 semanas ya existe; no se generan datos adicionales.')
        printUsersByRole(users)
        console.log('db:seed-history completado con éxito.')
        return
      }

      if (books.length < 6) {
        throw new Error(`Se requieren al menos 6 libros para dejar 5 títulos sin préstamos. Actual: ${books.length}`)
      }

      const studentUsers = users.filter(u => u.role === 'student' && u.status === 'active')
      if (studentUsers.length === 0) {
        throw new Error('No se encontraron estudiantes activos para asociar préstamos.')
      }

      // 3. Reservar al menos 5 títulos que quedarán estrictamente sin préstamos
      const idleCount = Math.max(5, Math.floor(books.length * 0.2))
      const zeroLoanBooks = books.slice(-idleCount)
      const zeroLoanIds = new Set(zeroLoanBooks.map(b => b.id))
      const loanableBooks = books.filter(b => !zeroLoanIds.has(b.id))

      console.log(`Total libros: ${books.length} | Títulos con préstamos: ${loanableBooks.length} | Títulos sin préstamos: ${zeroLoanBooks.length}`)

      // Limpiar cualquier préstamo previo asociado a los libros sin préstamos para garantizar la regla
      await prisma.fine.deleteMany({ where: { bookId: { in: Array.from(zeroLoanIds) } } })
      await prisma.loan.deleteMany({ where: { bookId: { in: Array.from(zeroLoanIds) } } })
      await prisma.reservation.deleteMany({ where: { bookId: { in: Array.from(zeroLoanIds) } } })

      // Ajustar addedAt de los títulos sin préstamos para que califiquen como idleBooks (> 90 días)
      const now = Date.now()
      const ninetyDaysAgo = now - 95 * DAY
      for (const b of zeroLoanBooks) {
        if (b.addedAt.getTime() > ninetyDaysAgo) {
          await prisma.book.update({
            where: { id: b.id },
            data: { addedAt: new Date(now - 120 * DAY) },
          })
        }
      }

      // 4. Generar 8 semanas (56 días) de préstamos, devoluciones, retrasos, multas y reservas
      const TOTAL_DAYS = 56
      let totalLoansCreated = 0
      let totalFinesCreated = 0
      let totalReservationsCreated = 0

      for (let d = TOTAL_DAYS - 1; d >= 0; d--) {
        const dayTimestamp = now - d * DAY
        const localDate = new Date(dayTimestamp - OFFSET)
        const dayOfWeek = (localDate.getUTCDay() + 6) % 7 // 0 = Lunes, 6 = Domingo

        // Frecuencia diaria realista: mayor entre semana, menor fines de semana
        const loansToday = dayOfWeek === 6 ? Math.floor(Math.random() * 2) : dayOfWeek === 5 ? Math.floor(1 + Math.random() * 3) : Math.floor(3 + Math.random() * 5)

        for (let l = 0; l < loansToday; l++) {
          const student = studentUsers[Math.floor(Math.random() * studentUsers.length)]
          const book = loanableBooks[Math.floor(Math.random() * loanableBooks.length)]
          const copy = book.copies.length > 0 ? book.copies[Math.floor(Math.random() * book.copies.length)] : null

          // Horario de atención: 8:00 a 19:30 Lima time
          const hourOffset = (8 + Math.floor(Math.random() * 11)) * HOUR + Math.floor(Math.random() * 60) * 60_000
          const loanedAt = new Date(dayTimestamp - OFFSET + hourOffset + OFFSET)

          const renewals = Math.random() < 0.15 ? 1 : 0
          const dueDays = POLICY.loanDays + renewals * POLICY.renewalDays
          const dueAt = new Date(loanedAt.getTime() + dueDays * DAY)

          let returnedAt: Date | null = null
          let isLate = false

          if (d > 16) {
            // Préstamo antiguo: debe haberse devuelto o ser una mora resuelta
            if (Math.random() < 0.82) {
              // Devuelto a tiempo
              const duration = Math.floor(3 + Math.random() * (POLICY.loanDays - 4))
              returnedAt = new Date(loanedAt.getTime() + duration * DAY)
            } else {
              // Devuelto con retraso
              isLate = true
              const lateDays = Math.floor(1 + Math.random() * 7)
              returnedAt = new Date(dueAt.getTime() + lateDays * DAY)
            }
          } else if (d >= 7) {
            // Hace 1 a 2 semanas
            const rand = Math.random()
            if (rand < 0.55) {
              // Devuelto a tiempo
              const duration = Math.floor(2 + Math.random() * (POLICY.loanDays - 5))
              returnedAt = new Date(loanedAt.getTime() + duration * DAY)
            } else if (rand < 0.70) {
              // Devuelto con retraso
              isLate = true
              const lateDays = Math.floor(1 + Math.random() * 4)
              returnedAt = new Date(dueAt.getTime() + lateDays * DAY)
            } else {
              // Sigue activo
              returnedAt = null
            }
          } else {
            // Semana actual
            if (Math.random() < 0.25) {
              returnedAt = new Date(loanedAt.getTime() + Math.floor(1 + Math.random() * 3) * DAY)
            } else {
              returnedAt = null
            }
          }

          const loan = await prisma.loan.create({
            data: {
              id: `LN-${randomUUID()}`,
              bookId: book.id,
              copyId: copy?.id ?? null,
              userId: student.id,
              loanedAt,
              dueAt,
              returnedAt,
              renewals,
            },
          })
          totalLoansCreated++

          // Generar multas para devoluciones tardías
          if (isLate && returnedAt && returnedAt > dueAt) {
            const daysLate = Math.max(1, Math.ceil((returnedAt.getTime() - dueAt.getTime()) / DAY))
            const amount = Math.round(daysLate * POLICY.finePerDay * 100) / 100
            const fineStatus = Math.random() < 0.75 ? 'paid' : (Math.random() < 0.6 ? 'pending' : 'waived')
            const fineId = `FN-${randomUUID()}`

            await prisma.fine.create({
              data: {
                id: fineId,
                userId: student.id,
                loanId: loan.id,
                bookId: book.id,
                days: daysLate,
                amount,
                createdAt: returnedAt,
                status: fineStatus,
              },
            })
            totalFinesCreated++

            if (fineStatus === 'paid') {
              await prisma.auditEntry.create({
                data: {
                  actorName: 'Administrador',
                  actorRole: 'admin',
                  action: 'fine',
                  detail: `Multa ${fineId} pagada.`,
                  ip: '10.20.0.1',
                  ts: new Date(returnedAt.getTime() + Math.floor(1 + Math.random() * 24) * HOUR),
                },
              })
            }
          }
        }

        // Reservas realistas (1 a 3 por día)
        const reservationsToday = Math.floor(1 + Math.random() * 3)
        for (let r = 0; r < reservationsToday; r++) {
          const student = studentUsers[Math.floor(Math.random() * studentUsers.length)]
          const book = loanableBooks[Math.floor(Math.random() * loanableBooks.length)]
          const copy = book.copies.length > 0 ? book.copies[Math.floor(Math.random() * book.copies.length)] : null
          if (!copy) continue

          const createdAt = new Date(dayTimestamp - OFFSET + (9 + Math.floor(Math.random() * 8)) * HOUR + OFFSET)
          const pickupAt = new Date(createdAt.getTime() + 24 * HOUR)
          const expiresAt = new Date(pickupAt.getTime() + POLICY.holdHours * HOUR)

          let status: 'collected' | 'expired' | 'pending' | 'ready' = 'collected'
          let consumedAt: Date | null = null

          if (expiresAt.getTime() < now) {
            if (Math.random() < 0.82) {
              status = 'collected'
              consumedAt = new Date(pickupAt.getTime() + Math.floor(1 + Math.random() * 10) * HOUR)
            } else {
              status = 'expired'
              consumedAt = null
            }
          } else {
            status = Math.random() < 0.5 ? 'ready' : 'pending'
          }

          await prisma.reservation.create({
            data: {
              id: `RSV-${randomUUID()}`,
              code: `RSV-${randomBytes(4).toString('hex').toUpperCase()}`,
              bookId: book.id,
              copyId: copy.id,
              userId: student.id,
              createdAt,
              pickupAt,
              expiresAt,
              method: Math.random() < 0.7 ? 'desk' : 'locker',
              status,
              nonce: randomBytes(16).toString('hex'),
              consumedAt,
            },
          })
          totalReservationsCreated++
        }

        // Registrar altas de usuario esporádicas en auditoría (para alimentar KPI newUsers)
        if (d % 6 === 0) {
          const u = studentUsers[Math.floor(Math.random() * studentUsers.length)]
          await prisma.auditEntry.create({
            data: {
              actorName: 'Administrador',
              actorRole: 'admin',
              action: 'user',
              detail: `Alta de usuario ${u.id}.`,
              ip: '10.20.0.1',
              ts: new Date(dayTimestamp),
            },
          })
        }
      }

      // 5. Verificación final de la regla "al menos 5 títulos sin préstamos"
      const idleCheck = await prisma.book.count({
        where: {
          loans: { none: {} },
        },
      })

      console.log('--- Resumen de la siembra ---')
      console.log(`Préstamos generados: ${totalLoansCreated}`)
      console.log(`Multas generadas: ${totalFinesCreated}`)
      console.log(`Reservas generadas: ${totalReservationsCreated}`)
      console.log(`Libros totales: ${books.length}`)
      console.log(`Libros sin préstamos garantizados: ${idleCheck}`)

      if (idleCheck < 5) {
        throw new Error(`Error: se requerían al menos 5 títulos sin préstamos, pero hay ${idleCheck}`)
      }

      await prisma.auditEntry.create({
        data: {
          id: historyMarkerId,
          actorName: 'seed-history',
          actorRole: 'system',
          action: 'seed-history',
          detail: 'Historial de 8 semanas generado por completo.',
          ip: '',
        },
      })
      printUsersByRole(users)
      console.log('✓ db:seed-history completado con éxito.')
    }, { timeout: 120_000 })
  } finally {
    await client.$disconnect()
  }
}

main().catch(async (e) => {
  console.error('Error en seed-history:', e)
  process.exit(1)
})

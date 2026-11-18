import { DAY, HOUR, POLICY, fineFor } from '../lib/rules'
import type { AuditEntry, Book, BookFormat, Condition, Copy, Faculty, Fine, Loan, Pavilion, Reservation, User } from '../lib/types'

/** Datos simulados. Todas las fechas se calculan respecto a "ahora", así la
 *  demo siempre muestra préstamos vigentes, por vencer y en mora. */

const now = Date.now()
const ago = (days: number, hours = 0) => now - days * DAY - hours * HOUR

export const FACULTIES: Faculty[] = ['Ingeniería', 'Humanidades', 'Ciencias', 'Ciencias de la Salud', 'Ciencias Empresariales']

export const PAVILIONS: Record<Pavilion, { name: string; area: string }> = {
  A: { name: 'Sala A', area: 'Ingeniería y Ciencias' },
  B: { name: 'Sala B', area: 'Humanidades y Literatura' },
  C: { name: 'Sala C', area: 'Salud y Negocios' },
}
export const SHELVES_PER_PAVILION = 6
export const SHELF_ROWS = 5
export const SHELF_COLS = 8

// ───────────── Libros ─────────────
type BookRow = [
  isbn: string, title: string, author: string, year: number, genre: string, faculties: Faculty[], format: BookFormat,
  pages: number, pavilion: Pavilion, copies: number, demand: number, addedDaysAgo: number, synopsis: string,
]

const ING: Faculty = 'Ingeniería', HUM: Faculty = 'Humanidades', CIE: Faculty = 'Ciencias', SAL: Faculty = 'Ciencias de la Salud', EMP: Faculty = 'Ciencias Empresariales'

const BOOK_ROWS: BookRow[] = [
  ['9780132350884', 'Clean Code', 'Robert C. Martin', 2008, 'Tecnología', [ING], 'ambos', 464, 'A', 4, 96, 210, 'Un manual de artesanía del software: cómo nombrar, estructurar y probar el código para que otros puedan leerlo, mantenerlo y ampliarlo sin miedo. Incluye casos reales de refactorización paso a paso.'],
  ['9780135957059', 'The Pragmatic Programmer', 'David Thomas, Andrew Hunt', 2019, 'Tecnología', [ING], 'fisico', 352, 'A', 3, 88, 12, 'Consejos prácticos para pasar de programador a profesional: responsabilidad sobre el propio trabajo, automatización, diseño flexible y hábitos que sobreviven a cualquier lenguaje o framework.'],
  ['9781449373320', 'Designing Data-Intensive Applications', 'Martin Kleppmann', 2017, 'Tecnología', [ING], 'ambos', 616, 'A', 3, 91, 6, 'Recorre los principios detrás de las bases de datos, los sistemas distribuidos y el procesamiento de flujos, explicando las decisiones de diseño que hacen a una aplicación fiable, escalable y mantenible.'],
  ['9780262033848', 'Introduction to Algorithms', 'Thomas H. Cormen et al.', 2009, 'Tecnología', [ING, CIE], 'fisico', 1312, 'A', 5, 84, 400, 'La referencia universitaria sobre algoritmos: ordenamiento, grafos, programación dinámica y análisis de complejidad, con pseudocódigo riguroso y demostraciones accesibles.'],
  ['9780262035613', 'Deep Learning', 'Ian Goodfellow, Yoshua Bengio, Aaron Courville', 2016, 'Tecnología', [ING, CIE], 'ambos', 800, 'A', 2, 93, 3, 'Fundamentos matemáticos y prácticos de las redes neuronales profundas: optimización, regularización, redes convolucionales y recurrentes, y las líneas de investigación que definieron el campo.'],
  ['9780134757599', 'Refactoring', 'Martin Fowler', 2018, 'Tecnología', [ING], 'digital', 448, 'A', 0, 71, 20, 'Catálogo de transformaciones seguras para mejorar el diseño de código existente sin alterar su comportamiento, con ejemplos actualizados y una guía clara de cuándo aplicar cada una.'],
  ['9780262510875', 'Structure and Interpretation of Computer Programs', 'Harold Abelson, Gerald Jay Sussman', 1996, 'Tecnología', [ING, CIE], 'fisico', 657, 'A', 2, 58, 500, 'Un clásico que enseña a pensar la computación desde la abstracción: procedimientos, datos, estado e intérpretes, construidos desde cero con elegancia.'],
  ['9780465050659', 'The Design of Everyday Things', 'Don Norman', 2013, 'Diseño', [ING, HUM], 'fisico', 368, 'A', 3, 79, 9, 'Por qué algunas puertas confunden y algunos productos encantan. Una introducción al diseño centrado en las personas, las affordances y el error humano como problema de diseño.'],
  ['9781285740621', 'Cálculo de una variable', 'James Stewart', 2015, 'Matemáticas', [CIE, ING], 'fisico', 960, 'A', 5, 82, 320, 'Límites, derivadas e integrales explicados con claridad, abundantes aplicaciones y problemas graduados. El texto de cabecera de los primeros ciclos de ciencias e ingeniería.'],
  ['9780345539434', 'Cosmos', 'Carl Sagan', 1980, 'Ciencia', [CIE], 'ambos', 432, 'A', 3, 77, 150, 'Un viaje por quince mil millones de años de evolución cósmica que entrelaza astronomía, historia y filosofía para contar cómo la ciencia y la civilización crecieron juntas.'],
  ['9780553380163', 'Breve historia del tiempo', 'Stephen Hawking', 1988, 'Ciencia', [CIE], 'fisico', 212, 'A', 3, 74, 260, 'Del Big Bang a los agujeros negros: las grandes preguntas sobre el origen y destino del universo, contadas sin ecuaciones para cualquier lector curioso.'],
  ['9780307474728', 'Cien años de soledad', 'Gabriel García Márquez', 1967, 'Literatura', [HUM], 'fisico', 432, 'B', 4, 95, 600, 'La saga de la familia Buendía a lo largo de siete generaciones en el mítico Macondo. Una obra cumbre del realismo mágico sobre la memoria, el amor y la soledad.'],
  ['9788437604572', 'Rayuela', 'Julio Cortázar', 1963, 'Literatura', [HUM], 'fisico', 736, 'B', 3, 72, 580, 'Una novela que puede leerse en varios órdenes. Entre París y Buenos Aires, Horacio Oliveira busca sentido en el amor, el jazz y el azar.'],
  ['9788420412337', 'La ciudad y los perros', 'Mario Vargas Llosa', 1963, 'Literatura', [HUM], 'fisico', 768, 'B', 3, 81, 540, 'La vida de un grupo de cadetes en un colegio militar limeño, donde la violencia y los códigos de honor moldean —y deforman— a toda una generación.'],
  ['9780802133908', 'Pedro Páramo', 'Juan Rulfo', 1955, 'Literatura', [HUM], 'ambos', 128, 'B', 2, 69, 480, 'Juan Preciado llega a Comala en busca de su padre y encuentra un pueblo habitado por murmullos. Una novela breve y perfecta que cambió la narrativa en español.'],
  ['9780451524935', '1984', 'George Orwell', 1949, 'Literatura', [HUM], 'ambos', 328, 'B', 4, 90, 450, 'En un Estado que vigila cada gesto y reescribe el pasado, Winston Smith comete el delito de pensar por sí mismo. La distopía que dio nombre al Gran Hermano.'],
  ['9780441172719', 'Dune', 'Frank Herbert', 1965, 'Ciencia ficción', [HUM], 'fisico', 896, 'B', 3, 87, 15, 'En el planeta desértico Arrakis, única fuente de la especia más valiosa del universo, el joven Paul Atreides enfrenta una conspiración política y su propio destino.'],
  ['9788420412146', 'Don Quijote de la Mancha', 'Miguel de Cervantes', 1605, 'Clásicos', [HUM], 'ambos', 1376, 'B', 3, 63, 700, 'Un hidalgo enloquecido por los libros de caballerías sale a deshacer agravios junto a su escudero Sancho. La primera novela moderna, tan cómica como melancólica.'],
  ['9780062316097', 'Sapiens: de animales a dioses', 'Yuval Noah Harari', 2015, 'Historia', [HUM, EMP], 'ambos', 464, 'B', 4, 94, 30, 'Una historia breve de la humanidad: cómo la revolución cognitiva, la agrícola y la científica convirtieron a un primate insignificante en la especie dominante del planeta.'],
  ['9780374533557', 'Pensar rápido, pensar despacio', 'Daniel Kahneman', 2011, 'Psicología', [EMP, SAL], 'ambos', 499, 'C', 3, 89, 8, 'Los dos sistemas que gobiernan nuestra mente —uno intuitivo, otro deliberado— y los sesgos que explican por qué decidimos peor de lo que creemos.'],
  ['9780735211292', 'Hábitos atómicos', 'James Clear', 2018, 'Desarrollo personal', [EMP], 'fisico', 320, 'C', 4, 92, 4, 'Un método práctico para construir buenos hábitos y eliminar los malos a partir de cambios diminutos que, acumulados, producen resultados extraordinarios.'],
  ['9780307887894', 'The Lean Startup', 'Eric Ries', 2011, 'Negocios', [EMP, ING], 'ambos', 336, 'C', 3, 76, 100, 'Cómo lanzar productos bajo incertidumbre extrema: experimentos rápidos, aprendizaje validado y el ciclo construir‑medir‑aprender.'],
  ['9781305585126', 'Principios de economía', 'N. Gregory Mankiw', 2017, 'Economía', [EMP], 'fisico', 880, 'C', 5, 80, 240, 'Introducción clara a la micro y macroeconomía a través de diez principios fundamentales, con casos de actualidad y política pública.'],
  ['9780323393041', 'Gray. Anatomía para estudiantes', 'Richard L. Drake et al.', 2019, 'Medicina', [SAL], 'fisico', 1180, 'C', 4, 86, 45, 'Anatomía humana con enfoque clínico y regional, más de mil ilustraciones y correlaciones con imágenes diagnósticas pensadas para estudiantes de ciencias de la salud.'],
]

// Estados físicos no perfectos para que el inventario tenga variedad.
const CONDITION_OVERRIDES: Record<string, Condition> = {
  'EJ-004-5': 'mantenimiento',
  'EJ-009-4': 'regular',
  'EJ-009-5': 'baja',
  'EJ-012-4': 'regular',
  'EJ-016-4': 'mantenimiento',
  'EJ-023-5': 'regular',
  'EJ-013-3': 'regular',
}

export const pad = (n: number, len = 3) => String(n).padStart(len, '0')

const books: Book[] = BOOK_ROWS.map((r, i) => {
  const n = i + 1
  const copies: Copy[] = Array.from({ length: r[9] }, (_, c) => {
    const id = `EJ-${pad(n)}-${c + 1}`
    return { id, condition: CONDITION_OVERRIDES[id] ?? 'excelente', status: 'available' }
  })
  return {
    id: `b${n}`, isbn: r[0], title: r[1], author: r[2], year: r[3], genre: r[4], faculties: r[5], format: r[6], pages: r[7],
    location: { pavilion: r[8], shelf: (i % SHELVES_PER_PAVILION) + 1, row: ((i * 3) % SHELF_ROWS) + 1, col: ((i * 5) % SHELF_COLS) + 1 },
    copies, demand: r[10], addedAt: ago(r[11]), synopsis: r[12],
  }
})

// ───────────── Usuarios ─────────────
const CAREERS: Record<Faculty, string[]> = {
  'Ingeniería': ['Ing. de Software', 'Ing. Industrial', 'Ing. Civil'],
  'Humanidades': ['Literatura', 'Comunicación', 'Filosofía'],
  'Ciencias': ['Física', 'Matemática', 'Biología'],
  'Ciencias de la Salud': ['Medicina', 'Enfermería', 'Psicología'],
  'Ciencias Empresariales': ['Administración', 'Economía', 'Contabilidad'],
}
const FIRST = ['Camila', 'Mateo', 'Daniela', 'Sebastián', 'Ariana', 'Joaquín', 'Fernanda', 'Diego', 'Luciana', 'Adrián', 'Renata', 'Gabriel', 'Antonella', 'Nicolás', 'Paula', 'Thiago', 'Mariana', 'Emilio', 'Sofía', 'Rodrigo']
const LAST = ['Rojas', 'Mendoza', 'Castillo', 'Paredes', 'Huamán', 'Torres', 'Vargas', 'Chávez', 'Ramírez', 'Flores', 'Gutiérrez', 'Campos', 'Delgado', 'Espinoza', 'Navarro', 'Cárdenas', 'Ríos', 'Aguilar', 'Medina', 'Salas']

const slug = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '')
const mkUser = (i: number, role: User['role'], name: string, code: string, faculty: Faculty, career: string, status: User['status'] = 'active'): User => {
  const [first, last] = name.split(' ')
  return { id: `u${i}`, code, name, email: `${slug(first)}.${slug(last)}@campus.edu`, role, faculty, career, status, ip: `10.20.${(i * 7) % 250}.${(i * 37) % 250 + 2}`, lastAccess: ago(0, (i * 5) % 70) }
}

export const DEMO_USER_ID = { student: 'u1', librarian: 'u2', admin: 'u3' } as const

const users: User[] = [
  mkUser(1, 'student', 'Valeria Quispe', 'U20231042', 'Ingeniería', 'Ing. de Software'),
  mkUser(2, 'librarian', 'Martín Salazar', 'BIB-0007', 'Humanidades', 'Biblioteca Central'),
  mkUser(3, 'admin', 'Lucía Fernández', 'ADM-0001', 'Ciencias Empresariales', 'Dirección de Biblioteca'),
  ...Array.from({ length: 39 }, (_, k) => {
    const i = k + 4
    const faculty = FACULTIES[k % FACULTIES.length]
    const role: User['role'] = k === 20 || k === 31 ? 'librarian' : 'student'
    const name = `${FIRST[k % FIRST.length]} ${LAST[(k * 7 + 3 + Math.floor(k / FIRST.length)) % LAST.length]}`
    const code = role === 'librarian' ? `BIB-${pad(10 + k, 4)}` : `U20${21 + (k % 4)}${pad(1100 + k * 13, 4)}`
    return mkUser(i, role, name, code, faculty, role === 'librarian' ? 'Biblioteca Central' : CAREERS[faculty][k % 3], k === 3 || k === 17 ? 'blocked' : 'active')
  }),
]

// ───────────── Préstamos, reservas y multas ─────────────
const loans: Loan[] = []
const fines: Fine[] = []
const reservations: Reservation[] = []

const setCopy = (copyId: string, status: Copy['status']) => {
  for (const b of books) for (const c of b.copies) if (c.id === copyId) c.status = status
}
const bookOfCopy = (copyId: string) => books.find((b) => b.copies.some((c) => c.id === copyId))!

function loan(id: string, userId: string, copyId: string, loanedDaysAgo: number, returnedDaysAgo: number | null = null, renewals = 0, lateFine: Fine['status'] | null = null) {
  const book = bookOfCopy(copyId)
  const loanedAt = ago(loanedDaysAgo, 3)
  const dueAt = loanedAt + (POLICY.loanDays + renewals * POLICY.renewalDays) * DAY
  const returnedAt = returnedDaysAgo === null ? null : ago(returnedDaysAgo, 1)
  loans.push({ id, bookId: book.id, copyId, userId, loanedAt, dueAt, returnedAt, renewals })
  if (returnedAt === null) setCopy(copyId, 'loaned')
  if (lateFine && returnedAt && returnedAt > dueAt) {
    const days = Math.ceil((returnedAt - dueAt) / DAY)
    fines.push({ id: `F-${id}`, userId, loanId: id, bookId: book.id, days, amount: fineFor(days), createdAt: returnedAt, status: lateFine })
  }
}

// Estudiante demo (Valeria): 2 préstamos activos —uno próximo a vencer— e historial.
loan('P-1001', 'u1', 'EJ-001-1', 5)
loan('P-1002', 'u1', 'EJ-019-1', 12)
loan('P-0903', 'u1', 'EJ-012-1', 60, 49)
loan('P-0904', 'u1', 'EJ-016-1', 48, 40)
loan('P-0905', 'u1', 'EJ-010-1', 44, 28, 0, 'paid')
loan('P-0906', 'u1', 'EJ-003-1', 30, 20)
loan('P-0907', 'u1', 'EJ-021-1', 22, 14)
// Otros estudiantes: casos para el mostrador.
loan('P-1003', 'u4', 'EJ-013-1', 18) // en mora (4 días)
loan('P-1004', 'u5', 'EJ-004-1', 3)
loan('P-1005', 'u6', 'EJ-024-1', 25, 8, 0, 'pending') // multa pendiente → no elegible
loan('P-1006', 'u8', 'EJ-017-1', 16) // en mora (2 días)
loan('P-1007', 'u9', 'EJ-023-1', 7)
loan('P-1008', 'u10', 'EJ-005-1', 2)
loan('P-1009', 'u12', 'EJ-009-1', 10)

// Historial sintético (devueltos) para alimentar la analítica.
const students = users.filter((u) => u.role === 'student' && u.id !== 'u1')
const physical = books.filter((b) => b.copies.length > 0)
for (let i = 0; i < 72; i++) {
  const user = students[(i * 7) % students.length]
  const book = physical[(i * 5 + (i % 3)) % physical.length]
  const loanedDaysAgo = 3 + ((i * 13) % 56)
  const duration = Math.min(loanedDaysAgo - 1, i % 9 === 0 ? 16 + (i % 4) : 3 + ((i * 11) % 11))
  loans.push({
    id: `P-H${pad(i)}`, bookId: book.id, copyId: book.copies[0].id, userId: user.id,
    loanedAt: ago(loanedDaysAgo, i % 9), dueAt: ago(loanedDaysAgo, i % 9) + POLICY.loanDays * DAY,
    returnedAt: ago(loanedDaysAgo - duration, i % 5), renewals: 0,
  })
}

function reserve(n: number, userId: string, copyId: string, status: Reservation['status'], createdHoursAgo: number, pickupInHours: number, method: Reservation['method']) {
  const book = bookOfCopy(copyId)
  const pickupAt = now + pickupInHours * HOUR
  reservations.push({
    id: `R-${n}`, code: `RSV-${(n * 7919).toString(36).toUpperCase().padStart(5, '0').slice(-5)}`, bookId: book.id, copyId, userId,
    createdAt: now - createdHoursAgo * HOUR, pickupAt, expiresAt: pickupAt + POLICY.holdHours * HOUR, method,
    locker: method === 'locker' ? `C-${10 + n}` : null, status,
  })
  if (status === 'pending' || status === 'ready') setCopy(copyId, 'reserved')
}

reserve(4101, 'u1', 'EJ-020-1', 'ready', 5, -2, 'desk')
reserve(4102, 'u19', 'EJ-002-1', 'pending', 1, 3, 'desk')
reserve(4103, 'u11', 'EJ-018-1', 'pending', 2, 5, 'locker')
reserve(4104, 'u13', 'EJ-008-1', 'pending', 0.5, 20, 'desk')
reserve(4105, 'u14', 'EJ-022-1', 'ready', 9, -4, 'locker')
reserve(4106, 'u15', 'EJ-011-1', 'ready', 20, -12, 'desk')
reserve(4107, 'u16', 'EJ-014-1', 'expired', 60, -50, 'desk')
reserve(4108, 'u18', 'EJ-015-1', 'cancelled', 30, -10, 'locker')

// ───────────── Auditoría ─────────────
const lib = users[1], adm = users[2]
const AUDIT_ROWS: [hoursAgo: number, actor: User, action: AuditEntry['action'], detail: string][] = [
  [0.4, lib, 'loan', 'Préstamo de «Deep Learning» (EJ-005-1) a Fernanda Torres'],
  [1.2, users[0], 'reservation', 'Reserva RSV de «Pensar rápido, pensar despacio» para recojo en mostrador'],
  [2.5, lib, 'return', 'Devolución de «Hábitos atómicos» (EJ-021-1) · a tiempo'],
  [5, lib, 'reservation', 'Reserva de «Principios de economía» marcada como lista para recojo'],
  [7, adm, 'inventory', 'Ejemplar EJ-016-4 de «1984» enviado a mantenimiento'],
  [9, adm, 'user', 'Cuenta de Sebastián Huamán bloqueada por sanciones acumuladas'],
  [22, lib, 'return', 'Devolución de «Gray. Anatomía para estudiantes» con 3 días de mora · multa generada'],
  [26, adm, 'fine', 'Multa de S/ 3.00 condonada a Mateo Flores (primera infracción)'],
  [30, adm, 'inventory', 'Alta de «Designing Data-Intensive Applications» con 3 ejemplares'],
  [47, lib, 'loan', 'Préstamo de «Cálculo de una variable» (EJ-009-1) a Luciana Salas'],
  [52, adm, 'user', 'Rol de Camila Paredes cambiado a Bibliotecario'],
  [70, adm, 'auth', 'Credenciales restablecidas para 2 usuarios'],
  [75, lib, 'renewal', 'Renovación registrada en mostrador para «Sapiens: de animales a dioses»'],
  [96, adm, 'inventory', 'Ejemplar EJ-009-5 de «Cálculo de una variable» dado de baja por extravío'],
]
const audit: AuditEntry[] = AUDIT_ROWS.map(([h, actor, action, detail], i) => ({
  id: `AUD-${pad(AUDIT_ROWS.length - i, 5)}`, seq: AUDIT_ROWS.length - i, ts: now - h * HOUR, actorName: actor.name, actorRole: actor.role, action, detail, ip: actor.ip,
}))

export const SEED = {
  users, books, loans, reservations, fines, audit,
  wishlist: { u1: ['b5', 'b17', 'b8', 'b22'] } as Record<string, string[]>,
}

// ───────────── Series analíticas (afluencia por franja horaria) ─────────────
export const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const HOURLY_BASE = [18, 42, 76, 118, 141, 96, 64, 88, 132, 149, 121, 83, 47, 22] // 8:00 → 21:00
const DAY_FACTOR = [1, 1.08, 0.94, 1.12, 0.82, 0.38]
export const TRAFFIC_HOURS = HOURLY_BASE.map((_, i) => 8 + i)
export const trafficFor = (dayIndex: number) =>
  HOURLY_BASE.map((v, h) => Math.round(v * DAY_FACTOR[dayIndex] * (1 + (((h * 7 + dayIndex * 13) % 9) - 4) / 40)))

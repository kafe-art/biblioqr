/** Modelo de dominio compartido por los tres roles. */

export type Role = 'student' | 'librarian' | 'admin'

export type Faculty =
  | 'Ingeniería'
  | 'Humanidades'
  | 'Ciencias'
  | 'Ciencias de la Salud'
  | 'Ciencias Empresariales'

export type Condition = 'excelente' | 'regular' | 'mantenimiento' | 'baja'
export type CopyStatus = 'available' | 'loaned' | 'reserved'
export type BookFormat = 'fisico' | 'digital' | 'ambos'
export type Pavilion = 'A' | 'B' | 'C'

/** Ejemplar físico. Su `id` es el código de barras que lee el escáner. */
export interface Copy {
  id: string
  condition: Condition
  status: CopyStatus
}

export interface ShelfLocation {
  pavilion: Pavilion
  shelf: number
  row: number
  col: number
}

export interface Book {
  id: string
  isbn: string
  title: string
  editorial?: string | null
  author: string
  year: number
  genre: string
  faculties: Faculty[]
  synopsis: string
  format: BookFormat
  pages: number
  location: ShelfLocation
  copies: Copy[]
  addedAt: number
  /** Índice de demanda (reservas + préstamos recientes) para rankings. */
  demand: number
  coverUrl?: string
}

export interface User {
  id: string
  /** Código de matrícula / carnet: lo que se escanea en mostrador. */
  code: string
  name: string
  email: string
  role: Role
  faculty: Faculty | ''
  career: string
  status: 'active' | 'blocked'
  ip: string
  lastAccess: number
}

export interface Loan {
  id: string
  bookId: string
  /** `null` = préstamo digital (e-book), no ocupa ejemplar físico. */
  copyId: string | null
  userId: string
  loanedAt: number
  dueAt: number
  returnedAt: number | null
  renewals: number
}

export type ReservationStatus = 'pending' | 'ready' | 'collected' | 'expired' | 'cancelled'
export type PickupMethod = 'desk' | 'locker'

export interface Reservation {
  details?: { id: string; bookId: string; copyId: string | null; status: string }[]
  qrToken?: string
  nonce?: string
  consumedAt?: number | null
  id: string
  /** Código del ticket (contenido del QR). */
  code: string
  bookId: string
  copyId: string
  userId: string
  createdAt: number
  pickupAt: number
  expiresAt: number
  method: PickupMethod
  locker: string | null
  status: ReservationStatus
}

export interface Fine {
  id: string
  userId: string
  loanId: string
  bookId: string
  days: number
  amount: number
  createdAt: number
  status: 'pending' | 'paid' | 'waived'
}

export type AuditAction = 'loan' | 'return' | 'renewal' | 'reservation' | 'inventory' | 'fine' | 'user' | 'auth'

export interface AuditEntry {
  id: string
  before?: unknown
  after?: unknown
  seq: number | string
  ts: number
  actorName: string
  actorRole: Role | 'system'
  action: AuditAction
  detail: string
  ip: string
}

/** Resultado tipado de toda acción de dominio: la UI nunca asume éxito. */
export type Result<T = undefined> = { ok: true; data: T } | { ok: false; error: string }

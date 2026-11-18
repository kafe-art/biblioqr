import type { Book, Copy, Fine, Loan, User } from './types'

/** Reglas de negocio puras (sin React). Única fuente de verdad de la política
 *  de préstamos: la UI y el store las consumen, nunca las reimplementan. */

export const HOUR = 3_600_000
export const DAY = 24 * HOUR

export const POLICY = {
  idleDays: 90,
  loanDays: 14,
  renewalDays: 7,
  maxRenewals: 2,
  maxLoans: 3,
  /** Horas que se guarda un ejemplar reservado a partir de la hora de recojo. */
  holdHours: 24,
  finePerDay: 1.5,
  currency: 'S/',
  /** Días antes del vencimiento en que el semáforo pasa a ámbar. */
  warnDays: 3,
}

export function applyPolicy(value: typeof POLICY) { Object.assign(POLICY, value) }

export const money = (n: number) => `${POLICY.currency} ${n.toFixed(2)}`

export const isLendable = (c: Copy) => c.condition === 'excelente' || c.condition === 'regular'
export const availableCopies = (b: Book) => b.copies.filter((c) => c.status === 'available' && isLendable(c))
export const hasDigital = (b: Book) => b.format !== 'fisico'
export const hasPhysical = (b: Book) => b.format !== 'digital'

/** Días de mora: cada día o fracción cuenta como un día completo. */
export const daysLate = (dueAt: number, at = Date.now()) => Math.max(0, Math.ceil((at - dueAt) / DAY))
export const fineFor = (days: number) => days * POLICY.finePerDay
export const daysLeft = (dueAt: number, at = Date.now()) => Math.ceil((dueAt - at) / DAY)

export interface Eligibility {
  ok: boolean
  reasons: string[]
  activeCount: number
  debt: number
}

/** Valida si un usuario puede llevarse un libro. `forReservation` omite el
 *  límite de préstamos simultáneos (se valida al momento de la entrega). */
export function eligibility(user: User, loans: Loan[], fines: Fine[], forReservation = false, now = Date.now()): Eligibility {
  const active = loans.filter((l) => l.userId === user.id && !l.returnedAt)
  const debt = fines.filter((f) => f.userId === user.id && f.status === 'pending').reduce((s, f) => s + f.amount, 0)
  const overdue = active.filter((l) => l.dueAt < now).length
  const reasons: string[] = []
  if (user.status === 'blocked') reasons.push('Cuenta bloqueada por sanción')
  if (debt > 0) reasons.push(`Multa pendiente de ${money(debt)}`)
  if (overdue > 0) reasons.push(`${overdue} préstamo${overdue > 1 ? 's' : ''} vencido${overdue > 1 ? 's' : ''} sin devolver`)
  if (!forReservation && active.length >= POLICY.maxLoans) reasons.push(`Límite de ${POLICY.maxLoans} préstamos simultáneos`)
  return { ok: reasons.length === 0, reasons, activeCount: active.length, debt }
}

export type AccountLight = 'green' | 'amber' | 'red'

/** Semáforo de estado de cuenta del estudiante. */
export function accountLight(user: User, loans: Loan[], fines: Fine[], now = Date.now()): AccountLight {
  const active = loans.filter((l) => l.userId === user.id && !l.returnedAt)
  const hasDebt = fines.some((f) => f.userId === user.id && f.status === 'pending')
  if (user.status === 'blocked' || hasDebt || active.some((l) => l.dueAt < now)) return 'red'
  if (active.some((l) => daysLeft(l.dueAt, now) <= POLICY.warnDays)) return 'amber'
  return 'green'
}

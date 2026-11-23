import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { homeView } from '../lib/access'
import { api } from '../lib/api'
import { applyPolicy } from '../lib/rules'
import type { AuditEntry, Book, BookFormat, Condition, Faculty, Fine, Loan, Pavilion, PickupMethod, Reservation, Result, Role, User } from '../lib/types'

export interface State {
  users: User[]
  books: Book[]
  loans: Loan[]
  reservations: Reservation[]
  incidencias: { id: string; usuarioId: string; tipo: string; descripcion: string; estado: string }[]
  avisos: { id: string; usuarioId: string; asunto: string; mensaje: string; estado: string }[]
  fines: Fine[]
  audit: AuditEntry[]
  wishlist: Record<string, string[]>
  sessionUserId: string | null
  view: string
  /** Libro en foco: abre la ficha (estudiante), lo ubica en el mapa
   *  (bibliotecario) o abre su edición (admin). */
  focusBookId: string | null
}

export interface BookInput {
  isbn: string
  title: string
  editorial?: string
  author: string
  year: number
  genre: string
  faculties: Faculty[]
  synopsis: string
  format: BookFormat
  pages: number
  pavilion: Pavilion
  copies: number
  coverUrl?: string
}

export interface Receipt {
  receipts?: Receipt[]
  kind: 'loan' | 'return'
  loan: Loan
  user: User
  book: Book
  fine: Fine | null
  at: number
}

export type UserBulkOp = { type: 'activate' } | { type: 'block' } | { type: 'reset' } | { type: 'role'; role: Role }


const emptyState: State = { users: [], books: [], loans: [], reservations: [], fines: [], incidencias: [], avisos: [], audit: [], wishlist: {}, sessionUserId: null, view: 'inicio', focusBookId: null }

export function createActions(get: () => State, set: (next: State) => void) {
  const refresh = async () => {
    const [state, configuration] = await Promise.all([api<Omit<State, 'wishlist' | 'sessionUserId' | 'view' | 'focusBookId'>>('/state'), api<{policy: Parameters<typeof applyPolicy>[0]}>('/policy')])
    applyPolicy(configuration.policy)
    set({ ...get(), ...state })
  }
  const mutate = async <T,>(path: string, method: string, body: unknown, extract: (response: any) => T): Promise<Result<T>> => {
    try {
      const response = await api(path, { method, body })
      const data = extract(response)
      try { await refresh() } catch { toast.error('Operación guardada; no se pudo actualizar la vista. Recarga la página.') }
      return { ok: true, data }
    } catch (error) { return { ok: false, error: error instanceof Error ? error.message : 'No se pudo completar la operación.' } }
  }
  const nothing = () => undefined
  /** Opens the session returned by any sign-in endpoint and loads the user's data. */
  const signIn = async (path: string, body: Record<string, string>): Promise<Result<User>> => {
    try {
      const { user } = await api<{user: User}>(path, { method: 'POST', body })
      set({ ...emptyState, users: [user], sessionUserId: user.id, view: homeView(user.role) })
      try { await refresh() } catch { toast.error('Sesión iniciada; no se pudieron cargar los datos. Recarga la página.') }
      return { ok: true, data: user }
    } catch (error) { return { ok: false, error: error instanceof Error ? error.message : 'No se pudo iniciar sesión.' } }
  }
  return {
    refresh,
    async restore() {
      try {
        const { user } = await api<{user: User}>('/me')
        set({ ...get(), users: [user], sessionUserId: user.id, view: homeView(user.role) })
        await refresh()
      } catch { set({ ...emptyState }) }
    },
    login(identifier: string, password: string) { return signIn('/auth/login', { identifier, password }) },
    verifyOtp(email: string, otp: string) { return signIn('/auth/verify-otp', { email, otp }) },
    setStaffPassword(email: string, otp: string, password: string) { return signIn('/auth/staff/password', { email, otp, password }) },
    async requestCode(kind: 'student' | 'staff', email: string): Promise<Result<{ resendInSeconds: number }>> {
      try { return { ok: true, data: await api<{ resendInSeconds: number }>(kind === 'student' ? '/auth/send-otp' : '/auth/staff/send-code', { method: 'POST', body: { email } }) } }
      catch (error) { return { ok: false, error: error instanceof Error ? error.message : 'No se pudo enviar el código.' } }
    },
    async logout() {
      try { await api('/auth/logout', { method: 'POST', body: {} }); set({ ...emptyState }) }
      catch (error) { toast.error(error instanceof Error ? error.message : 'No se pudo cerrar sesión.') }
    },
    async switchRole(_role: Role) {
      if (import.meta.env.VITE_DEMO_MODE !== 'true') return
      try { await api('/auth/logout', { method: 'POST', body: {} }) } catch { /* A missing session already requires authentication. */ }
      set({ ...emptyState })
      toast('Ingresa las credenciales de la cuenta del rol que deseas probar.')
    },
    navigate(view: string) { set({ ...get(), view, focusBookId: null }) },
    focusBook(bookId: string | null, view?: string) { set({ ...get(), focusBookId: bookId, view: view ?? get().view }) },
    toggleWishlist(bookId: string) {
      const s = get(); const id = s.sessionUserId
      if (!id) return false
      const list = s.wishlist[id] ?? []; const added = !list.includes(bookId)
      set({ ...s, wishlist: { ...s.wishlist, [id]: added ? [bookId, ...list] : list.filter(b => b !== bookId) } })
      return added
    },
    reserve: (bookIds: string[], pickupAt: number, method: PickupMethod) => mutate<Reservation>('/reservations', 'POST', { bookIds, pickupAt, method }, r => ({ ...r.reservation, qrToken: r.qrToken })),
    cancelReservation: (id: string) => mutate('/reservations/'+encodeURIComponent(id), 'DELETE', {}, nothing),
    borrowDigital: (bookId: string) => mutate<Loan>('/loans/digital', 'POST', { bookId }, r => r.loan),
    returnDigital: (id: string) => mutate('/loans/'+encodeURIComponent(id)+'/return-digital', 'POST', {}, nothing),
    renewLoan: (id: string) => mutate<Loan>('/loans/'+encodeURIComponent(id)+'/renew', 'POST', {}, r => r.loan),
    checkout: (userId: string, copyId: string) => mutate<Receipt>('/circulation/checkout', 'POST', { userCode: get().users.find(u => u.id === userId)?.code ?? userId, copyId }, r => r),
    deliverReservation: (qrToken: string) => mutate<Receipt>('/circulation/scan', 'POST', { qrToken }, r => r),
    checkin: (copyId: string) => mutate<Receipt>('/circulation/checkin', 'POST', { copyId }, r => r),
    markReservationReady: (id: string) => mutate('/reservations/'+encodeURIComponent(id)+'/ready', 'POST', {}, nothing),
    reportIncident: (loanId: string, tipo: string, descripcion: string) => mutate('/incidencias', 'POST', { loanId, tipo, descripcion }, nothing),
    readNotice: (id: string) => mutate('/avisos/'+id+'/leer', 'POST', {}, nothing),
    payFine: (id: string) => mutate('/fines/'+encodeURIComponent(id)+'/pay', 'POST', {}, nothing),
    waiveFine: (id: string) => mutate('/fines/'+encodeURIComponent(id)+'/waive', 'POST', {}, nothing),
    bulkUsers: (ids: string[], op: UserBulkOp) => mutate<number>('/admin/users/bulk', 'POST', { ids, op }, r => r.count),
    grantAccess: (email: string, name: string, role: Role) => mutate<User>('/admin/users', 'POST', { email, name, role }, r => r.user),
    saveBook: (input: BookInput, id?: string) => mutate<Book>('/admin/books'+(id ? '/'+encodeURIComponent(id) : ''), id ? 'PUT' : 'POST', input, r => r.book),
    importBooks: (books: BookInput[]) => mutate<{created: number; skipped: number}>('/admin/books/import', 'POST', { books }, r => r),
    deleteBook: (id: string) => mutate('/admin/books/'+encodeURIComponent(id), 'DELETE', {}, nothing),
    addCopy: (id: string) => mutate('/admin/books/'+encodeURIComponent(id)+'/copies', 'POST', {}, nothing),
    setCopyCondition: (id: string, condition: Condition) => mutate('/admin/copies/'+encodeURIComponent(id), 'PATCH', { condition }, nothing),
  }
}
export type Actions = ReturnType<typeof createActions>
interface LibraryContext extends State { user: User | null; actions: Actions }
const Ctx = createContext<LibraryContext | null>(null)
export function LibraryProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(() => ({ ...emptyState }))
  const ref = useRef(state)
  const actions = useMemo(() => createActions(() => ref.current, next => { ref.current = next; setState(next) }), [])
  useEffect(() => { void actions.restore() }, [actions])
  useEffect(() => {
    if (!state.sessionUserId) return
    const timer = setInterval(() => { void actions.refresh().catch(() => {}) }, 20000)
    return () => clearInterval(timer)
  }, [actions, state.sessionUserId])
  const value = useMemo<LibraryContext>(() => ({ ...state, user: state.users.find(u => u.id === state.sessionUserId) ?? null, actions }), [state, actions])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
export function useLibrary() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useLibrary debe usarse dentro de <LibraryProvider>')
  return ctx
}
export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), intervalMs); return () => clearInterval(timer) }, [intervalMs])
  return now
}

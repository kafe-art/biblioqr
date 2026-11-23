import { AnimatePresence, motion } from 'motion/react'
import { LogOut, Moon, QrCode, Search, Sun } from 'lucide-react'
import { useCallback, useEffect, useState, type ComponentType } from 'react'
import { NAV, ROLE_LABEL, can } from '../../lib/access'
import { accountLight } from '../../lib/rules'
import { useTheme } from '../../lib/theme'
import type { Role, User } from '../../lib/types'
import { useLibrary } from '../../store/library'
import { AnalyticsView } from '../../features/admin/AnalyticsView'
import { AuditView } from '../../features/admin/AuditView'
import { CatalogView } from '../../features/admin/CatalogView'
import { UsersView } from '../../features/admin/UsersView'
import { TodayView } from '../../features/librarian/TodayView'
import { DeskContext, modes, type DeskRequest } from '../../features/librarian/desk'
import { CirculationView } from '../../features/librarian/CirculationView'
import { LibraryMapView } from '../../features/librarian/LibraryMapView'
import { ReservationsView } from '../../features/librarian/ReservationsView'
import { BookSheet } from '../../features/student/BookSheet'
import { HomeView } from '../../features/student/HomeView'
import { LockerView } from '../../features/student/LockerView'
import { Avatar, Button, cn } from '../ui/primitives'
import { CommandBar } from './CommandBar'

/** Registro de vistas por rol: cada rol es un módulo aislado en `features/`.
 *  El shell solo puede montar vistas del rol en sesión, y además comprueba el
 *  permiso de la vista antes de renderizarla. */
const VIEWS: Record<Role, Record<string, ComponentType>> = {
  student: { inicio: HomeView, casillero: LockerView },
  librarian: { hoy: TodayView, circulacion: CirculationView, reservas: ReservationsView, mapa: LibraryMapView },
  admin: { analitica: AnalyticsView, usuarios: UsersView, catalogo: CatalogView, auditoria: AuditView },
}

export function Logo({ light }: { light?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-primary text-white shadow-sm shadow-primary/40">
        <QrCode size={18} aria-hidden />
      </span>
      <span className={cn('text-[15px] font-semibold tracking-tight', light && 'text-white')}>BiblioQR</span>
    </span>
  )
}

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggle } = useTheme()
  return (
    <Button variant="ghost" size="icon" onClick={toggle} aria-label={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'} className={className}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.span key={theme} initial={{ rotate: -60, opacity: 0, scale: 0.6 }} animate={{ rotate: 0, opacity: 1, scale: 1 }} exit={{ rotate: 60, opacity: 0, scale: 0.6 }} transition={{ duration: 0.18 }}>
          {theme === 'dark' ? <Sun size={18} aria-hidden /> : <Moon size={18} aria-hidden />}
        </motion.span>
      </AnimatePresence>
    </Button>
  )
}

const LIGHT_DOT = { green: 'bg-emerald-500', amber: 'bg-amber-500', red: 'bg-rose-500' }

export function AppShell({ user }: { user: User }) {
  const { view, loans, fines, actions } = useLibrary()
  const [commandOpen, setCommandOpen] = useState(false)
  const [request, setRequest] = useState<DeskRequest>({})
  const go = useCallback((target: string, next: DeskRequest = {}, book?: string) => {
    setRequest(next)
    if (book) actions.focusBook(book, target)
    else actions.navigate(target)
  }, [actions])
  useEffect(() => {
    if (user.role !== 'librarian') return
    const shortcut = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && event.target.closest('textarea, select, [role="dialog"]')) return
      const mode = modes.find(m => m.key === event.key)
      const page = event.altKey && /^[1-4]$/.test(event.key) ? NAV.librarian[Number(event.key) - 1] : null
      if (!mode && !page) return
      event.preventDefault()
      if (mode) go('circulacion', { mode: mode.value })
      else if (page) go(page.id)
    }
    window.addEventListener('keydown', shortcut)
    return () => window.removeEventListener('keydown', shortcut)
  }, [go, user.role])
  const nav = NAV[user.role].filter((item) => can(user.role, item.permission))
  const current = nav.find((n) => n.id === view) ?? nav[0]
  const View = VIEWS[user.role][current.id]
  const light = user.role === 'student' ? accountLight(user, loans, fines) : null

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setCommandOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const navLinks = (
    <>
      {nav.map((item) => {
        const active = item.id === current.id
        return (
          <button
            key={item.id}
            type="button"
            aria-current={active ? 'page' : undefined}
            onClick={() => user.role === 'librarian' ? go(item.id) : actions.navigate(item.id)}
            className={cn('relative flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium whitespace-nowrap transition-colors', active ? 'text-fg' : 'text-muted hover:text-fg')}
          >
            {active && <motion.span layoutId="nav-pill" className="absolute inset-0 rounded-lg bg-surface-2" transition={{ type: 'spring', duration: 0.35, bounce: 0.15 }} />}
            <item.icon size={16} className="relative" aria-hidden />
            <span className="relative">{item.label}</span>
            {item.id === 'casillero' && light && light !== 'green' && (
              <span className={cn('relative h-2 w-2 rounded-full', LIGHT_DOT[light])}>
                <span className="sr-only">{light === 'red' ? 'Tienes alertas de mora' : 'Tienes entregas próximas'}</span>
              </span>
            )}
          </button>
        )
      })}
    </>
  )

  return (
    <div className="min-h-dvh pb-24">
      <a href="#contenido" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:text-white">
        Saltar al contenido
      </a>
      <header className="glass sticky top-0 z-30 border-b border-line print:hidden">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6">
          <Logo />
          <nav aria-label="Principal" className="ml-4 hidden items-center gap-1 md:flex">{navLinks}</nav>
          <button
            type="button"
            onClick={() => setCommandOpen(true)}
            className={cn(user.role === 'librarian' && 'md:max-lg:w-auto! md:max-lg:[&>span:not(.sr-only)]:sr-only md:max-lg:[&>kbd]:hidden', "ml-auto flex h-9 items-center gap-2 rounded-lg border border-line bg-surface/70 px-3 text-sm text-muted transition-colors hover:border-line-strong hover:text-fg sm:w-64")}
          >
            <Search size={15} aria-hidden />
            <span className="hidden flex-1 text-left sm:block">Buscar título, autor, ISBN…</span>
            <span className="sr-only sm:hidden">Buscar</span>
            <kbd className="hidden rounded-md border border-line bg-surface-2 px-1.5 py-0.5 font-sans text-[11px] font-medium sm:block">Ctrl K</kbd>
          </button>
          <ThemeToggle />
          <div className="flex items-center gap-2.5 border-l border-line pl-3">
            <Avatar name={user.name} size={34} />
            <div className="hidden leading-tight lg:block">
              <p className="text-[13px] font-medium">{user.name}</p>
              <p className="text-xs text-muted">{ROLE_LABEL[user.role]}</p>
            </div>
            <Button variant="ghost" size="icon" onClick={() => actions.logout()} aria-label="Cerrar sesión">
              <LogOut size={17} aria-hidden />
            </Button>
          </div>
        </div>
        <nav aria-label="Principal" className="no-scrollbar flex items-center gap-1 overflow-x-auto border-t border-line px-3 py-1.5 md:hidden">{navLinks}</nav>
      </header>

      <DeskContext.Provider value={{ request, go }}>
      <main id="contenido" className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={`${user.role}-${current.id}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
            <View />
          </motion.div>
        </AnimatePresence>
      </main>
      </DeskContext.Provider>

      <CommandBar open={commandOpen} onOpenChange={setCommandOpen} />
      {user.role === 'student' && <BookSheet />}
    </div>
  )
}

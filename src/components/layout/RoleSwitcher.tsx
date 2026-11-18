import { motion } from 'motion/react'
import { GraduationCap, ScanLine, ShieldCheck, type LucideIcon } from 'lucide-react'
import { ROLE_LABEL } from '../../lib/access'
import type { Role } from '../../lib/types'
import { useLibrary } from '../../store/library'
import { cn } from '../ui/primitives'

const ROLES: { role: Role; icon: LucideIcon }[] = [
  { role: 'student', icon: GraduationCap },
  { role: 'librarian', icon: ScanLine },
  { role: 'admin', icon: ShieldCheck },
]

/** Conmutador flotante de rol para pruebas: inicia sesión con la cuenta demo
 *  del rol elegido. Es una ayuda de QA; en producción se elimina este componente. */
export function RoleSwitcher() {
  const { user, actions } = useLibrary()
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4 print:hidden">
      <div role="group" aria-label="Cambiar de rol (modo pruebas)" className="glass pointer-events-auto flex items-center gap-1 rounded-2xl border border-line p-1.5 shadow-pop">
        <span className="hidden px-2 text-xs font-medium text-muted sm:block">Ver como</span>
        {ROLES.map(({ role, icon: Icon }) => {
          const active = user?.role === role
          return (
            <button
              key={role}
              type="button"
              aria-pressed={active}
              onClick={() => actions.switchRole(role)}
              className={cn('relative flex h-9 items-center gap-1.5 rounded-xl px-3 text-[13px] font-medium transition-colors', active ? 'text-white' : 'text-muted hover:text-fg')}
            >
              {active && <motion.span layoutId="role-pill" className="absolute inset-0 rounded-xl bg-primary shadow-sm shadow-primary/40" transition={{ type: 'spring', duration: 0.4, bounce: 0.18 }} />}
              <Icon size={15} className="relative" aria-hidden />
              <span className="relative">{ROLE_LABEL[role]}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

import { MotionConfig } from 'motion/react'
import { Toaster } from 'sonner'
import { AppShell } from './components/layout/AppShell'
import { RoleSwitcher } from './components/layout/RoleSwitcher'
import { AuthHub } from './features/auth/AuthHub'
import { useTheme } from './lib/theme'
import { useLibrary } from './store/library'

/** Raíz de la app. Sin sesión → Auth Hub. Con sesión → AppShell, que monta
 *  únicamente el módulo del rol autenticado (student / librarian / admin). */
export default function App() {
  const { user } = useLibrary()
  const { theme } = useTheme()
  return (
    <MotionConfig reducedMotion="user" transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}>
      {user ? <AppShell user={user} /> : <AuthHub />}
      {import.meta.env.VITE_DEMO_MODE === 'true' && <RoleSwitcher />}
      <Toaster
        theme={theme}
        position="top-right"
        closeButton
        toastOptions={{ style: { background: 'var(--surface)', color: 'var(--fg)', border: '1px solid var(--line)', borderRadius: '14px', boxShadow: 'var(--shadow-pop)' } }}
      />
    </MotionConfig>
  )
}

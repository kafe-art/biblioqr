import { AnimatePresence, motion } from 'motion/react'
import { ArrowRight, Eye, EyeOff, Loader2 } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { BookCover } from '../../components/BookCover'
import { Logo, ThemeToggle } from '../../components/layout/AppShell'
import { Button, Field, inputCls } from '../../components/ui/primitives'
import { DAY } from '../../lib/rules'
import { useLibrary } from '../../store/library'

const QUOTES = [
  { text: 'El que lee mucho y anda mucho, ve mucho y sabe mucho.', author: 'Miguel de Cervantes' },
  { text: 'Un hogar sin libros es como un cuerpo sin alma.', author: 'Cicerón' },
  { text: 'No hay fragata como un libro para llevarnos a tierras lejanas.', author: 'Emily Dickinson' },
  { text: 'La lectura es a la mente lo que el ejercicio es al cuerpo.', author: 'Joseph Addison' },
]


export function AuthHub() {
  const { actions } = useLibrary()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [visible, setVisible] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    setBusy(true); setError('')
    const result = await actions.login(identifier.trim(), password)
    setBusy(false)
    if (!result.ok) { setError(result.error); return }
    toast.success('Bienvenido, '+result.data.name)
  }
  return <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
    <Showcase />
    <section className="relative flex flex-col justify-center px-6 py-10 sm:px-12">
      <div className="absolute top-5 right-5"><ThemeToggle /></div>
      <div className="mx-auto w-full max-w-[400px]">
        <div className="lg:hidden"><Logo /></div>
        <h1 className="mt-8 text-[28px] font-semibold">Bienvenido de vuelta</h1>
        <p className="mt-2 text-sm text-muted">Ingresa con tu cuenta institucional.</p>
        <form onSubmit={submit} className="mt-8 space-y-4">
          <Field label="Correo institucional o código">{id => <input id={id} className={inputCls} autoComplete="username" required value={identifier} onChange={e => setIdentifier(e.target.value)} />}</Field>
          <Field label="Contraseña">{id => <div className="relative"><input id={id} className={inputCls} type={visible ? 'text' : 'password'} autoComplete="current-password" required maxLength={128} value={password} onChange={e => setPassword(e.target.value)} /><button type="button" className="absolute top-2 right-2" aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'} onClick={() => setVisible(!visible)}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button></div>}</Field>
          {error && <p role="alert" className="text-sm text-bad">{error}</p>}
          <Button type="submit" className="w-full" disabled={busy}>{busy ? <Loader2 size={18} className="animate-spin" /> : <>Ingresar <ArrowRight size={17} /></>}</Button>
        </form>
      </div>
    </section>
  </div>
}

function Showcase() {
  const { books, loans, users } = useLibrary()
  const [quote, setQuote] = useState(0)

  useEffect(() => {
    const q = setInterval(() => setQuote((i) => (i + 1) % QUOTES.length), 6500)
    return () => {
      clearInterval(q)
    }
  }, [])

  const stats = [
    { label: 'préstamos este mes', value: loans.filter((l) => l.loanedAt > Date.now() - 30 * DAY).length },
    { label: 'títulos en catálogo', value: books.length },
    { label: 'miembros activos', value: users.filter((u) => u.status === 'active').length },
  ]
  const wall = [0, 11, 18, 2, 16, 9, 4, 19, 12].map((i) => books[i]).filter(Boolean)

  return (
    <aside className="relative hidden overflow-hidden bg-[#0b1024] text-white lg:flex lg:flex-col lg:justify-between lg:p-12">
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="absolute -top-32 -left-24 h-[28rem] w-[28rem] rounded-full bg-indigo-600/45 blur-[110px]" />
        <div className="absolute right-[-10rem] bottom-[-8rem] h-[26rem] w-[26rem] rounded-full bg-violet-500/30 blur-[120px]" />
        <div className="absolute top-1/3 right-1/4 h-40 w-40 rounded-full bg-emerald-400/15 blur-[70px]" />
        {/* Muro de portadas en perspectiva */}
        <div className="absolute top-[14%] right-[-6%] w-[62%] opacity-90" style={{ transform: 'perspective(1400px) rotateY(-24deg) rotateX(10deg) rotateZ(3deg)', transformStyle: 'preserve-3d' }}>
          <div className="grid grid-cols-3 gap-4">
            {wall.map((b, i) => (
              <motion.div key={b.id} initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 + i * 0.06, duration: 0.6 }} style={{ animation: `float-slow ${7 + (i % 3)}s ease-in-out ${i * 0.4}s infinite` }}>
                <BookCover book={b} className="rounded-md shadow-[0_24px_40px_-12px_rgb(0_0_0/0.7)]" />
              </motion.div>
            ))}
          </div>
        </div>
        <div className="absolute inset-0 bg-gradient-to-r from-[#0b1024] via-[#0b1024]/80 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-[#0b1024] to-transparent" />
      </div>

      <div className="relative"><Logo light /></div>

      <div className="relative max-w-md">
        <p className="mb-4 text-xs font-medium tracking-[0.18em] text-indigo-300 uppercase">Sistema integral de biblioteca</p>
        <div className="min-h-[9.5rem]">
          <AnimatePresence mode="wait">
            <motion.blockquote key={quote} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.45 }}>
              <p className="text-[28px] leading-[1.25] font-semibold tracking-tight text-balance">“{QUOTES[quote].text}”</p>
              <footer className="mt-3 text-sm text-slate-300">— {QUOTES[quote].author}</footer>
            </motion.blockquote>
          </AnimatePresence>
        </div>

        <dl className="mt-8 grid grid-cols-2 gap-3">
          {stats.map((s) => (
            <div key={s.label} className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 backdrop-blur-md">
              <dd className="tabular flex items-center gap-2 text-2xl font-semibold tracking-tight">
                {s.value.toLocaleString('es')}
              </dd>
              <dt className="mt-0.5 text-xs text-slate-300">{s.label}</dt>
            </div>
          ))}
        </dl>
      </div>
    </aside>
  )
}


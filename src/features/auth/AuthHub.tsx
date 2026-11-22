import { AnimatePresence, motion, useAnimate } from 'motion/react'
import { ArrowLeft, ArrowRight, BadgeCheck, CheckCircle2, Eye, EyeOff, KeyRound, Loader2, LockKeyhole, Mail, MailCheck, RotateCw, ShieldCheck, Sparkles, UserCog } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState, type ClipboardEvent, type FormEvent, type KeyboardEvent, type ReactNode } from 'react'
import { toast } from 'sonner'
import { api } from '../../lib/api'
import { cn } from '../../components/ui/primitives'
import { useLibrary } from '../../store/library'

type Tab = 'student' | 'staff'
const DEFAULT_DOMAIN = 'alumnos.unp.edu.pe'
const OTP_LENGTH = 6
const ease = [0.22, 1, 0.36, 1] as const

const QUOTES = [
  { text: 'Un lector vive mil vidas antes de morir.', author: 'George R. R. Martin' },
  { text: 'La lectura es a la mente lo que el ejercicio es al cuerpo.', author: 'Joseph Addison' },
  { text: 'El que lee mucho y anda mucho, ve mucho y sabe mucho.', author: 'Miguel de Cervantes' },
]

/* ------------------------------------------------------------------ helpers */

function useStudentDomain() {
  const [domain, setDomain] = useState(DEFAULT_DOMAIN)
  useEffect(() => { api<{ studentDomain: string }>('/auth/config').then(c => setDomain(c.studentDomain)).catch(() => {}) }, [])
  return domain
}

function useCountdown() {
  const [left, setLeft] = useState(0)
  useEffect(() => {
    if (left <= 0) return
    const t = setTimeout(() => setLeft(l => l - 1), 1000)
    return () => clearTimeout(t)
  }, [left])
  return [left, setLeft] as const
}

function useShake() {
  const [scope, animate] = useAnimate<HTMLDivElement>()
  const shake = () => { if (scope.current) animate(scope.current, { x: [0, -9, 9, -6, 6, -3, 0] }, { duration: 0.42 }) }
  return [scope, shake] as const
}

const maskEmail = (email: string) => {
  const [local, domain] = email.split('@')
  return `${local.slice(0, 1)}${'*'.repeat(Math.max(3, Math.min(local.length - 1, 6)))}@${domain}`
}
const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

/* --------------------------------------------------------------- component */

export function AuthHub() {
  const [tab, setTab] = useState<Tab>('student')
  const domain = useStudentDomain()
  return (
    <div className="dark relative min-h-dvh overflow-clip bg-[#0F172A] text-slate-100 selection:bg-indigo-500/40">
      <Backdrop />
      <main className="relative z-10 mx-auto flex min-h-dvh w-full max-w-6xl items-center px-4 py-8 sm:px-6 lg:py-12">
        <motion.div initial={{ opacity: 0, y: 24, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.8, ease }}
          className="relative w-full rounded-[32px] border border-white/10 bg-gradient-to-br from-white/[0.06] via-[#1E3A8A]/[0.08] to-[#4F46E5]/[0.10] p-[1px] shadow-[0_40px_120px_-30px_rgb(79_70_229/0.55)]">
          <div className="relative grid overflow-clip rounded-[31px] bg-[#0B1226]/80 backdrop-blur-xl lg:grid-cols-[1.05fr_1fr]">
            <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgb(79_70_229/0.22),transparent_55%),radial-gradient(ellipse_at_bottom_right,rgb(30_58_138/0.35),transparent_60%)]" />
            <Brand />
            <section className="relative flex items-center justify-center px-5 pt-2 pb-8 sm:px-10 lg:py-16">
              <AccessCard tab={tab} setTab={setTab} domain={domain} />
            </section>
          </div>
        </motion.div>
      </main>
    </div>
  )
}

/* ---------------------------------------------------------------- backdrop */

function Backdrop() {
  const stars = useMemo(() => Array.from({ length: 46 }, (_, i) => ({ x: (i * 37.7) % 100, y: (i * 61.3) % 100, d: 2 + (i % 5), s: i % 7 === 0 ? 2 : 1 })), [])
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 overflow-clip">
      <div className="absolute -top-[20vh] -left-[10vw] h-[70vh] w-[60vw] rounded-full bg-[#4F46E5]/35 blur-[120px]" style={{ animation: 'mesh-a 22s ease-in-out infinite' }} />
      <div className="absolute -right-[15vw] -bottom-[25vh] h-[75vh] w-[60vw] rounded-full bg-[#1E3A8A]/55 blur-[130px]" style={{ animation: 'mesh-b 26s ease-in-out infinite' }} />
      <div className="absolute top-[35%] left-[42%] h-[28vh] w-[22vw] rounded-full bg-[#10B981]/12 blur-[100px]" style={{ animation: 'mesh-a 30s ease-in-out infinite reverse' }} />
      <div className="absolute inset-0 opacity-[0.18] [background-image:radial-gradient(rgb(148_163_184/0.5)_1px,transparent_1px)] [background-size:28px_28px] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]" />
      {stars.map((p, i) => <span key={i} className="absolute rounded-full bg-sky-200" style={{ left: `${p.x}%`, top: `${p.y}%`, width: p.s, height: p.s, animation: `twinkle ${p.d}s ease-in-out ${i * 0.17}s infinite` }} />)}
    </div>
  )
}

/* ------------------------------------------------------------------- brand */

function Brand() {
  const [quote, setQuote] = useState(0)
  useEffect(() => { const t = setInterval(() => setQuote(q => (q + 1) % QUOTES.length), 7000); return () => clearInterval(t) }, [])
  return (
    <section className="relative flex flex-col items-center justify-center px-6 pt-10 pb-6 text-center sm:px-10 lg:py-16">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.7, ease }}>
        <BrandMark />
      </motion.div>
      <motion.h1 initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.6, ease }}
        className="mt-5 bg-gradient-to-b from-white to-slate-300 bg-clip-text text-5xl font-bold tracking-tight text-transparent sm:text-6xl">
        BiblioQR
      </motion.h1>
      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.45 }} className="mt-3 flex items-center gap-3 text-sm text-slate-300 sm:text-base">
        <span className="h-px w-6 bg-slate-500" />Biblioteca Central · UNP<span className="h-px w-6 bg-slate-500" />
      </motion.p>
      <div className="mt-8 hidden min-h-[5.5rem] max-w-sm lg:block">
        <AnimatePresence mode="wait">
          <motion.blockquote key={quote} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.5 }}>
            <p className="text-[17px] leading-relaxed text-pretty text-slate-200">“{QUOTES[quote].text}”</p>
            <footer className="mt-2 text-xs tracking-wide text-slate-400">— {QUOTES[quote].author}</footer>
          </motion.blockquote>
        </AnimatePresence>
      </div>
      <ul className="mt-6 hidden flex-wrap justify-center gap-2 lg:flex">
        {[[ShieldCheck, 'Acceso verificado'], [LockKeyhole, 'Sesión cifrada'], [BadgeCheck, 'Comunidad UNP']].map(([Icon, label], i) => {
          const I = Icon as typeof ShieldCheck
          return <motion.li key={label as string} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 + i * 0.08 }}
            className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-slate-300 backdrop-blur"><I size={13} className="text-emerald-400" />{label as string}</motion.li>
        })}
      </ul>
    </section>
  )
}

/** Glowing open book + QR isotype, drawn in SVG so it stays crisp at any size. */
function BrandMark() {
  const qr = ['1110111', '1010101', '1110111', '0001000', '1101011', '0110110', '1011101']
  return (
    <div className="relative mx-auto h-28 w-44 sm:h-32 sm:w-52">
      <div className="absolute inset-0 rounded-full bg-indigo-500/40 blur-2xl" style={{ animation: 'glow-breathe 5s ease-in-out infinite' }} />
      <div className="absolute top-2 right-2 h-20 w-20 rounded-full bg-emerald-400/30 blur-2xl" style={{ animation: 'glow-breathe 4s ease-in-out 1s infinite' }} />
      <svg viewBox="0 0 208 128" className="relative h-full w-full drop-shadow-[0_0_18px_rgb(99_102_241/0.55)]" role="img" aria-label="Isotipo de BiblioQR">
        <defs>
          <linearGradient id="pg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#93c5fd" /><stop offset="1" stopColor="#4F46E5" /></linearGradient>
          <linearGradient id="pg2" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#bfdbfe" /><stop offset="1" stopColor="#1E3A8A" /></linearGradient>
          <filter id="qrglow"><feGaussianBlur stdDeviation="1.6" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
        </defs>
        {/* book: back pages, cover and front page fanned like a 3D object */}
        <path d="M14 30 Q44 18 74 30 L74 112 Q44 100 14 112 Z" fill="url(#pg2)" opacity=".55" />
        <path d="M20 24 Q48 12 76 26 L76 108 Q48 94 20 106 Z" fill="url(#pg)" opacity=".85" />
        <path d="M26 18 Q52 6 78 22 L78 104 Q52 88 26 100 Z" fill="url(#pg)" />
        <path d="M78 22 Q92 14 104 18 L104 100 Q92 96 78 104 Z" fill="#a5b4fc" opacity=".9" />
        <path d="M34 36 Q52 28 70 36 M34 48 Q52 40 70 48 M34 60 Q52 52 70 60" stroke="#e0e7ff" strokeOpacity=".6" strokeWidth="2.2" fill="none" strokeLinecap="round" />
        <path d="M10 114 Q48 102 80 112 Q112 102 150 114" stroke="#6366f1" strokeWidth="3" fill="none" strokeLinecap="round" opacity=".8" />
        {/* QR */}
        <g transform="translate(118 26)" filter="url(#qrglow)">
          <rect x="-6" y="-6" width="76" height="76" rx="10" fill="#052e2b" opacity=".55" stroke="#10B981" strokeOpacity=".5" />
          {qr.flatMap((row, y) => row.split('').map((c, x) => c === '1' ? <rect key={`${x}-${y}`} x={x * 9.3} y={y * 9.3} width="8" height="8" rx="1.6" fill="#34d399" /> : null))}
        </g>
      </svg>
      <span className="pointer-events-none absolute top-[22px] right-[22px] h-[2px] w-[62px] rounded bg-emerald-300 shadow-[0_0_12px_2px_rgb(52_211_153/0.8)] sm:top-[26px] sm:right-[24px] sm:w-[70px]" style={{ animation: 'qr-scan 2.8s ease-in-out infinite' }} />
    </div>
  )
}

/* ------------------------------------------------------------- access card */

function AccessCard({ tab, setTab, domain }: { tab: Tab; setTab: (t: Tab) => void; domain: string }) {
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25, duration: 0.7, ease }}
      className="relative w-full max-w-[440px] rounded-[26px] border border-white/15 bg-white/[0.07] p-6 shadow-[0_30px_80px_-20px_rgb(0_0_0/0.6),inset_0_1px_0_rgb(255_255_255/0.12)] backdrop-blur-2xl sm:p-8">
      <div aria-hidden className="absolute inset-x-10 -top-px h-px bg-gradient-to-r from-transparent via-indigo-300/70 to-transparent" />
      <div aria-hidden className="absolute inset-x-16 -bottom-px h-px bg-gradient-to-r from-transparent via-sky-400/40 to-transparent" />
      <div role="tablist" aria-label="Tipo de acceso" className="relative grid grid-cols-2 rounded-full border border-white/10 bg-slate-950/50 p-1.5">
        {([['student', 'Estudiante'], ['staff', 'Personal']] as const).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
            className={cn('relative z-10 flex h-11 items-center justify-center gap-2 rounded-full text-sm font-semibold transition-colors', tab === id ? 'text-white' : 'text-slate-400 hover:text-slate-200')}>
            {tab === id && <motion.span layoutId="tab-pill" transition={{ type: 'spring', stiffness: 420, damping: 34 }}
              className="absolute inset-0 -z-10 rounded-full bg-gradient-to-r from-[#4F46E5] to-[#2563eb] shadow-[0_0_24px_-2px_rgb(79_70_229/0.85),inset_0_1px_0_rgb(255_255_255/0.25)]" />}
            {label}
            {tab === id && <span className="h-2.5 w-2.5 rounded-full bg-sky-300 shadow-[0_0_10px_3px_rgb(125_211_252/0.9)]" />}
          </button>
        ))}
      </div>
      <div className="relative mt-7">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={tab} initial={{ opacity: 0, x: tab === 'student' ? -16 : 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: tab === 'student' ? 16 : -16 }} transition={{ duration: 0.28, ease }}>
            {tab === 'student' ? <StudentFlow domain={domain} /> : <StaffFlow />}
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.div>
  )
}

/* ------------------------------------------------------------ shared pieces */

const fieldCls = 'h-14 w-full rounded-2xl border bg-slate-950/55 pr-4 pl-12 text-[15px] text-white placeholder:text-slate-500 outline-none transition-[border-color,box-shadow] duration-200'
const fieldState = (error: boolean, ok: boolean) => error
  ? 'border-rose-500/80 shadow-[0_0_0_4px_rgb(244_63_94/0.15)]'
  : ok ? 'border-emerald-400/70 shadow-[0_0_0_4px_rgb(16_185_129/0.12)]' : 'border-white/12 hover:border-white/25 focus:border-indigo-400 focus:shadow-[0_0_0_4px_rgb(99_102_241/0.22)]'

function PrimaryButton({ children, busy, disabled, ...props }: { children: ReactNode; busy?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <motion.button whileHover={disabled || busy ? undefined : { scale: 1.015, y: -1 }} whileTap={disabled || busy ? undefined : { scale: 0.97 }} transition={{ type: 'spring', stiffness: 500, damping: 22 }}
      disabled={disabled || busy} {...(props as object)}
      className="group relative flex h-14 w-full items-center justify-center gap-2 overflow-hidden rounded-2xl bg-gradient-to-r from-[#4F46E5] to-[#2563eb] text-[15px] font-semibold text-white shadow-[0_12px_32px_-8px_rgb(79_70_229/0.8),inset_0_1px_0_rgb(255_255_255/0.25)] transition-opacity disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none">
      <span aria-hidden className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-enabled:group-hover:translate-x-full" />
      {busy ? <Loader2 size={20} className="animate-spin" /> : children}
    </motion.button>
  )
}

function ErrorText({ children }: { children: ReactNode }) {
  return <motion.p role="alert" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-2.5 flex gap-2 text-[13px] leading-snug text-rose-300">{children}</motion.p>
}

function OtpInput({ value, onChange, disabled, error, autoFocus }: { value: string; onChange: (v: string) => void; disabled?: boolean; error?: boolean; autoFocus?: boolean }) {
  const refs = useRef<(HTMLInputElement | null)[]>([])
  useEffect(() => { if (autoFocus) refs.current[0]?.focus() }, [autoFocus])
  useEffect(() => { if (!value && !disabled) refs.current[0]?.focus() }, [value, disabled])
  const put = (index: number, raw: string) => {
    const digits = raw.replace(/\D/g, '')
    if (!digits) return
    const next = (value.slice(0, index) + digits).slice(0, OTP_LENGTH)
    onChange(next)
    refs.current[Math.min(next.length, OTP_LENGTH - 1)]?.focus()
  }
  const onKey = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') { e.preventDefault(); const at = value[i] ? i : Math.max(0, i - 1); onChange(value.slice(0, at)); refs.current[at]?.focus() }
    if (e.key === 'ArrowLeft') refs.current[Math.max(0, i - 1)]?.focus()
    if (e.key === 'ArrowRight') refs.current[Math.min(OTP_LENGTH - 1, i + 1)]?.focus()
  }
  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => { e.preventDefault(); onChange(''); const digits = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_LENGTH); if (digits) { onChange(digits); refs.current[Math.min(digits.length, OTP_LENGTH - 1)]?.focus() } }
  return (
    <div className="flex justify-between gap-2 sm:gap-2.5" role="group" aria-label="Código de verificación de 6 dígitos">
      {Array.from({ length: OTP_LENGTH }, (_, i) => {
        const filled = !!value[i]; const active = value.length === i
        return (
          <motion.input key={i} ref={el => { refs.current[i] = el }} value={value[i] ?? ''} disabled={disabled}
            inputMode="numeric" autoComplete={i === 0 ? 'one-time-code' : 'off'} maxLength={OTP_LENGTH} aria-label={`Dígito ${i + 1}`}
            onChange={e => put(i, e.target.value)} onKeyDown={e => onKey(i, e)} onPaste={onPaste} onFocus={e => e.target.select()}
            animate={filled ? { scale: [1, 1.08, 1] } : { scale: 1 }} transition={{ duration: 0.18 }}
            className={cn('h-14 w-full min-w-0 rounded-2xl border bg-slate-950/55 text-center font-mono text-2xl font-semibold text-white caret-indigo-400 outline-none transition-[border-color,box-shadow] sm:h-16',
              error ? 'border-rose-500/80' : filled ? 'border-indigo-400/70 shadow-[0_0_16px_-4px_rgb(99_102_241/0.8)]' : active ? 'border-white/30' : 'border-white/12',
              'focus:border-indigo-300 focus:shadow-[0_0_0_4px_rgb(99_102_241/0.25)] disabled:opacity-60')} />
        )
      })}
    </div>
  )
}

function ResendRow({ left, busy, onResend }: { left: number; busy: boolean; onResend: () => void }) {
  return (
    <div className="mt-5 text-center text-sm">
      {left > 0
        ? <p className="text-slate-400">Reenviar código en <span className="font-mono text-slate-200 tabular-nums">{mmss(left)}</span></p>
        : <button type="button" disabled={busy} onClick={onResend} className="inline-flex items-center gap-1.5 font-medium text-indigo-300 transition hover:text-white disabled:opacity-50"><RotateCw size={14} className={busy ? 'animate-spin' : ''} /> Reenviar código</button>}
      {left > 0 && <div className="mx-auto mt-2.5 h-1 w-40 overflow-hidden rounded-full bg-white/10"><motion.div className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-sky-400" initial={false} animate={{ width: `${(left / 60) * 100}%` }} transition={{ ease: 'linear', duration: 1 }} /></div>}
    </div>
  )
}

/* ----------------------------------------------------------- student flow */

function StudentFlow({ domain }: { domain: string }) {
  const { actions } = useLibrary()
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState('')
  const [touched, setTouched] = useState(false)
  const [serverError, setServerError] = useState('')
  const [busy, setBusy] = useState(false)
  const [code, setCode] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [verified, setVerified] = useState(false)
  const [left, setLeft] = useCountdown()
  const [emailScope, shakeEmail] = useShake()
  const [codeScope, shakeCode] = useShake()
  const inputId = useId()

  const value = email.trim().toLowerCase()
  const [local, typedDomain] = value.includes('@') ? [value.slice(0, value.indexOf('@')), value.slice(value.indexOf('@') + 1)] : [value, null]
  const localOk = /^[a-z0-9][a-z0-9._%+-]*$/.test(local)
  const valid = localOk && typedDomain === domain
  const wrongDomain = typedDomain !== null && typedDomain !== '' && !domain.startsWith(typedDomain)
  const suggestion = localOk && !valid && !wrongDomain ? `${local}@${domain}` : null
  const showError = wrongDomain || (touched && !!value && !valid && !suggestion)
  const domainMessage = `Acceso restringido. Por favor, ingresa tu correo institucional oficial (@${domain}).`

  const lastWrong = useRef(false)
  useEffect(() => { if (wrongDomain && !lastWrong.current) shakeEmail(); lastWrong.current = wrongDomain }, [wrongDomain]) // eslint-disable-line react-hooks/exhaustive-deps

  const send = async (event?: FormEvent) => {
    event?.preventDefault()
    setTouched(true); setServerError('')
    if (!valid) { shakeEmail(); return }
    setBusy(true)
    const result = await actions.requestCode('student', value)
    setBusy(false)
    if (!result.ok) { setServerError(result.error); shakeEmail(); return }
    setCode(''); setLeft(result.data.resendInSeconds); setStep('code')
  }
  const resend = async () => {
    setBusy(true); setServerError('')
    const result = await actions.requestCode('student', value)
    setBusy(false)
    if (!result.ok) { setServerError(result.error); return }
    setCode(''); setLeft(result.data.resendInSeconds); toast.success('Te enviamos un código nuevo.')
  }
  useEffect(() => {
    if (step !== 'code' || code.length !== OTP_LENGTH || verifying) return
    let cancelled = false
    setVerifying(true); setServerError('')
    actions.verifyOtp(value, code).then(result => {
      if (cancelled) return
      if (result.ok) { setVerified(true); toast.success(`¡Bienvenido, ${result.data.name}!`); return }
      setVerifying(false); setServerError(result.error); shakeCode(); setCode('')
    })
    return () => { cancelled = true }
  }, [code, step]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AnimatePresence mode="wait" initial={false}>
      {step === 'email' ? (
        <motion.form key="email" onSubmit={send} noValidate initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.3, ease }}>
          <h2 className="text-2xl font-semibold tracking-tight text-white">Ingresa a tu biblioteca</h2>
          <p className="mt-1.5 text-sm text-slate-400">Sin contraseñas: te enviaremos un código de acceso a tu correo de estudiante.</p>
          <label htmlFor={inputId} className="mt-6 mb-2 block text-[13px] font-medium text-slate-300">Correo institucional</label>
          <div ref={emailScope} className="relative">
            <Mail size={19} className={cn('pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 transition-colors', showError ? 'text-rose-400' : valid ? 'text-emerald-400' : 'text-slate-400')} />
            <input id={inputId} type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} autoFocus
              placeholder={`ejemplo@${domain}`} value={email} onChange={e => { setEmail(e.target.value); setServerError('') }} onBlur={() => setTouched(true)}
              aria-invalid={showError} aria-describedby={`${inputId}-hint`} className={cn(fieldCls, fieldState(showError, valid))} />
            <AnimatePresence>{valid && <motion.span initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0, opacity: 0 }} className="absolute top-1/2 right-4 -translate-y-1/2 text-emerald-400"><CheckCircle2 size={20} /></motion.span>}</AnimatePresence>
          </div>
          <div id={`${inputId}-hint`} className="min-h-[2.25rem]">
            <AnimatePresence mode="wait">
              {showError ? <ErrorText key="err">{domainMessage}</ErrorText>
                : serverError ? <ErrorText key="srv">{serverError}</ErrorText>
                : suggestion ? (
                  <motion.button key="sug" type="button" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    onClick={() => { setEmail(suggestion); document.getElementById(inputId)?.focus() }}
                    className="mt-2.5 inline-flex max-w-full items-center gap-1.5 rounded-full border border-indigo-400/30 bg-indigo-500/15 px-3 py-1.5 text-[13px] text-indigo-100 transition hover:border-indigo-300/60 hover:bg-indigo-500/25 active:scale-95">
                    <Sparkles size={13} className="shrink-0 text-indigo-300" /><span className="truncate">Completar: <b className="font-semibold">{local}</b>@{domain}</span>
                  </motion.button>
                ) : <motion.p key="tip" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-2.5 text-[13px] text-slate-500">Recibirás un código de 6 dígitos válido por 10 minutos.</motion.p>}
            </AnimatePresence>
          </div>
          <div className="mt-4"><PrimaryButton type="submit" busy={busy} disabled={!valid}>Continuar con correo institucional <ArrowRight size={18} className="transition-transform group-hover:translate-x-0.5" /></PrimaryButton></div>
        </motion.form>
      ) : (
        <motion.div key="code" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 24 }} transition={{ duration: 0.3, ease }}>
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-indigo-400/30 bg-indigo-500/15 text-indigo-200 shadow-[0_0_30px_-6px_rgb(99_102_241/0.8)]">
            {verified ? <CheckCircle2 className="text-emerald-400" /> : <MailCheck />}
          </div>
          <h2 className="mt-4 text-center text-2xl font-semibold tracking-tight text-white">Revisa tu bandeja de entrada</h2>
          <p className="mt-1.5 text-center text-sm text-slate-400">Hemos enviado un código de 6 dígitos a <span className="font-medium text-slate-200">{maskEmail(value)}</span></p>
          <p className="mt-1 text-center"><button type="button" disabled={verifying} onClick={() => { setStep('email'); setServerError(''); setCode('') }} className="inline-flex items-center gap-1 text-[13px] font-medium text-indigo-300 transition hover:text-white"><ArrowLeft size={13} /> Cambiar de correo</button></p>
          <div ref={codeScope} className="mt-6"><OtpInput value={code} onChange={v => { setCode(v); setServerError('') }} disabled={verifying} error={!!serverError} autoFocus /></div>
          <div className="min-h-[2.25rem]">
            <AnimatePresence mode="wait">
              {verifying ? (
                <motion.p key="ver" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-3 flex items-center justify-center gap-2 text-sm font-medium text-emerald-300">
                  {verified ? <><CheckCircle2 size={17} /> ¡Verificado! Abriendo el catálogo…</> : <><Loader2 size={17} className="animate-spin" /> Verificando código…</>}
                </motion.p>
              ) : serverError ? <div key="err" className="flex justify-center"><ErrorText>{serverError}</ErrorText></div> : null}
            </AnimatePresence>
          </div>
          <ResendRow left={left} busy={busy} onResend={resend} />
          <p className="mt-5 text-center text-xs text-slate-500">¿No lo ves? Revisa la carpeta de spam o “Promociones”.</p>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/* -------------------------------------------------------------- staff flow */

function StaffFlow() {
  const { actions } = useLibrary()
  const [mode, setMode] = useState<'login' | 'request' | 'set'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [code, setCode] = useState('')
  const [visible, setVisible] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [left, setLeft] = useCountdown()
  const [scope, shake] = useShake()
  const emailId = useId(); const passId = useId(); const confirmId = useId()
  const address = email.trim().toLowerCase()
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(address)

  const run = async (task: () => Promise<{ ok: boolean; error?: string }>) => {
    setBusy(true); setError('')
    const result = await task()
    setBusy(false)
    if (!result.ok) { setError(result.error ?? 'No se pudo completar la operación.'); shake() }
    return result.ok
  }
  const login = (e: FormEvent) => { e.preventDefault(); void run(async () => { const r = await actions.login(address, password); if (r.ok) toast.success(`Bienvenido, ${r.data.name}`); return r }) }
  const request = async (e?: FormEvent) => {
    e?.preventDefault()
    let wait = 60
    const ok = await run(async () => { const r = await actions.requestCode('staff', address); if (r.ok) wait = r.data.resendInSeconds; return r })
    if (ok) { setLeft(wait); setCode(''); setMode('set') }
  }
  const save = (e: FormEvent) => {
    e.preventDefault()
    if (password.length < 10) { setError('La contraseña debe tener al menos 10 caracteres.'); shake(); return }
    if (password !== confirm) { setError('Las contraseñas no coinciden.'); shake(); return }
    void run(async () => { const r = await actions.setStaffPassword(address, code, password); if (r.ok) toast.success('Contraseña creada. ¡Bienvenido!'); return r })
  }
  const go = (next: typeof mode) => { setMode(next); setError(''); setPassword(''); setConfirm('') }

  const emailField = (
    <>
      <label htmlFor={emailId} className="mb-2 block text-[13px] font-medium text-slate-300">Correo personal autorizado</label>
      <div className="relative">
        <Mail size={19} className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-slate-400" />
        <input id={emailId} type="email" autoComplete="username" autoCapitalize="none" spellCheck={false} required placeholder="tu.correo@gmail.com"
          value={email} onChange={e => { setEmail(e.target.value); setError('') }} className={cn(fieldCls, fieldState(false, false))} />
      </div>
    </>
  )
  const passwordField = (id: string, label: string, value: string, set: (v: string) => void, autoComplete: string) => (
    <>
      <label htmlFor={id} className="mt-4 mb-2 block text-[13px] font-medium text-slate-300">{label}</label>
      <div className="relative">
        <LockKeyhole size={19} className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-slate-400" />
        <input id={id} type={visible ? 'text' : 'password'} autoComplete={autoComplete} required maxLength={128} value={value}
          onChange={e => { set(e.target.value); setError('') }} className={cn(fieldCls, 'pr-12', fieldState(false, false))} />
        <button type="button" onClick={() => setVisible(!visible)} aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'} className="absolute top-1/2 right-3 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-xl text-slate-400 transition hover:bg-white/10 hover:text-white">{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button>
      </div>
    </>
  )

  return (
    <div ref={scope}>
      <AnimatePresence mode="wait" initial={false}>
        {mode === 'login' && (
          <motion.form key="login" onSubmit={login} initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.3, ease }}>
            <h2 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-white"><UserCog size={22} className="text-indigo-300" /> Acceso del personal</h2>
            <p className="mt-1.5 mb-6 text-sm text-slate-400">Para bibliotecarios y administradores con acceso otorgado por la administración.</p>
            {emailField}
            {passwordField(passId, 'Contraseña', password, setPassword, 'current-password')}
            <div className="min-h-[2.25rem]"><AnimatePresence>{error && <ErrorText>{error}</ErrorText>}</AnimatePresence></div>
            <div className="mt-2"><PrimaryButton type="submit" busy={busy} disabled={!emailOk || !password}>Ingresar <ArrowRight size={18} /></PrimaryButton></div>
            <p className="mt-5 text-center"><button type="button" onClick={() => go('request')} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-indigo-300 transition hover:text-white"><KeyRound size={14} /> ¿Primera vez u olvidaste tu contraseña?</button></p>
          </motion.form>
        )}
        {mode === 'request' && (
          <motion.form key="request" onSubmit={request} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.3, ease }}>
            <h2 className="text-2xl font-semibold tracking-tight text-white">Crea tu contraseña</h2>
            <p className="mt-1.5 mb-6 text-sm text-slate-400">Escribe el correo con el que la administración te dio acceso. Te enviaremos un código para crear (o restablecer) tu contraseña.</p>
            {emailField}
            <div className="min-h-[2.25rem]"><AnimatePresence>{error && <ErrorText>{error}</ErrorText>}</AnimatePresence></div>
            <div className="mt-2"><PrimaryButton type="submit" busy={busy} disabled={!emailOk}>Enviar código <ArrowRight size={18} /></PrimaryButton></div>
            <p className="mt-5 text-center"><button type="button" onClick={() => go('login')} className="inline-flex items-center gap-1 text-[13px] font-medium text-slate-400 transition hover:text-white"><ArrowLeft size={13} /> Volver a iniciar sesión</button></p>
          </motion.form>
        )}
        {mode === 'set' && (
          <motion.form key="set" onSubmit={save} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 24 }} transition={{ duration: 0.3, ease }}>
            <h2 className="text-2xl font-semibold tracking-tight text-white">Revisa tu bandeja de entrada</h2>
            <p className="mt-1.5 text-sm text-slate-400">Si <span className="font-medium text-slate-200">{maskEmail(address)}</span> tiene acceso de personal, te enviamos un código de 6 dígitos.</p>
            <p className="mt-1 mb-5"><button type="button" onClick={() => go('request')} className="inline-flex items-center gap-1 text-[13px] font-medium text-indigo-300 transition hover:text-white"><ArrowLeft size={13} /> Cambiar de correo</button></p>
            <OtpInput value={code} onChange={v => { setCode(v); setError('') }} disabled={busy} autoFocus />
            {passwordField(passId, 'Nueva contraseña (mín. 10 caracteres)', password, setPassword, 'new-password')}
            {passwordField(confirmId, 'Repite la contraseña', confirm, setConfirm, 'new-password')}
            <div className="min-h-[2.25rem]"><AnimatePresence>{error && <ErrorText>{error}</ErrorText>}</AnimatePresence></div>
            <div className="mt-2"><PrimaryButton type="submit" busy={busy} disabled={code.length !== OTP_LENGTH || !password || !confirm}>Guardar e ingresar <ArrowRight size={18} /></PrimaryButton></div>
            <ResendRow left={left} busy={busy} onResend={() => void request()} />
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  )
}

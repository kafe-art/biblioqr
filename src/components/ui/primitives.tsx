import clsx, { type ClassValue } from 'clsx'
import { motion } from 'motion/react'
import { useId, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { hash, initials } from '../../lib/format'

export const cn = (...inputs: ClassValue[]) => clsx(inputs)

// ───────────── Button ─────────────
const BUTTON_VARIANT = {
  primary: 'bg-primary text-white hover:bg-primary-hover shadow-sm shadow-primary/25',
  secondary: 'bg-surface border border-line-strong text-fg hover:bg-surface-2',
  ghost: 'text-muted hover:text-fg hover:bg-surface-2',
  danger: 'bg-bad/10 text-bad hover:bg-bad/20',
} as const
const BUTTON_SIZE = { sm: 'h-8 px-3 text-[13px] rounded-lg', md: 'h-10 px-4 text-sm rounded-xl', lg: 'h-12 px-5 text-[15px] rounded-xl', icon: 'h-9 w-9 rounded-lg' } as const

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof BUTTON_VARIANT
  size?: keyof typeof BUTTON_SIZE
}

export function Button({ variant = 'primary', size = 'md', className, type = 'button', ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex shrink-0 items-center justify-center gap-2 font-medium whitespace-nowrap transition-[background-color,color,scale,box-shadow] duration-150 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45',
        BUTTON_VARIANT[variant], BUTTON_SIZE[size], className,
      )}
      {...props}
    />
  )
}

// ───────────── Badge ─────────────
const BADGE_TONE = {
  neutral: 'bg-surface-2 text-muted',
  primary: 'bg-accent/10 text-accent',
  ok: 'bg-ok/10 text-ok',
  warn: 'bg-warn/12 text-warn',
  bad: 'bg-bad/10 text-bad',
} as const
export type Tone = keyof typeof BADGE_TONE

export function Badge({ tone = 'neutral', dot, className, children }: { tone?: Tone; dot?: boolean; className?: string; children: ReactNode }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap', BADGE_TONE[tone], className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  )
}

// ───────────── Card ─────────────
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-2xl border border-line bg-surface shadow-card', className)} {...props} />
}

export function SectionTitle({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {hint && <p className="mt-0.5 text-sm text-muted">{hint}</p>}
      </div>
      {action}
    </div>
  )
}

// ───────────── Formularios ─────────────
export const inputCls =
  'h-10 w-full rounded-xl border border-line-strong bg-surface px-3 text-sm text-fg placeholder:text-muted/70 transition-[border-color,box-shadow] duration-150 focus:border-accent focus:outline-none focus:ring-3 focus:ring-accent/20'

export function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: (id: string) => ReactNode }) {
  const id = useId()
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-medium">
        {label}
      </label>
      {children(id)}
      {error ? (
        <p role="alert" className="mt-1.5 text-xs text-bad">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  )
}

/** Control segmentado con indicador animado (layout animation). */
export function Segmented<T extends string>({ value, onChange, options, label, className }: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string; icon?: LucideIcon }[]
  label: string
  className?: string
}) {
  const id = useId()
  return (
    <div role="radiogroup" aria-label={label} className={cn('inline-flex rounded-xl border border-line bg-surface-2 p-1', className)}>
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn('relative flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium whitespace-nowrap transition-colors', active ? 'text-fg' : 'text-muted hover:text-fg')}
          >
            {active && <motion.span layoutId={id} className="absolute inset-0 rounded-lg border border-line bg-surface shadow-sm" transition={{ type: 'spring', duration: 0.35, bounce: 0.15 }} />}
            <span className="relative flex items-center gap-1.5">
              {o.icon && <o.icon size={14} aria-hidden />}
              {o.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}

// ───────────── Feedback de carga y vacío ─────────────
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} aria-hidden />
}

export function EmptyState({ icon: Icon, title, description, action }: { icon: LucideIcon; title: string; description: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl border border-line bg-surface-2 text-muted">
        <Icon size={22} aria-hidden />
      </div>
      <p className="font-medium">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  const hue = hash(name) % 360
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, fontSize: size * 0.38, background: `linear-gradient(135deg, hsl(${hue} 60% 48%), hsl(${(hue + 50) % 360} 65% 36%))` }}
    >
      {initials(name)}
    </span>
  )
}

/** Barra de progreso semántica. */
export function Progress({ value, tone = 'primary', label }: { value: number; tone?: 'primary' | 'ok' | 'warn' | 'bad'; label: string }) {
  const color = { primary: 'bg-primary', ok: 'bg-ok', warn: 'bg-warn', bad: 'bg-bad' }[tone]
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100)
  return (
    <div role="progressbar" aria-label={label} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
      <div className={cn('h-full rounded-full transition-[width] duration-500 ease-out-quint', color)} style={{ width: `${pct}%` }} />
    </div>
  )
}

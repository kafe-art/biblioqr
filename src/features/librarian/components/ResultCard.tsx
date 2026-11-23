import { motion, useReducedMotion } from 'motion/react'
import { useEffect, useState, type ReactNode } from 'react'
import { ScanLine, X } from 'lucide-react'
import { Button, Card, cn } from '../../../components/ui/primitives'
import { StatusPill, type Status } from './StatusPill'

interface Props {
  tone: 'ok' | 'warn' | 'bad' | 'neutral'; title: string
  book?: { title: string; copyId: string | null }; user?: { name: string; code: string }
  meta?: { label: string; value: string; status?: Status }[]
  actions?: ReactNode; variant?: 'full' | 'compact'; onDismiss?: () => void
}
export function ResultCard({ tone, title, book, user, meta, actions, variant = 'full', onDismiss }: Props) {
  const reduced = useReducedMotion()
  const [fresh, setFresh] = useState(true)
  useEffect(() => { const timer = setTimeout(() => setFresh(false), 1000); return () => clearTimeout(timer) }, [])
  const compact = variant === 'compact'
  return <motion.div initial={reduced ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
    <Card className={cn('space-y-2', compact ? 'p-4' : 'p-6', fresh && !compact && book && 'shadow-pop')}>
      <div className="flex items-center justify-between gap-2">{compact ? <strong className="font-mono text-[13px]">{title}</strong> : tone === 'neutral' ? <p className="flex items-center gap-2 text-muted"><ScanLine aria-hidden />{title}</p> : <StatusPill size="md" status={{ ok: 'ready', warn: 'soon', bad: 'late' }[tone] as Status}>{title}</StatusPill>}
      {onDismiss && <Button size="icon" variant="ghost" aria-label="Cerrar resultado" onClick={onDismiss}><X size={16} aria-hidden /></Button>}</div>
      {book && <div><h3 className="text-[15px] font-semibold">{book.title}</h3><span className="font-mono text-[13px] text-muted">{book.copyId}</span></div>}
      {user && <p className="text-sm">{user.name} <span className="font-mono text-[13px] text-muted">{user.code}</span></p>}
      {meta?.map(m => <div key={m.label} className="tabular text-xs text-muted">{m.status ? <StatusPill status={m.status}>{m.label} {m.value}</StatusPill> : <>{m.label} {m.value}</>}</div>)}
      {actions && <div className="flex flex-wrap gap-2 pt-2 max-md:[&>button]:w-full">{actions}</div>}
    </Card>
  </motion.div>
}

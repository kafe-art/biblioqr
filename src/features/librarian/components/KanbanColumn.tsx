import { Children, useId, useState, type ReactNode } from 'react'
import { ChevronDown, type LucideIcon } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { cn, Skeleton } from '../../../components/ui/primitives'
import { StatusPill } from './StatusPill'

interface Props { title: string; count: number; tone: 'warn' | 'ok' | 'neutral'; icon: LucideIcon; emptyText: string; collapsible?: boolean; defaultOpen?: boolean; loading?: boolean; children: ReactNode; open?: boolean; onOpenChange?: (open: boolean) => void }
export function KanbanColumn({ title, count, tone, icon: Icon, emptyText, collapsible, defaultOpen = false, loading, children, open, onOpenChange }: Props) {
  const id = useId()
  const reduced = useReducedMotion()
  const [expanded, setExpanded] = useState(defaultOpen)
  const visible = !collapsible || (open ?? expanded)
  const heading = <><Icon size={18} aria-hidden />{title}<StatusPill status={tone === 'ok' ? 'ready' : tone === 'warn' ? 'soon' : 'done'}><span className="tabular">{count}</span></StatusPill></>
  return <section aria-labelledby={id} aria-busy={loading} className="min-w-0 space-y-2">
    <h2 id={id} className="sticky top-16 z-10 flex min-h-12 items-center gap-2 rounded-xl bg-surface-2 px-4 font-semibold">{collapsible ? <button className="flex min-h-12 w-full items-center gap-2" aria-expanded={visible} onClick={() => (onOpenChange ?? setExpanded)(!visible)}>{heading}<ChevronDown size={16} aria-hidden className={cn('ml-auto', visible && 'rotate-180')} /></button> : heading}</h2>
    {visible && (loading ? Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-32" />) : count ? <ul className="space-y-2">{Children.map(children, child => <motion.li layout={!reduced} transition={{ type: 'spring', duration: 0.35, bounce: 0.15 }}>{child}</motion.li>)}</ul> : <p className="p-4 text-sm text-muted">{emptyText}</p>)}
  </section>
}

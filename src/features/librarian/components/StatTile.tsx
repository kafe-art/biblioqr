import type { LucideIcon } from 'lucide-react'
import { cn, Skeleton, type Tone } from '../../../components/ui/primitives'

const tones = { primary: 'border-l-accent text-accent', ok: 'border-l-ok text-ok', warn: 'border-l-warn text-warn', bad: 'border-l-bad text-bad', neutral: 'border-l-line-strong text-muted' }
interface Props { label: string; value: number; tone: Tone; icon: LucideIcon; hint?: string; onClick?: () => void; loading?: boolean }
export function StatTile({ label, value, tone, icon: Icon, hint, onClick, loading }: Props) {
  if (loading) return <Skeleton className="h-28 rounded-2xl" />
  const Tag = onClick ? 'button' : 'div'
  return <Tag onClick={onClick} aria-label={value + ' · ' + label} className={cn('min-w-40 snap-start rounded-2xl border border-l-4 border-line bg-surface p-4 text-left shadow-card', tones[value ? tone : 'neutral'])}>
    <span className="block text-xs font-medium tracking-wider text-muted uppercase">{label}</span>
    <span className="mt-2 flex items-center justify-between gap-4"><strong className="tabular text-3xl font-semibold tracking-tight text-fg">{value}</strong><Icon size={22} aria-hidden /></span>
    {hint && <span className="text-xs text-muted">{hint}</span>}
  </Tag>
}

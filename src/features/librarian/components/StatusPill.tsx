import { AlertTriangle, Ban, CheckCircle2, Circle, Clock, Info } from 'lucide-react'
import type { ReactNode } from 'react'
import { Badge, cn } from '../../../components/ui/primitives'

const styles = {
  ready: ['ok', CheckCircle2], soon: ['warn', Clock], late: ['bad', AlertTriangle],
  blocked: ['bad', Ban], info: ['primary', Info], done: ['neutral', Circle],
} as const
export type Status = keyof typeof styles

export function StatusPill({ status, children, size = 'sm' }: { status: Status; children: ReactNode; size?: 'sm' | 'md' }) {
  const [tone, Icon] = styles[status]
  return <Badge tone={tone} className={cn('max-w-full whitespace-normal!', size === 'md' ? 'min-h-7 text-[13px]' : 'min-h-6', status === 'soon' && 'text-[color:color-mix(in_srgb,var(--warn)_84%,var(--fg))]!')}><Icon size={14} className="shrink-0" aria-hidden /><span className="min-w-0 wrap-anywhere">{children}</span></Badge>
}

import { useState } from 'react'
import { Archive, CheckCircle2, Clock, Tickets } from 'lucide-react'
import { EmptyState, Field, Segmented, cn, inputCls } from '../../components/ui/primitives'
import { useLibrary } from '../../store/library'
import { useDesk, type ReservationGroup } from './desk'
import { ReservationCard } from './components/ReservationCard'
import { KanbanColumn } from './components/KanbanColumn'
import { RefreshBanner } from './components/RefreshBanner'

const columns = [
  { value: 'pending', label: 'Por preparar', icon: Clock, tone: 'warn', empty: 'Nada por preparar.' },
  { value: 'ready', label: 'Listas para recoger', icon: CheckCircle2, tone: 'ok', empty: 'No hay reservas esperando retiro.' },
  { value: 'closed', label: 'Cerradas', icon: Archive, tone: 'neutral', empty: 'No hay reservas cerradas.' },
] as const
export function ReservationsView() {
  const { reservations, users, loading } = useLibrary()
  const { request } = useDesk()
  const [filter, setFilter] = useState<ReservationGroup | undefined>(request.group)
  const [mobile, setMobile] = useState<ReservationGroup>(request.group ?? 'pending')
  const [closed, setClosed] = useState(false)
  const [query, setQuery] = useState('')
  const term = query.trim().toLocaleLowerCase()
  const matches = reservations.filter(r => {
    const user = users.find(u => u.id === r.userId)
    return [r.code, user?.name, user?.code].some(s => s?.toLocaleLowerCase().includes(term))
  })
  const groups = {
    pending: matches.filter(r => r.status === 'pending').sort((a,b) => a.pickupAt - b.pickupAt),
    ready: matches.filter(r => r.status === 'ready').sort((a,b) => a.expiresAt - b.expiresAt),
    closed: matches.filter(r => r.status !== 'pending' && r.status !== 'ready'),
  }
  return <div className="space-y-8" aria-busy={loading}>
    <header className="flex flex-wrap items-end justify-between gap-4"><h1 className="text-2xl font-semibold tracking-tight">Reservas</h1>
      <div className="flex flex-wrap items-end gap-4"><Field label="Buscar ticket o usuario">{id => <input id={id} type="search" value={query} onChange={e => setQuery(e.target.value)} className={inputCls} />}</Field>
      <label className="hidden min-h-10 items-center gap-2 md:flex"><input type="checkbox" checked={closed} onChange={e => { setClosed(e.target.checked); setFilter(undefined) }} />Mostrar cerradas</label></div></header>
    <RefreshBanner />
    {filter && <button className="min-h-10 text-sm text-accent" onClick={() => setFilter(undefined)}>Ver todas las columnas</button>}
    <Segmented className="md:hidden!" value={mobile} label="Columna de reservas" onChange={value => { setMobile(value); setFilter(undefined); if (value === 'closed') setClosed(true) }}
      options={columns.map(c => ({ value: c.value, label: (c.value === 'ready' ? 'Listas' : c.label) + ' (' + groups[c.value].length + ')' }))} />
    {!matches.length && !loading && <EmptyState icon={Tickets} title={term ? 'Sin coincidencias.' : 'No hay reservas activas.'} description={term ? 'Busca por código de ticket o nombre del usuario.' : 'Aquí aparecerán los tickets de los estudiantes.'} />}
    <div className="grid items-start gap-6 md:grid-cols-2 lg:grid-cols-3">{columns.map(c => <div key={c.value}
      className={cn(c.value !== mobile && 'max-md:hidden', filter && filter !== c.value && 'md:hidden', c.value === 'closed' && 'md:col-span-2 lg:col-span-1')}>
      <KanbanColumn title={c.label} count={groups[c.value].length} tone={c.tone} icon={c.icon} emptyText={c.empty} loading={loading} collapsible={c.value === 'closed'} open={closed} onOpenChange={setClosed}>
        {groups[c.value].map(r => <ReservationCard key={r.id} reservation={r} />)}
      </KanbanColumn>
    </div>)}</div>
  </div>
}

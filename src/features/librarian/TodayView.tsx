import { AlertTriangle, CheckCircle2, Clock, ScanLine, Timer } from 'lucide-react'
import { toast } from 'sonner'
import { Button, Card, EmptyState, SectionTitle, Skeleton } from '../../components/ui/primitives'
import { daysLate, daysLeft, money, POLICY } from '../../lib/rules'
import { useLibrary, useNow } from '../../store/library'
import { modes, Shortcut, useDesk } from './desk'
import { StatTile } from './components/StatTile'
import { StatusPill } from './components/StatusPill'
import { ReservationCard } from './components/ReservationCard'
import { RefreshBanner } from './components/RefreshBanner'

export function TodayView() {
  const { reservations, loans, users, books, fines, loading, actions } = useLibrary()
  const now = useNow(60000)
  const { go } = useDesk()
  const pending = reservations.filter(r => r.status === 'pending').sort((a,b) => a.pickupAt - b.pickupAt)
  const active = loans.filter(l => !l.returnedAt)
  const soon = active.filter(l => l.copyId && l.dueAt >= now && daysLeft(l.dueAt, now) <= POLICY.warnDays)
  const late = active.filter(l => daysLate(l.dueAt, now) > 0)
  const debt = fines.filter(f => f.status === 'pending')
  const blocked = users.filter(u => u.status === 'blocked' && active.some(l => l.userId === u.id))
  const userName = (id: string) => users.find(u => u.id === id)?.name ?? id
  const jump = (id: string) => { const node = document.getElementById(id); node?.focus({ preventScroll: true }); node?.scrollIntoView({ block: 'center' }) }
  const scan = () => go('circulacion', { mode: 'loan' })
  return <div className="space-y-8 max-md:pb-16" aria-busy={loading}>
    <header className="flex flex-wrap items-center justify-between gap-4"><div><h1 className="text-2xl font-semibold tracking-tight">Hoy</h1><p className="text-sm text-muted">{new Intl.DateTimeFormat('es-PE', { weekday: 'long', day: 'numeric', month: 'long' }).format(now)}</p></div>
      <Button size="lg" onClick={scan}><ScanLine aria-hidden size={18} />Escanear <Shortcut>F1</Shortcut></Button></header>
    <RefreshBanner />
    <div className="no-scrollbar max-md:[&>*]:min-w-40 flex snap-x gap-4 overflow-x-auto p-1 md:grid md:grid-cols-2 lg:grid-cols-4">
      <StatTile label="Por preparar" value={pending.length} icon={Clock} tone="warn" loading={loading} onClick={() => go('reservas', { group: 'pending' })} />
      <StatTile label="Listas" value={reservations.filter(r => r.status === 'ready').length} icon={CheckCircle2} tone="ok" loading={loading} onClick={() => go('reservas', { group: 'ready' })} />
      <StatTile label="Vencen pronto" value={soon.length} icon={Timer} tone="warn" loading={loading} onClick={() => jump('vencen')} />
      <StatTile label="Atrasados" value={late.length} icon={AlertTriangle} tone="bad" loading={loading} onClick={() => jump('atrasados')} />
    </div>
    <div className="grid items-start gap-6 lg:grid-cols-12">
      <section className="space-y-2 lg:col-span-8"><SectionTitle title="Cola de preparación" />
        {loading ? Array.from({ length: 5 }, (_,i) => <Skeleton key={i} className="h-14" />) : pending.length ? pending.map(r => <ReservationCard key={r.id} reservation={r} queue />) :
          <EmptyState icon={CheckCircle2} title={late.length || debt.length || blocked.length ? 'Nada por preparar.' : 'Todo al día.'} description={late.length ? 'No hay reservas por preparar.' : 'No hay reservas por preparar ni préstamos atrasados.'} action={<Button variant="secondary" onClick={scan}>Escanear <Shortcut>F1</Shortcut></Button>} />}
      </section>
      <Card className="order-first space-y-4 p-4 lg:order-none lg:col-span-4"><SectionTitle title="Atención" />
        {[{ id: 'atrasados', list: late, title: 'Atrasados' }, { id: 'vencen', list: soon, title: 'Vencen pronto' }].map(({ id,list,title }) => <section id={id} tabIndex={-1} key={id} className="space-y-2">
          <h3 className="text-sm font-semibold">{title} · {list.length}</h3>
          {list.map(l => <div key={l.id} className="text-sm"><p>{userName(l.userId)} · {books.find(b => b.id === l.bookId)?.title}</p>
            <StatusPill status={id === 'atrasados' ? 'late' : 'soon'}>{id === 'atrasados' ? daysLate(l.dueAt, now) + ' días de atraso' : 'Vence en ' + daysLeft(l.dueAt, now) + ' días'}</StatusPill></div>)}</section>)}
        {blocked.map(u => <p key={u.id} className="text-sm">{u.name} <StatusPill status="blocked">Bloqueado</StatusPill></p>)}
        {debt.map(f => <div key={f.id} className="space-y-1 text-sm"><p>{userName(f.userId)} · <StatusPill status="late">Multa pendiente {money(f.amount)}</StatusPill></p><Button variant="secondary" onClick={async () => { const r = await actions.payFine(f.id); r.ok ? toast.success('Pago registrado') : toast.error(r.error) }}>Cobrar multa</Button></div>)}
      </Card>
    </div>
    <nav aria-label="Acciones rápidas" className="flex gap-2 max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:z-20 max-md:border-t max-md:border-line max-md:bg-surface max-md:p-2">
      {modes.map(m => <Button key={m.value} variant="secondary" className="min-h-12 max-md:min-w-0 max-md:flex-1 max-md:px-2" onClick={() => go('circulacion', { mode: m.value })}>{m.short}<Shortcut>{m.key}</Shortcut></Button>)}
    </nav>
  </div>
}

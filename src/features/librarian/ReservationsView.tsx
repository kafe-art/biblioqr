import { toast } from 'sonner'
import { Badge, Button, Card, SectionTitle } from '../../components/ui/primitives'
import { fmtDateTime } from '../../lib/format'
import type { Result, ReservationStatus } from '../../lib/types'
import { useLibrary } from '../../store/library'
import { RESERVATION_STATUS } from '../student/Ticket'

export function ReservationsView() {
  const { reservations, books, users, actions } = useLibrary()
  const notify = async (pending: Promise<Result>, text: string) => { const r = await pending; return  r.ok ? toast.success(text) : toast.error(r.error) }
  const columns: ReservationStatus[] = ['pending', 'ready', 'collected', 'expired', 'cancelled']
  return <div><SectionTitle title="Tablero de reservas" hint="Prepara los ejemplares y controla el retiro de cada ticket." /><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">{columns.map((status) => <section key={status} className="space-y-3"><h3 className="font-semibold">{RESERVATION_STATUS[status].label} ({reservations.filter((r) => r.status === status).length})</h3>{reservations.filter((r) => r.status === status).map((r) => <Card key={r.id} className="space-y-3 p-4"><Badge tone={RESERVATION_STATUS[status].tone}>{r.code}</Badge><p className="font-medium">{books.find((b) => b.id === r.bookId)?.title ?? r.bookId}</p><p className="text-sm text-muted">{users.find((u) => u.id === r.userId)?.name ?? r.userId}</p><p className="text-xs">{r.copyId} · Caduca {fmtDateTime(r.expiresAt)}</p><div className="flex flex-wrap gap-2">{status === 'pending' && <Button size="sm" onClick={() => notify(actions.markReservationReady(r.id), 'Reserva lista para recoger')}>Marcar lista</Button>}{(status === 'pending' || status === 'ready') && <><Button size="sm" variant="secondary" onClick={() => actions.focusBook(r.bookId, 'mapa')}>Ubicar</Button><Button size="sm" variant="danger" onClick={() => notify(actions.cancelReservation(r.id), 'Reserva cancelada')}>Cancelar</Button></>}</div></Card>)}{!reservations.some((r) => r.status === status) && <p className="text-sm text-muted">Sin reservas.</p>}</section>)}</div></div>
}

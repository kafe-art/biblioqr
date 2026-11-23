import { toast } from 'sonner'
import { Button, Card, SectionTitle } from '../../components/ui/primitives'
import { fmtDateTime } from '../../lib/format'
import { daysLate, money } from '../../lib/rules'
import type { Result } from '../../lib/types'
import { useLibrary, useNow } from '../../store/library'
import { BookCard } from './BookCard'
import { Ticket } from './Ticket'

export function LockerView() {
  const { user, books, loans, reservations, fines, incidencias, avisos, wishlist, actions } = useLibrary()
  const now = useNow()
  if (!user) return null
  const notify = async (pending: Promise<Result<unknown>>, text: string) => { const r = await pending; return  r.ok ? toast.success(text) : toast.error(r.error) }
  const active = loans.filter((l) => l.userId === user.id && !l.returnedAt)
  const mine = reservations.filter((r) => r.userId === user.id)
  const saved = books.filter((b) => (wishlist[user.id] ?? []).includes(b.id))
  const debts = fines.filter((f) => f.userId === user.id)
  return <div className="space-y-8">
    <section><SectionTitle title="Mis préstamos" hint={`${active.length} préstamos activos`} /><div className="grid gap-4 md:grid-cols-2">{active.map((l) => <Card key={l.id} className="space-y-3 p-5"><h3 className="font-semibold">{books.find((b) => b.id === l.bookId)?.title ?? l.bookId}</h3><p className="text-sm">{l.copyId ?? 'E-book'} · Vence {fmtDateTime(l.dueAt)}</p>{daysLate(l.dueAt, now) > 0 && <p className="text-sm text-bad">{daysLate(l.dueAt, now)} días de retraso. Acércate al mostrador.</p>}<div className="flex flex-wrap gap-2"><Button onClick={() => notify(actions.renewLoan(l.id), 'Préstamo renovado')}>Renovar</Button>{l.copyId === null && <Button variant="secondary" onClick={() => notify(actions.returnDigital(l.id), 'E-book devuelto')}>Devolver e-book</Button>}</div></Card>)}</div>{!active.length && <p className="text-muted">No tienes préstamos activos.</p>}</section>
    <section><SectionTitle title="Mis reservas" /><div className="grid gap-4 lg:grid-cols-2">{mine.map((r) => { const book = books.find((b) => b.id === r.bookId); return <div key={r.id} className="space-y-2">{book ? <Ticket reservation={r} book={book} /> : <p>{r.code}</p>}{(r.status === 'pending' || r.status === 'ready') && <Button variant="danger" onClick={() => notify(actions.cancelReservation(r.id), 'Reserva cancelada')}>Cancelar reserva</Button>}</div> })}</div>{!mine.length && <p className="text-muted">Todavía no tienes reservas.</p>}</section>
    <section><SectionTitle title="Multas" hint={`Pendiente: ${money(debts.filter((f) => f.status === 'pending').reduce((sum, f) => sum + f.amount, 0))}`} />{debts.map((f) => <Card key={f.id} className="mb-2 p-4">{books.find((b) => b.id === f.bookId)?.title ?? f.bookId} · {f.days} días · {money(f.amount)} · {f.status === 'pending' ? 'Pendiente de pago en mostrador' : f.status === 'paid' ? 'Pagada' : 'Condonada'}</Card>)}{!debts.length && <p className="text-muted">No tienes multas registradas.</p>}</section>
    <section><SectionTitle title="Avisos" />{avisos.length ? avisos.map(a => <Card key={a.id} className="mb-2 p-4"><strong>{a.asunto}</strong><p>{a.mensaje}</p>{a.estado !== 'leida' && <Button size="sm" onClick={() => notify(actions.readNotice(a.id), 'Aviso leído')}>Marcar como leído</Button>}</Card>) : <p>Sin avisos.</p>}</section>
    <section><SectionTitle title="Incidencias" />{incidencias.length ? incidencias.map(i => <Card key={i.id} className="mb-2 p-4">{i.tipo} · {i.descripcion} · {i.estado}</Card>) : <p>Sin incidencias registradas.</p>}</section>
    <section><SectionTitle title="Por leer" /><div className="grid grid-cols-2 gap-6 md:grid-cols-4">{saved.map((b) => <BookCard key={b.id} book={b} />)}</div>{!saved.length && <p className="text-muted">Guarda libros desde el catálogo para encontrarlos aquí.</p>}</section>
  </div>
}

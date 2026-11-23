import { useEffect, useMemo, useState } from 'react'
import { Library } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog } from '../../components/ui/overlays'
import { Button, Card, EmptyState, Field, Segmented, Skeleton, inputCls } from '../../components/ui/primitives'
import { PAVILIONS, SHELVES_PER_PAVILION, SHELF_ROWS, SHELF_COLS } from '../../data/seed'
import type { Book, Pavilion, ShelfLocation } from '../../lib/types'
import { availableCopies, hasPhysical, isLendable } from '../../lib/rules'
import { useLibrary } from '../../store/library'
import { bottomSheet, useDesk, useMobile } from './desk'
import { ShelfGrid, type ShelfCell } from './components/ShelfGrid'
import { StatusPill } from './components/StatusPill'
import { RefreshBanner } from './components/RefreshBanner'

function Availability({ book }: { book: Book }) {
  const count = availableCopies(book).length
  if (count) return <StatusPill status="ready">{count} disponibles</StatusPill>
  if (!book.copies.length) return <StatusPill status="done">Sin ejemplares</StatusPill>
  if (book.copies.every(c => !isLendable(c))) return <StatusPill status="blocked">{book.copies.every(c => c.condition === 'baja') ? 'De baja' : 'En mantenimiento'}</StatusPill>
  return <StatusPill status="soon">{book.copies.filter(isLendable).every(c => c.status === 'loaned') ? 'Todos prestados' : 'Sin ejemplares disponibles'}</StatusPill>
}
export function LibraryMapView() {
  const { books, focusBookId, reservations, actions, loading } = useLibrary()
  const { request } = useDesk()
  const mobile = useMobile()
  const focus = books.find(b => b.id === focusBookId && hasPhysical(b))
  const [room, setRoom] = useState<Pavilion>(focus?.location.pavilion ?? 'A')
  const [selected, setSelected] = useState<ShelfLocation | undefined>(focus?.location)
  const [query, setQuery] = useState('')
  const [sheet, setSheet] = useState(false)
  const [detail, setDetail] = useState<Book | null>(null)
  const [busy, setBusy] = useState(false)
  const location = focus?.location
  useEffect(() => {
    if (!location) return
    setRoom(location.pavilion)
    setSelected(location)
    const frame = requestAnimationFrame(() => document.getElementById('shelf-' + location.pavilion + location.shelf)?.scrollIntoView({ block: 'nearest', inline: 'center' }))
    return () => cancelAnimationFrame(frame)
  }, [focusBookId, location?.pavilion, location?.shelf, location?.row, location?.col])
  const shelves = useMemo(() => {
    const result = new Map<number, ShelfCell[]>()
    for (const b of books) {
      const { pavilion, shelf, row, col } = b.location
      if (!hasPhysical(b) || pavilion !== room) continue
      const cells = result.get(shelf) ?? []
      const cell = cells.find(c => c.row === row && c.col === col)
      if (cell) cell.titles.push(b)
      else cells.push({ row, col, titles: [b] })
      result.set(shelf,cells)
    }
    return result
  }, [books,room])
  const related = reservations.find(r => r.id === request.reservationId && r.status === 'pending' && (r.bookId === focus?.id || r.details?.some(d => d.bookId === focus?.id)))
  const titles = selected && shelves.get(selected.shelf)?.find(c => c.row === selected.row && c.col === selected.col)?.titles
  const list = titles?.map(b => <div key={b.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line py-2"><button className="min-h-10 text-left font-medium text-accent" onClick={() => { setSheet(false); setDetail(b) }}>{b.title}</button><Availability book={b} /></div>)
  const listTitle = 'Títulos en la celda ' + selected?.row + '.' + selected?.col
  return <div className="space-y-8" aria-busy={loading}>
    <h1 className="text-2xl font-semibold tracking-tight">Ubicación</h1><RefreshBanner />
    {focus && <Card className="space-y-2 p-4"><h2 className="font-semibold">{focus.title}</h2><p className="text-sm text-muted">Sala {focus.location.pavilion} · Estante {focus.location.shelf} · Fila {focus.location.row} · Columna {focus.location.col}</p>
      <div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => setDetail(focus)}>Ver ficha</Button>{related && <Button size="lg" disabled={busy} onClick={async () => { setBusy(true); const r = await actions.markReservationReady(related.id); setBusy(false); r.ok ? toast.success('Reserva lista para recoger') : toast.error(r.error) }}>Marcar lista</Button>}</div></Card>}
    <div className="flex flex-wrap items-end justify-between gap-4">
      <Segmented value={room} options={(Object.keys(PAVILIONS) as Pavilion[]).map(p => ({ value: p, label: 'Sala ' + p }))} label="Sala" onChange={p => { setRoom(p); setSelected(undefined); actions.focusBook(null) }} />
      <Field label="Buscar título">{id => <input id={id} type="search" className={inputCls} value={query} onChange={e => setQuery(e.target.value)} />}</Field>
    </div>
    {query.trim() && <Card className="p-4"><ul>{books.filter(b => hasPhysical(b) && b.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).map(b => <li key={b.id}><Button variant="ghost" className="h-auto min-h-10 max-w-full text-left whitespace-normal!" onClick={() => { actions.focusBook(b.id); setRoom(b.location.pavilion); setSelected(b.location); setQuery('') }}>{b.title} · Sala {b.location.pavilion}</Button></li>)}</ul>
      {!books.some(b => hasPhysical(b) && b.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())) && <p>Sin títulos coincidentes.</p>}</Card>}
    {!loading && !shelves.size ? <EmptyState icon={Library} title="Esta sala no tiene ejemplares físicos registrados." description="Selecciona otra sala o busca un título." /> :
      <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto md:grid md:grid-cols-2 xl:grid-cols-3">{Array.from({ length: SHELVES_PER_PAVILION }, (_,i) => <div className="w-full min-w-0 shrink-0 snap-center" key={room + i}>{loading ? <Skeleton className="h-48" /> : <ShelfGrid pavilion={room} shelf={i+1} rows={SHELF_ROWS} cols={SHELF_COLS} cells={shelves.get(i+1) ?? []} focusBookId={focusBookId}
        selected={selected?.shelf === i+1 ? selected : undefined} onSelect={c => { setSelected({ pavilion: room, shelf: i+1, row: c.row, col: c.col }); setSheet(true) }} />}</div>)}</div>}
    {titles && !mobile && <Card className="p-4"><h2 className="font-semibold">{listTitle}</h2>{list}</Card>}
    <Dialog open={!!titles && mobile && sheet} onOpenChange={setSheet} title={listTitle} className={bottomSheet}>{list}</Dialog>
    <Dialog open={!!detail} onOpenChange={open => { if (!open) setDetail(null) }} title={detail?.title ?? 'Ficha del libro'}>
      {detail && <div className="space-y-2 text-sm"><p>{detail.author} · {detail.year}</p><p>ISBN {detail.isbn}</p><p>{detail.synopsis}</p><Availability book={detail} /></div>}
    </Dialog>
  </div>
}

import { MAX_RESERVATION_BOOKS } from '../../../shared/reservations'
import { motion } from 'motion/react'
import { Archive, CalendarClock, CheckCircle2, MapPin, Store, Tablet, TriangleAlert } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { BookCover } from '../../components/BookCover'
import { Sheet } from '../../components/ui/overlays'
import { Badge, Button, cn } from '../../components/ui/primitives'
import { PAVILIONS } from '../../data/seed'
import { feedback } from '../../lib/feedback'
import { fmtWeekday } from '../../lib/format'
import { DAY, POLICY, availableCopies, eligibility, hasDigital } from '../../lib/rules'
import type { PickupMethod } from '../../lib/types'
import { useLibrary } from '../../store/library'
import { AvailabilityChip, WishlistButton } from './BookCard'
import { Ticket } from './Ticket'

const SLOT_HOURS = [9, 11, 13, 15, 17, 19]

const METHODS: { id: PickupMethod; label: string; hint: string; icon: typeof Store }[] = [
  { id: 'desk', label: 'Mostrador principal', hint: 'Presenta tu QR al bibliotecario', icon: Store },
  { id: 'locker', label: 'Casillero inteligente', hint: 'Ábrelo con tu QR, 24/7', icon: Archive },
]

/** ───────────── Flujo de reserva en 2 clics ─────────────
 *  Clic 1: «Reservar ejemplar» en la tarjeta abre esta hoja con fecha, hora y
 *          punto de retiro ya preseleccionados (primer horario disponible).
 *  Clic 2: «Confirmar reserva» → `actions.reserve` aparta un ejemplar concreto
 *          y la hoja muestra el ticket QR con cuenta regresiva. */
export function BookSheet() {
  const { focusBookId, books, reservations, loans, fines, user, actions } = useLibrary()
  const book = books.find((b) => b.id === focusBookId)
  // Se conserva el último libro para que el contenido no desaparezca durante la animación de cierre.
  const [shown, setShown] = useState(book)
  useEffect(() => {
    if (book) setShown(book)
  }, [book])
  const current = book ?? shown

  const slots = useMemo(() => {
    const out: { day: number; label: string; hours: number[] }[] = []
    const now = new Date()
    for (let d = 0; d < 3; d++) {
      const hours = SLOT_HOURS.filter((h) => d > 0 || h > now.getHours())
      if (hours.length) out.push({ day: d, label: d === 0 ? 'Hoy' : d === 1 ? 'Mañana' : fmtWeekday(Date.now() + d * DAY), hours })
    }
    return out
    // Se recalcula al abrir una ficha distinta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusBookId])

  const [day, setDay] = useState(0)
  const [hour, setHour] = useState(9)
  const [method, setMethod] = useState<PickupMethod>('desk')
  const [extra, setExtra] = useState<string[]>([])
  const [ticketId, setTicketId] = useState<string | null>(null)

  useEffect(() => {
    if (!focusBookId) return
    setDay(slots[0].day)
    setHour(slots[0].hours[0])
    setExtra([])
    setMethod('desk')
    setTicketId(null)
  }, [focusBookId, slots])

  if (!current || !user) return null

  const activeReservation = reservations.find((r) => r.userId === user.id && (r.bookId === current.id || r.details?.some(d => d.bookId === current.id)) && (r.status === 'pending' || r.status === 'ready'))
  const ticket = reservations.find((r) => r.id === ticketId) ?? activeReservation
  const available = availableCopies(current).length
  const check = eligibility(user, loans, fines, true)
  const digitalLoan = loans.find((l) => l.userId === user.id && l.bookId === current.id && l.copyId === null && !l.returnedAt)
  const daySlots = slots.find((s) => s.day === day) ?? slots[0]

  const confirm = async () => {
    const at = new Date()
    at.setDate(at.getDate() + day)
    at.setHours(hour, 0, 0, 0)
    const res = await actions.reserve([current.id, ...extra], at.getTime(), method)
    if (!res.ok) {
      feedback.error()
      toast.error('No se pudo reservar', { description: res.error })
      return
    }
    feedback.success()
    setTicketId(res.data.id)
    toast.success('Reserva confirmada', { description: `Tu ticket ${res.data.code} ya está en Mi casillero.` })
  }

  const borrowDigital = async () => {
    const res = await actions.borrowDigital(current.id)
    if (!res.ok) return void toast.error('No se pudo prestar el e-book', { description: res.error })
    feedback.success()
    toast.success('E-book en tu casillero', { description: `Acceso por ${POLICY.loanDays} días.` })
  }

  const loc = current.location

  return (
    <Sheet open={!!book} onOpenChange={(o) => !o && actions.focusBook(null)} title={ticket ? 'Tu reserva' : 'Ficha del libro'} description={current.title}>
      <div className="flex gap-4">
        <div className="relative w-28 shrink-0">
          <BookCover book={current} />
          <WishlistButton bookId={current.id} className="absolute top-1.5 right-1.5" />
        </div>
        <div className="min-w-0">
          <h3 className="leading-snug font-semibold">{current.title}</h3>
          <p className="mt-0.5 text-sm text-muted">{current.author}{current.editorial && ' · '+current.editorial}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge>{current.genre}</Badge>
            <Badge>{current.year}</Badge>
            <Badge>{current.pages} págs.</Badge>
          </div>
          <div className="mt-2.5"><AvailabilityChip book={current} /></div>
        </div>
      </div>

      <p className="mt-5 text-sm leading-relaxed text-muted">{current.synopsis}</p>

      {current.copies.length > 0 && (
        <p className="mt-4 flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2.5 text-[13px]">
          <MapPin size={15} className="shrink-0 text-accent" aria-hidden />
          {PAVILIONS[loc.pavilion].name} · {PAVILIONS[loc.pavilion].area} · Estante {loc.shelf}, fila {loc.row}, columna {loc.col}
        </p>
      )}

      <div className="mt-6 border-t border-line pt-6">
        {ticket ? (
          <motion.div initial={{ opacity: 0, scale: 0.96, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ type: 'spring', duration: 0.5, bounce: 0.25 }}>
            {ticketId && (
              <p className="mb-4 flex items-center gap-2 text-sm font-medium text-ok">
                <CheckCircle2 size={18} aria-hidden /> Ejemplar apartado a tu nombre
              </p>
            )}
            <Ticket reservation={ticket} book={current} />
            <div className="mt-4 flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => actions.navigate('casillero')}>Ver en Mi casillero</Button>
              <Button
                variant="danger"
                onClick={async () => {
                  const res = await actions.cancelReservation(ticket.id)
                  setTicketId(null)
                  if (res.ok) toast('Reserva cancelada', { description: 'El ejemplar volvió a estar disponible.' })
                  else toast.error(res.error)
                }}
              >
                Cancelar
              </Button>
            </div>
          </motion.div>
        ) : available === 0 ? (
          <p className="flex items-start gap-2 rounded-xl bg-bad/10 px-3 py-3 text-sm text-bad">
            <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden />
            No quedan ejemplares físicos disponibles. Guárdalo en «Por leer» y revisa más tarde.
          </p>
        ) : !check.ok ? (
          <p className="flex items-start gap-2 rounded-xl bg-bad/10 px-3 py-3 text-sm text-bad">
            <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden />
            No puedes reservar por ahora: {check.reasons.join(' · ')}.
          </p>
        ) : (
          <div className="space-y-5">
            <fieldset>
              <legend className="mb-2 text-sm font-medium">Libros en esta reserva ({extra.length + 1}/{MAX_RESERVATION_BOOKS})</legend>
              {extra.map(id => <p key={id}>{books.find(b => b.id === id)?.title} <button type="button" onClick={() => setExtra(extra.filter(v => v !== id))}>Quitar</button></p>)}
              {extra.length + 1 < MAX_RESERVATION_BOOKS && <select aria-label="Añadir otro libro" value="" onChange={e => setExtra([...extra, e.target.value])}>
                <option value="" disabled>Añadir otro libro</option>
                {books.filter(b => b.id !== current.id && !extra.includes(b.id) && availableCopies(b).length > 0).map(b => <option key={b.id} value={b.id}>{b.title}</option>)}
              </select>}
            </fieldset>
            <fieldset>
              <legend className="mb-2 flex items-center gap-2 text-[13px] font-medium"><CalendarClock size={15} aria-hidden /> ¿Cuándo lo recoges?</legend>
              <div className="flex gap-2">
                {slots.map((s) => (
                  <Chip
                    key={s.day}
                    active={s.day === day}
                    onClick={() => {
                      setDay(s.day)
                      if (!s.hours.includes(hour)) setHour(s.hours[0])
                    }}
                    className="flex-1 capitalize"
                  >
                    {s.label}
                  </Chip>
                ))}
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {daySlots.hours.map((h) => (
                  <Chip key={h} active={h === hour} onClick={() => setHour(h)} className="tabular">
                    {String(h).padStart(2, '0')}:00
                  </Chip>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend className="mb-2 text-[13px] font-medium">¿Dónde lo retiras?</legend>
              <div className="grid gap-2">
                {METHODS.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    role="radio"
                    aria-checked={method === m.id}
                    onClick={() => setMethod(m.id)}
                    className={cn('flex items-center gap-3 rounded-xl border p-3 text-left transition-colors', method === m.id ? 'border-accent bg-accent/8 ring-3 ring-accent/15' : 'border-line-strong hover:bg-surface-2')}
                  >
                    <span className={cn('grid h-9 w-9 place-items-center rounded-lg', method === m.id ? 'bg-primary text-white' : 'bg-surface-2 text-muted')}><m.icon size={17} aria-hidden /></span>
                    <span>
                      <span className="block text-sm font-medium">{m.label}</span>
                      <span className="block text-xs text-muted">{m.hint}</span>
                    </span>
                  </button>
                ))}
              </div>
            </fieldset>

            <Button size="lg" className="w-full" onClick={confirm}>Confirmar reserva</Button>
            <p className="text-center text-xs text-muted">Guardamos tu ejemplar {POLICY.holdHours} h desde la hora elegida. Préstamo por {POLICY.loanDays} días.</p>
          </div>
        )}

        {hasDigital(current) && (
          <div className="mt-5 flex items-center justify-between gap-3 rounded-xl border border-line p-3">
            <span className="flex items-center gap-2.5 text-sm">
              <Tablet size={17} className="text-accent" aria-hidden />
              {digitalLoan ? 'E-book activo en tu casillero' : 'También disponible como e-book'}
            </span>
            {!digitalLoan && <Button size="sm" variant="secondary" onClick={borrowDigital}>Prestar e-book</Button>}
          </div>
        )}
      </div>
    </Sheet>
  )
}

function Chip({ active, className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { active: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn('h-9 rounded-lg border px-3 text-[13px] font-medium transition-colors', active ? 'border-accent bg-accent/10 text-accent' : 'border-line-strong text-muted hover:text-fg', className)}
      {...props}
    />
  )
}

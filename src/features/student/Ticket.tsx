import { QRCodeSVG } from 'qrcode.react'
import { Archive, Clock, Store } from 'lucide-react'
import { Badge, Progress, type Tone } from '../../components/ui/primitives'
import { fmtCountdown, fmtDateTime } from '../../lib/format'
import { HOUR, POLICY } from '../../lib/rules'
import type { Book, Reservation } from '../../lib/types'
import { useLibrary, useNow } from '../../store/library'

export const RESERVATION_STATUS: Record<Reservation['status'], { label: string; tone: Tone }> = {
  pending: { label: 'Buscando en estantería', tone: 'warn' },
  ready: { label: 'Listo para recoger', tone: 'ok' },
  collected: { label: 'Entregado', tone: 'neutral' },
  expired: { label: 'Expirado', tone: 'bad' },
  cancelled: { label: 'Cancelado', tone: 'neutral' },
}

/** Ticket digital de reserva: el QR codifica el token firmado por el servidor, que el
 *  bibliotecario escanea en mostrador para entregar el ejemplar. */
export function Ticket({ reservation, book }: { reservation: Reservation; book: Book }) {
  const { books } = useLibrary()
  const now = useNow()
  const active = reservation.status === 'pending' || reservation.status === 'ready'
  const remaining = reservation.expiresAt - now
  const window = reservation.expiresAt - Math.min(reservation.createdAt, reservation.pickupAt)
  const urgent = remaining < 3 * HOUR
  const status = RESERVATION_STATUS[reservation.status]

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface-2/60">
      <div className="flex items-start justify-between gap-3 p-5">
        <div className="min-w-0">
          <p className="text-xs font-medium tracking-wider text-muted uppercase">Ticket de reserva</p>
          <p className="mt-1 truncate font-semibold">{reservation.details?.map(d => books.find(b => b.id === d.bookId)?.title).join(' · ') || book.title}</p>
          <p className="truncate text-sm text-muted">{book.author}</p>
        </div>
        <Badge tone={status.tone} dot>{status.label}</Badge>
      </div>

      <div className="relative border-t border-dashed border-line-strong">
        <span className="absolute -top-2.5 -left-2.5 h-5 w-5 rounded-full border border-line bg-surface" aria-hidden />
        <span className="absolute -top-2.5 -right-2.5 h-5 w-5 rounded-full border border-line bg-surface" aria-hidden />
      </div>

      <div className="flex flex-col items-center gap-4 p-5 sm:flex-row sm:items-center">
        <div className={active ? 'rounded-xl bg-white p-2.5' : 'rounded-xl bg-white p-2.5 opacity-30 grayscale'}>
          {reservation.qrToken && <QRCodeSVG value={reservation.qrToken ?? ''} size={116} level="M" title={`Código QR de la reserva ${reservation.code}`} />}
        </div>
        <dl className="w-full space-y-2.5 text-sm">
          <div>
            <dt className="text-xs text-muted">Código</dt>
            <dd className="tabular font-mono text-base font-semibold tracking-wider">{reservation.code}</dd>
          </div>
          <div className="flex items-center gap-2">
            {reservation.method === 'locker' ? <Archive size={15} className="text-muted" aria-hidden /> : <Store size={15} className="text-muted" aria-hidden />}
            <dt className="sr-only">Punto de retiro</dt>
            <dd>{reservation.method === 'locker' ? `Casillero inteligente ${reservation.locker}` : 'Mostrador principal'}</dd>
          </div>
          <div className="flex items-center gap-2">
            <Clock size={15} className="text-muted" aria-hidden />
            <dt className="sr-only">Recojo desde</dt>
            <dd>Desde {fmtDateTime(reservation.pickupAt)} · {reservation.details?.map(d => d.copyId ?? 'Digital').join(', ') ?? reservation.copyId}</dd>
          </div>
        </dl>
      </div>

      {active && (
        <div className="border-t border-line px-5 py-4">
          <div className="mb-2 flex items-baseline justify-between text-sm">
            <span className="text-muted">{remaining > POLICY.holdHours * HOUR ? 'Se guarda hasta' : `Tienes ${POLICY.holdHours} h para recogerlo`}</span>
            <span className={urgent ? 'tabular font-mono font-semibold text-bad' : 'tabular font-mono font-semibold'} aria-live="off">
              {fmtCountdown(remaining)}
            </span>
          </div>
          <Progress value={remaining / window} tone={urgent ? 'bad' : 'primary'} label="Tiempo restante de la reserva" />
        </div>
      )}
    </div>
  )
}

import { useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { toast } from 'sonner'
import { Button } from '../../../components/ui/primitives'
import { Dialog } from '../../../components/ui/overlays'
import { fmtDateTime } from '../../../lib/format'
import { HOUR } from '../../../lib/rules'
import type { Reservation } from '../../../lib/types'
import { useLibrary } from '../../../store/library'
import { RESERVATION_STATUS } from '../../student/Ticket'
import { useDesk } from '../desk'
import { ResultCard } from './ResultCard'
import type { Status } from './StatusPill'

const status: Record<Reservation['status'], Status> = { pending: 'soon', ready: 'ready', collected: 'done', expired: 'late', cancelled: 'done' }
export function ReservationCard({ reservation: r, queue = false }: { reservation: Reservation; queue?: boolean }) {
  const { books, users, actions } = useLibrary()
  const { go } = useDesk()
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState(0)
  const reduced = useReducedMotion()
  const active = r.status === 'pending' || r.status === 'ready'
  const items = r.details?.length ? r.details : [r]
  const booksHere = items.map(item => books.find(b => b.id === item.bookId))
  const user = users.find(u => u.id === r.userId)
  const change = async (cancel: boolean) => {
    if (busy) return
    setBusy(true)
    const result = await (cancel ? actions.cancelReservation(r.id) : actions.markReservationReady(r.id))
    setBusy(false)
    setConfirm(false)
    if (result.ok) toast.success(cancel ? 'Reserva cancelada' : 'Reserva lista para recoger')
    else { toast.error(result.error); setFailure(f => f + 1) }
  }
  return <motion.div key={failure} layoutId={reduced ? undefined : r.id} animate={failure && !reduced ? { x: [0,-6,6,-4,4,0] } : { x: 0 }} transition={{ duration: 0.35 }}>
    <ResultCard variant="compact" tone="neutral" title={r.code} user={user}
      book={{ title: items.map((item,i) => booksHere[i]?.title ?? item.bookId).join(' · '), copyId: items.map(item => item.copyId ?? 'Digital').join(', ') }}
      meta={[{ label: r.status === 'pending' ? 'Por preparar' : RESERVATION_STATUS[r.status].label, value: '', status: status[r.status] },
        { label: 'Recoge', value: fmtDateTime(r.pickupAt) }, { label: 'Caduca', value: fmtDateTime(r.expiresAt), status: active && r.expiresAt - Date.now() < 2 * HOUR ? 'soon' : undefined },
        ...(r.locker ? [{ label: 'Locker', value: r.locker }] : [])]}
      actions={active && <>{r.status === 'pending' && <Button size="lg" variant={queue ? 'secondary' : 'primary'} disabled={busy} onClick={() => change(false)}>Marcar lista</Button>}
        {items.map((item,i) => booksHere[i]?.format !== 'digital' && <Button key={item.bookId} variant="secondary" onClick={() => go('mapa', { reservationId: r.id }, item.bookId)}>{items.length === 1 ? 'Ubicar ejemplar' : 'Ubicar ' + (i+1)}</Button>)}
        {!queue && <Button variant="ghost" disabled={busy} onClick={() => setConfirm(true)}>Cancelar reserva</Button>}</>} />
    <Dialog open={confirm} onOpenChange={setConfirm} title={'¿Cancelar la reserva ' + r.code + '?'} description="El estudiante recibirá un aviso.">
      <div className="flex gap-2"><Button variant="secondary" onClick={() => setConfirm(false)}>Conservar reserva</Button><Button variant="danger" disabled={busy} onClick={() => change(true)}>Cancelar reserva</Button></div>
    </Dialog>
  </motion.div>
}

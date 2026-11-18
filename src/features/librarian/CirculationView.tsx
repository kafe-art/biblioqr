import { useState } from 'react'
import { toast } from 'sonner'
import { QrScanner } from '../../components/QrScanner'
import { Dialog } from '../../components/ui/overlays'
import { Button, Card, Field, SectionTitle, Segmented, inputCls } from '../../components/ui/primitives'
import { feedback } from '../../lib/feedback'
import { fmtDateTime } from '../../lib/format'
import { money } from '../../lib/rules'
import type { Result } from '../../lib/types'
import { useLibrary, type Receipt } from '../../store/library'

export function CirculationView() {
  const { actions, users, fines } = useLibrary()
  const [tab, setTab] = useState<'loan' | 'reservation' | 'return'>('loan')
  const [card, setCard] = useState('')
  const [receipt, setReceipt] = useState<Receipt | null>(null)
  const process = async (pending: Promise<Result<Receipt>>) => {
    const result = await pending
    if (!result.ok) { toast.error(result.error); feedback.error(); return }
    setReceipt(result.data)
    toast.success(result.data.kind === 'loan' ? 'Préstamo registrado' : 'Devolución registrada')
    feedback.success()
  }
  const fine = receipt?.fine ? fines.find((f) => f.id === receipt.fine?.id) : null
  return <div className="space-y-6"><SectionTitle title="Circulación" hint="Préstamos, entrega de reservas y devoluciones en mostrador." />
    <Segmented value={tab} onChange={setTab} label="Operación de circulación" options={[{ value: 'loan', label: 'Préstamo' }, { value: 'reservation', label: 'Entrega de reserva' }, { value: 'return', label: 'Devolución' }]} />
    <Card className="max-w-2xl space-y-5 p-6">
      {tab === 'loan' && <Field label="Carnet o identificador del usuario">{(id) => <input id={id} className={inputCls} value={card} onChange={(e) => setCard(e.target.value)} />}</Field>}
      <QrScanner key={tab} label={tab === 'reservation' ? 'QR del ticket de reserva' : 'Código del ejemplar'} onScan={(code) => {
        if (tab === 'reservation') process(actions.deliverReservation(code))
        else if (tab === 'return') process(actions.checkin(code))
        else { const user = users.find((u) => u.id === card.trim() || u.code.toUpperCase() === card.trim().toUpperCase()); if (!user) { toast.error('Carnet de usuario no reconocido.'); return } process(actions.checkout(user.id, code)) }
      }} />
    </Card>
    <Dialog open={!!receipt} onOpenChange={(open) => { if (!open) setReceipt(null) }} title={receipt?.kind === 'return' ? 'Recibo de devolución' : 'Recibo de préstamo'} description="Verifica el ejemplar y la identidad del usuario en mostrador.">
      {receipt && <div className="space-y-3"><h3 className="font-semibold">{receipt.book.title}</h3><p>{receipt.user.name} · {receipt.user.code}</p><p>{receipt.loan.copyId} · {fmtDateTime(receipt.at)}</p><p>Vencimiento: {fmtDateTime(receipt.loan.dueAt)}</p>{fine ? <div className="space-y-3"><p>{fine.days} días de mora · {money(fine.amount)} · {fine.status === 'paid' ? 'Pagada' : 'Pendiente'}</p>{fine.status === 'pending' && <Button onClick={async () => { const r = await actions.payFine(fine.id); r.ok ? toast.success('Pago registrado') : toast.error(r.error) }}>Registrar cobro de multa</Button>}</div> : receipt.kind === 'return' && <p>Devuelto a tiempo. Sin multa.</p>}</div>}
    </Dialog>
  </div>
}

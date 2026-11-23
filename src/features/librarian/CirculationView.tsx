import { useEffect, useId, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Dialog } from '../../components/ui/overlays'
import { Button, Card, Field, cn, inputCls } from '../../components/ui/primitives'
import { feedback } from '../../lib/feedback'
import { fmtDateTime } from '../../lib/format'
import { daysLeft, eligibility, money, POLICY } from '../../lib/rules'
import { useLibrary, type Receipt } from '../../store/library'
import { bottomSheet, modes, Shortcut, useDesk, useMobile, type ScanMode } from './desk'
import { ResultCard } from './components/ResultCard'
import { ScanPanel, type ScanState } from './components/ScanPanel'
import { StatusPill } from './components/StatusPill'

const INCIDENT_TYPES = { dano: 'Daño', perdida: 'Pérdida', otro: 'Otro' } as const

export function CirculationView() {
  const { users, loans, fines, books, incidencias, actions } = useLibrary()
  const { request } = useDesk()
  const mobile = useMobile()
  const [mode, setMode] = useState<ScanMode>(request.mode ?? 'loan')
  const [card, setCard] = useState('')
  /** El foco pasa al ejemplar solo cuando el carnet se confirma con Enter: si saltara
   *  al coincidir el texto, el Enter de la pistola caería en el campo del ejemplar. */
  const [cardConfirmed, setCardConfirmed] = useState(false)
  const [state, setState] = useState<ScanState>('idle')
  const [message, setMessage] = useState('')
  const [receipt, setReceipt] = useState<Receipt | null>(null)
  const [print, setPrint] = useState(false)
  const [loanId, setLoanId] = useState('')
  const [tipo, setTipo] = useState('dano')
  const [descripcion, setDescripcion] = useState('')
  const cardInput = useRef<HTMLInputElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const locked = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const suggestions = useId()
  const user = users.find(u => [u.id,u.code].some(v => v.toUpperCase() === card.trim().toUpperCase()))
  const account = user && eligibility(user, loans, fines)
  const fine = fines.find(f => f.id === receipt?.fine?.id) ?? receipt?.fine
  const debt = fines.filter(f => f.status === 'pending')
  const focusScan = () => panel.current?.querySelector<HTMLInputElement>('form input')?.focus()
  function reset(next: ScanMode) {
    if (locked.current) return
    clearTimeout(timer.current)
    setMode(next); setCard(''); setCardConfirmed(false); setReceipt(null); setState('idle'); setMessage('')
    requestAnimationFrame(() => next === 'loan' ? cardInput.current?.focus() : focusScan())
  }
  useEffect(() => { reset(request.mode ?? 'loan') }, [request])
  useEffect(() => () => clearTimeout(timer.current), [])
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || document.querySelector('[role="dialog"]') || (e.target instanceof HTMLElement && e.target.closest('textarea, select'))) return
      e.preventDefault()
      reset(mode)
    }
    window.addEventListener('keydown',key)
    return () => window.removeEventListener('keydown',key)
  }, [mode])
  function reject(text: string) {
    setMessage(text); setState('rejected'); feedback.error()
  }
  function checkCard() {
    if (!user) { reject('Carnet no reconocido. Revisa el código o busca por nombre.'); cardInput.current?.focus(); cardInput.current?.select(); return }
    setCardConfirmed(true)
    focusScan()
  }
  async function scan(code: string) {
    if (locked.current) return
    if (mode === 'loan' && !user) { checkCard(); return }
    if (mode === 'loan') setCardConfirmed(true)
    locked.current = true
    clearTimeout(timer.current)
    setReceipt(null); setState('busy'); setMessage('')
    try {
      const r = mode === 'reservation' ? await actions.deliverReservation(code) : mode === 'return' ? await actions.checkin(code) : await actions.checkout(user!.id, code)
      if (!r.ok) { reject(r.error + ' · ' + code); return }
      const data = r.data
      const warning = !!data.fine || (data.kind === 'loan' && daysLeft(data.loan.dueAt) <= POLICY.warnDays)
      setReceipt(data); setState(warning ? 'warning' : 'accepted')
      setMessage(mode === 'reservation' ? 'Reserva entregada' : mode === 'loan' ? 'Préstamo registrado' : 'Devolución registrada')
      if (warning) feedback.warning()
      else feedback.success()
    } finally {
      locked.current = false
      if (mode === 'loan' && user) timer.current = setTimeout(() => { setCard(''); setCardConfirmed(false); cardInput.current?.focus() }, 60000)
    }
  }
  const dismiss = () => { setReceipt(null); setMessage(''); setState('idle'); requestAnimationFrame(() => mode === 'loan' && !user ? cardInput.current?.focus() : focusScan()) }
  const pay = async (id: string) => { const r = await actions.payFine(id); r.ok ? toast.success('Pago registrado') : toast.error(r.error) }
  const receipts = receipt?.receipts?.length ? receipt.receipts : receipt ? [receipt] : []
  const meta = receipt ? [
    { label: 'Registrado', value: fmtDateTime(receipt.at) },
    ...receipts.map(r => ({ label: receipts.length > 1 ? 'Vence · ' + r.loan.copyId : 'Vence', value: fmtDateTime(r.loan.dueAt) })),
    ...(fine ? [{ label: fine.days + ' días de mora', value: money(fine.amount) + (fine.status === 'pending' ? ' · Pendiente' : ' · Pagada') }] : receipt.kind === 'return' ? [{ label: 'Devuelto a tiempo.', value: 'Sin multa.' }] : []),
  ] : []
  const result = receipt && <ResultCard key={receipt.loan.id} tone={state === 'warning' ? 'warn' : 'ok'} title={message}
    user={receipt.user} book={{ title: receipts.map(r => r.book.title).join(' · '), copyId: receipts.map(r => r.loan.copyId).filter(Boolean).join(', ') }} meta={meta} onDismiss={dismiss}
    actions={<>{fine?.status === 'pending' && <Button variant="secondary" onClick={() => pay(fine.id)}>Cobrar multa</Button>}<Button variant="secondary" onClick={() => setPrint(true)}>Imprimir recibo</Button><Button variant="ghost" onClick={dismiss}>Nueva lectura</Button></>} />
  return <div className="space-y-8">
    <h1 className="text-2xl font-semibold tracking-tight">Circulación</h1>
    <div role="group" aria-label="Operación de circulación" className="inline-flex rounded-xl border border-line bg-surface-2 p-1">{modes.map(m => <button key={m.value} type="button"
      aria-pressed={mode === m.value} disabled={state === 'busy'} onClick={() => reset(m.value)} className={cn('flex min-h-10 items-center gap-2 rounded-lg px-3 text-[13px] font-medium', mode === m.value ? 'bg-surface text-fg shadow-card' : 'text-muted')}>
      {mobile ? m.short : m.label}<Shortcut>{m.key}</Shortcut></button>)}</div>
    <div className="grid items-start gap-6 lg:grid-cols-12"><div ref={panel} className="min-w-0 lg:col-span-7">
      <ScanPanel key={mode} mode={mode} state={state} message={message} onScan={scan} autoFocus={mode !== 'loan' || (cardConfirmed && !!user)} cameraDefault={mobile} userSlot={mode === 'loan' && <div className="space-y-2">
        <Field label="Carnet del usuario">{id => <input id={id} ref={cardInput} list={suggestions} autoComplete="off" className={inputCls} value={card} disabled={state === 'busy'}
          onChange={e => { clearTimeout(timer.current); setCard(e.target.value); setCardConfirmed(false); setState('idle'); setMessage(''); setReceipt(null) }}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); checkCard() } }} />}</Field>
        <datalist id={suggestions}>{users.map(u => <option key={u.id} value={u.code}>{u.name}</option>)}</datalist>
        {user && account && <div className="flex flex-wrap items-center gap-2 text-sm"><span>{user.name} · {user.faculty}</span><StatusPill status={account.ok ? 'ready' : 'blocked'}>{account.ok ? 'Activo · ' + account.activeCount + ' de ' + POLICY.maxLoans + ' préstamos' : account.reasons.join(' · ')}</StatusPill>
          <Button variant="ghost" disabled={state === 'busy'} onClick={() => reset('loan')}>Cambiar usuario</Button></div>}
      </div>} />
    </div><aside className="lg:col-span-5">{!receipt ? <ResultCard tone="neutral" title="Escanea un ejemplar para empezar." /> : !mobile && result}</aside></div>
    <Card className="p-4"><details><summary className="min-h-10 font-semibold">Multas pendientes ({debt.length})</summary>
      {debt.length ? debt.map(f => <div key={f.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-line py-2"><span>{users.find(u => u.id === f.userId)?.name} · <span className="tabular">{money(f.amount)}</span></span><Button variant="secondary" onClick={() => pay(f.id)}>Cobrar multa</Button></div>) : <p className="text-sm text-muted">No hay multas pendientes.</p>}
    </details></Card>
    <Card className="p-4"><details><summary className="min-h-10 font-semibold">Registrar incidencia</summary>
      <form className="grid max-w-xl gap-4" onSubmit={async e => { e.preventDefault(); const r = await actions.reportIncident(loanId,tipo,descripcion); if (r.ok) { setDescripcion(''); toast.success('Incidencia registrada') } else toast.error(r.error) }}>
        <Field label="Préstamo">{id => <select id={id} className={inputCls} value={loanId} required onChange={e => setLoanId(e.target.value)}><option value="">Selecciona un préstamo</option>{loans.map(l => <option key={l.id} value={l.id}>{books.find(b => b.id === l.bookId)?.title} · {l.copyId ?? 'Digital'} · {users.find(u => u.id === l.userId)?.name}</option>)}</select>}</Field>
        <Field label="Tipo de incidencia">{id => <select id={id} className={inputCls} value={tipo} onChange={e => setTipo(e.target.value)}>{Object.entries(INCIDENT_TYPES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>}</Field>
        <Field label="Descripción de la incidencia">{id => <textarea id={id} className={cn(inputCls,'min-h-24 py-2')} required maxLength={2000} value={descripcion} onChange={e => setDescripcion(e.target.value)} />}</Field>
        <Button type="submit" variant="secondary">Registrar incidencia</Button>
      </form>{incidencias.map(i => <p key={i.id} className="mt-2 text-sm">{INCIDENT_TYPES[i.tipo as keyof typeof INCIDENT_TYPES] ?? i.tipo} ·{i.descripcion} · {i.estado}</p>)}</details></Card>
    <Dialog open={mobile && !!receipt && !print} onOpenChange={open => { if (!open) dismiss() }} title="Resultado de la lectura" className={bottomSheet}>{result}</Dialog>
    <Dialog open={print} onOpenChange={open => { setPrint(open); if (!open && !mobile) requestAnimationFrame(focusScan) }} title="Imprimir recibo">
      {receipt && <><div className="print-area space-y-2"><h2 className="font-semibold">{message}</h2>{receipts.map(r => <p key={r.loan.id}>{r.book.title} · {r.loan.copyId}</p>)}<p>{receipt.user.name} · {receipt.user.code}</p>{meta.map(m => <p key={m.label}>{m.label} {m.value}</p>)}</div><Button className="mt-4 print:hidden" onClick={() => window.print()}>Imprimir</Button></>}
    </Dialog>
  </div>
}

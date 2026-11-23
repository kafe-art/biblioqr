import { useEffect, useRef, useState, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { QrScanner } from '../../../components/QrScanner'
import { cn } from '../../../components/ui/primitives'
import type { ScanMode } from '../desk'
import { StatusPill } from './StatusPill'

export type ScanState = 'idle' | 'busy' | 'accepted' | 'warning' | 'rejected'
interface Props { mode: ScanMode; state: ScanState; message?: string; onScan: (code: string) => void; userSlot?: ReactNode; autoFocus?: boolean }
const labels = { loan: 'Registrar préstamo', return: 'Registrar devolución', reservation: 'Entregar reserva' }
/** El QR del ticket lleva un token firmado («datos.firma»). El código RSV-… impreso
 *  en el ticket es solo de referencia y el servidor no lo acepta para entregar. */
const validateTicket = (code: string) => /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(code) ? null
  : /^RSV-/i.test(code) ? 'El código RSV es solo de referencia. Escanea el QR del ticket con la cámara o la pistola.'
  : 'Esto no es un QR de ticket de reserva. Escanea el QR que muestra el estudiante.'
export function ScanPanel({ mode, state, message, onScan, userSlot, autoFocus = true }: Props) {
  const input = useRef<HTMLInputElement>(null)
  const reduced = useReducedMotion()
  const busy = state === 'busy'
  useEffect(() => { if (autoFocus && !busy) input.current?.focus() }, [autoFocus, busy, mode, state])
  const [flash, setFlash] = useState(false)
  useEffect(() => {
    setFlash(true)
    const timer = setTimeout(() => setFlash(false), state === 'rejected' ? 1200 : 450)
    return () => clearTimeout(timer)
  }, [state])
  const rejected = state === 'rejected'
  const pulse = state === 'accepted' || state === 'warning'
  const color = state === 'warning' ? 'var(--warn)' : 'var(--ok)'
  return <motion.section aria-label="Escáner de circulación" aria-busy={busy}
    animate={rejected && !reduced ? { x: [0,-6,6,-4,4,0] } : pulse && !reduced ? { x: 0, boxShadow: ['0 0 0 0 ' + color, '0 0 0 12px transparent'] } : { x: 0 }}
    transition={{ duration: rejected ? 0.32 : 0.45 }}
    className={cn('relative space-y-4 overflow-hidden rounded-2xl border bg-surface p-6 shadow-card', flash && rejected ? 'border-bad bg-bad/10' : flash && state === 'accepted' ? 'border-ok bg-ok/10' : flash && state === 'warning' ? 'border-warn bg-warn/12' : 'border-line')}>
    {busy && <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-0.5 animate-[qr-scan_1s_linear_infinite] bg-accent" />}
    {userSlot}
    <QrScanner inputRef={input} busy={busy} rejected={rejected} validate={mode === 'reservation' ? validateTicket : undefined} submitLabel={labels[mode]}
      label={mode === 'reservation' ? 'QR del ticket de reserva' : 'Código del ejemplar'} onScan={code => { if (!busy) onScan(code) }} />
    <div aria-live={rejected ? 'assertive' : 'polite'} aria-atomic="true">{message && <StatusPill status={rejected ? 'late' : state === 'warning' ? 'soon' : 'ready'}>{message}</StatusPill>}</div>
  </motion.section>
}

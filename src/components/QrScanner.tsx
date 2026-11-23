import { useEffect, useRef, useState, type RefObject } from 'react'
import jsQR from 'jsqr'
import { Camera, CameraOff } from 'lucide-react'
import { toast } from 'sonner'
import { feedback } from '../lib/feedback'
import { Button, Field, inputCls } from './ui/primitives'

/** La cámara nunca se enciende sola: el navegador pide permiso solo cuando el
 *  usuario pulsa «Escanear con cámara», y se apaga tras cada lectura. */
export function QrScanner({ onScan, label = 'Código QR o código de barras', busy = false, submitLabel = 'Procesar código', inputRef, rejected = false, validate }: {
  onScan: (code: string) => void; label?: string; busy?: boolean; submitLabel?: string
  inputRef?: RefObject<HTMLInputElement | null>; rejected?: boolean
  /** Devuelve un mensaje si el código escrito no tiene el formato esperado. */
  validate?: (code: string) => string | null
}) {
  const [value, setValue] = useState('')
  const [camera, setCamera] = useState(false)
  const [status, setStatus] = useState('Escáner listo para lectura manual o con pistola.')
  const lastCode = useRef('')
  useEffect(() => {
    if (rejected) {
      setValue(lastCode.current)
      requestAnimationFrame(() => inputRef?.current?.select())
    }
  }, [rejected, inputRef])
  const video = useRef<HTMLVideoElement>(null)
  const handler = useRef(onScan)
  handler.current = onScan
  const validateRef = useRef(validate)
  validateRef.current = validate
  useEffect(() => {
    if (!camera) return
    let cancelled = false
    let stream: MediaStream | undefined
    let frame = 0
    let lastInvalid = ''
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    const read = () => {
      if (cancelled) return
      const v = video.current
      if (v && ctx && v.readyState >= 2 && v.videoWidth) {
        canvas.width = Math.min(v.videoWidth, 960)
        canvas.height = Math.round(v.videoHeight * canvas.width / v.videoWidth)
        ctx.drawImage(v, 0, 0, canvas.width, canvas.height)
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const code = jsQR(data.data, data.width, data.height, { inversionAttempts: 'dontInvert' })
        const invalid = code?.data.trim() ? validateRef.current?.(code.data.trim()) : null
        if (invalid && invalid !== lastInvalid) { lastInvalid = invalid; setStatus(invalid); feedback.error() }
        if (code?.data.trim() && !invalid) {
          cancelled = true
          stream?.getTracks().forEach((t) => t.stop())
          setCamera(false)
          setStatus(`Código leído: ${code.data}`)
          feedback.scan()
          lastCode.current = code.data.trim()
          handler.current(lastCode.current)
          return
        }
      }
      frame = requestAnimationFrame(read)
    }
    const start = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia || !ctx) throw new Error('Cámara no disponible. Usa la entrada manual o la pistola lectora.')
        setStatus('Esperando permiso de la cámara…')
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return }
        if (video.current) { video.current.srcObject = stream; await video.current.play() }
        if (!cancelled) { setStatus('Cámara activa. Apunta al QR del ticket.'); read() }
      } catch (error) {
        if (cancelled) return
        const name = error instanceof DOMException ? error.name : ''
        const message = name === 'NotAllowedError' ? 'Permiso de cámara denegado. Actívalo en el candado de la barra de direcciones o usa la pistola lectora.'
          : name === 'NotFoundError' ? 'No se encontró ninguna cámara en este equipo. Usa la pistola lectora o escribe el código.'
          : name === 'NotReadableError' ? 'La cámara está en uso por otra aplicación. Ciérrala e inténtalo de nuevo.'
          : error instanceof Error ? error.message : 'No se pudo iniciar la cámara.'
        setStatus(message)
        toast.error(message)
        setCamera(false)
      }
    }
    void start()
    return () => { cancelled = true; cancelAnimationFrame(frame); stream?.getTracks().forEach((t) => t.stop()); if (video.current) video.current.srcObject = null }
  }, [camera])
  return <div className="space-y-3">
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (busy) return; const code = value.trim(); if (!code) { toast.error('Introduce un código.'); return } const invalid = validate?.(code); if (invalid) { setStatus(invalid); toast.error(invalid); feedback.error(); inputRef?.current?.select(); return } setCamera(false); setStatus(`Código leído: ${code}`); feedback.scan(); lastCode.current = code; onScan(code); setValue('') }}>
      <Field label={label} hint="Escanea con la pistola y pulsa Enter, o escribe el código.">{(id) => <input ref={inputRef} aria-busy={busy} disabled={busy} id={id} className={inputCls} autoComplete="off" value={value} onChange={(e) => setValue(e.target.value)} />}</Field>
      <div className="flex flex-wrap gap-2"><Button size="lg" type="submit" disabled={busy || !value.trim()}>{busy ? 'Registrando…' : submitLabel}</Button><Button disabled={busy} variant="secondary" aria-pressed={camera} onClick={() => setCamera((v) => !v)}>{camera ? <><CameraOff size={16} aria-hidden />Apagar cámara</> : <><Camera size={16} aria-hidden />Escanear con cámara</>}</Button></div>
    </form>
    {camera && <div className="relative overflow-hidden rounded-xl bg-surface-2">
      <video ref={video} muted playsInline className="aspect-video max-h-80 w-full object-cover" aria-label="Vista de cámara para lectura QR" />
      <span aria-hidden className="pointer-events-none absolute inset-0 m-auto aspect-square h-3/5 rounded-xl border-2 border-white/80 shadow-[0_0_0_999px_rgb(0_0_0/0.35)]" />
    </div>}
    <p role="status" aria-live="polite" className="text-sm text-muted">{status}</p>
  </div>
}

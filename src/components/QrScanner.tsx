import { useEffect, useRef, useState, type RefObject } from 'react'
import jsQR from 'jsqr'
import { toast } from 'sonner'
import { feedback } from '../lib/feedback'
import { Button, Field, inputCls } from './ui/primitives'

export function QrScanner({ onScan, label = 'Código QR o código de barras', busy = false, submitLabel = 'Procesar código', cameraDefault = false, inputRef, rejected = false }: {
  onScan: (code: string) => void; label?: string; busy?: boolean; submitLabel?: string
  cameraDefault?: boolean; inputRef?: RefObject<HTMLInputElement | null>; rejected?: boolean
}) {
  const [value, setValue] = useState('')
  const [camera, setCamera] = useState(cameraDefault)
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
  useEffect(() => {
    if (!camera) return
    let cancelled = false
    let stream: MediaStream | undefined
    let frame = 0
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
        const code = jsQR(data.data, data.width, data.height)
        if (code?.data.trim()) {
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
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return }
        if (video.current) { video.current.srcObject = stream; await video.current.play() }
        if (!cancelled) { setStatus('Cámara activa. Apunta al QR del ticket.'); read() }
      } catch (error) {
        if (cancelled) return
        const message = error instanceof Error ? error.message : 'No se pudo iniciar la cámara.'
        setStatus(message)
        toast.error(message)
        setCamera(false)
      }
    }
    void start()
    return () => { cancelled = true; cancelAnimationFrame(frame); stream?.getTracks().forEach((t) => t.stop()); if (video.current) video.current.srcObject = null }
  }, [camera])
  return <div className="space-y-3">
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (busy) return; const code = value.trim(); if (!code) { toast.error('Introduce un código.'); return } setCamera(false); setStatus(`Código leído: ${code}`); feedback.scan(); lastCode.current = code; onScan(code); setValue('') }}>
      <Field label={label} hint="Escanea con la pistola y pulsa Enter, o escribe el código.">{(id) => <input ref={inputRef} aria-busy={busy} disabled={busy} id={id} className={inputCls} autoComplete="off" value={value} onChange={(e) => setValue(e.target.value)} />}</Field>
      <div className="flex flex-wrap gap-2"><Button size="lg" type="submit" disabled={busy || !value.trim()}>{busy ? 'Registrando…' : submitLabel}</Button><Button disabled={busy} variant="secondary" onClick={() => setCamera((v) => !v)}>{camera ? 'Detener cámara' : 'Activar cámara QR'}</Button></div>
    </form>
    {camera && <video ref={video} muted playsInline className="max-h-72 w-full rounded-xl bg-surface-2" aria-label="Vista de cámara para lectura QR" />}
    <p role="status" aria-live="polite" className="text-sm text-muted">{status}</p>
  </div>
}

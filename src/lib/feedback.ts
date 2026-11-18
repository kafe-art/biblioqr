/** Feedback sonoro y háptico sutil (Web Audio + Vibration API).
 *  Se usa en mostrador para confirmar escaneos sin mirar la pantalla. */

let ctx: AudioContext | null = null

function tone(freq: number, start: number, duration: number, type: OscillatorType = 'sine', gain = 0.06) {
  try {
    ctx ??= new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
    const osc = ctx.createOscillator()
    const vol = ctx.createGain()
    osc.type = type
    osc.frequency.value = freq
    const t0 = ctx.currentTime + start
    vol.gain.setValueAtTime(0, t0)
    vol.gain.linearRampToValueAtTime(gain, t0 + 0.01)
    vol.gain.exponentialRampToValueAtTime(0.0001, t0 + duration)
    osc.connect(vol).connect(ctx.destination)
    osc.start(t0)
    osc.stop(t0 + duration + 0.02)
  } catch {
    // Sin audio disponible (política de autoplay o navegador sin Web Audio): se omite en silencio.
  }
}

const vibrate = (pattern: number | number[]) => {
  if ('vibrate' in navigator) navigator.vibrate(pattern)
}

export const feedback = {
  success() {
    tone(880, 0, 0.12)
    tone(1320, 0.09, 0.18)
    vibrate(20)
  },
  scan() {
    tone(1040, 0, 0.07, 'triangle')
    vibrate(10)
  },
  warning() {
    tone(520, 0, 0.14, 'triangle')
    tone(390, 0.13, 0.22, 'triangle')
    vibrate([30, 40, 30])
  },
  error() {
    tone(196, 0, 0.26, 'square', 0.035)
    vibrate([60, 40, 60])
  },
}

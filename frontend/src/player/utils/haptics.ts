/**
 * SAGA Engine - Audio + Haptics System
 * Centralized utility for native mobile vibration patterns and game audio.
 */

// ─── Haptics ─────────────────────────────────────────────────────────────────
export const haptics = {
  vibrate(pattern: number | number[]) {
    if (typeof window !== 'undefined' && 'navigator' in window && 'vibrate' in navigator) {
      try { navigator.vibrate(pattern) } catch { /* ignore */ }
    }
  },

  /** Éxito al superar un nodo (triple pulso ascendente) */
  success() { this.vibrate([20, 40, 30, 40, 50]) },

  /** Error o advertencia (vibración fuerte) */
  error() { this.vibrate([100, 50, 100]) },

  /** GPS entrando en rango (pulso suave) */
  approach() { this.vibrate([30, 80, 60]) },

  /** Objeto recogido (tap rápido doble) */
  collect() { this.vibrate([15, 30, 15]) },

  /** Tick suave (apertura de panel) */
  tick() { this.vibrate(10) },

  /** QR escaneado correctamente */
  qrScan() { this.vibrate([10, 20, 40]) },

  /** Señal GPS bloqueada / win signal hunt */
  signalLock() { this.vibrate([20, 30, 20, 30, 80]) },
}

// ─── Audio Engine ─────────────────────────────────────────────────────────────
// Replaced oscillators with lightweight base64 audio to ensure iOS support

let audioCtx: AudioContext | null = null
let audioUnlocked = false

function getAudioCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
    }
    return audioCtx
  } catch { return null }
}

function unlockAudioContext() {
  if (audioUnlocked) return
  const ctx = getAudioCtx()
  if (ctx) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    gain.gain.value = 0
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(0)
    osc.stop(ctx.currentTime + 0.001)
    
    if (ctx.state === 'suspended') {
      ctx.resume().then(() => {
        audioUnlocked = true
      })
    } else {
      audioUnlocked = true
    }
  }
}

if (typeof document !== 'undefined') {
  const unlockEvents = ['touchstart', 'touchend', 'click', 'keydown']
  const unlockHandler = () => {
    unlockAudioContext()
    if (audioUnlocked) {
      unlockEvents.forEach(e => document.removeEventListener(e, unlockHandler))
    }
  }
  unlockEvents.forEach(e => document.addEventListener(e, unlockHandler, { once: true, passive: true }))
}

function playTone(
  frequency: number,
  duration: number,
  type: OscillatorType = 'sine',
  gainValue = 0.18,
  fadeOut = true
) {
  const ctx = getAudioCtx()
  if (!ctx || ctx.state === 'suspended') return

  try {
    const oscillator = ctx.createOscillator()
    const gainNode = ctx.createGain()

    oscillator.connect(gainNode)
    gainNode.connect(ctx.destination)

    oscillator.type = type
    oscillator.frequency.setValueAtTime(frequency, ctx.currentTime)

    gainNode.gain.setValueAtTime(gainValue, ctx.currentTime)
    if (fadeOut) {
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration / 1000)
    }

    oscillator.start(ctx.currentTime)
    oscillator.stop(ctx.currentTime + duration / 1000)
  } catch { /* ignore */ }
}

export const sounds = {
  init() {
    unlockAudioContext()
  },

  success() {
    playTone(523, 120, 'sine', 0.15)
    setTimeout(() => playTone(659, 120, 'sine', 0.15), 130)
    setTimeout(() => playTone(784, 220, 'sine', 0.18), 260)
  },

  error() {
    playTone(200, 180, 'square', 0.1)
    setTimeout(() => playTone(160, 200, 'square', 0.08), 200)
  },

  approach() {
    playTone(440, 100, 'sine', 0.1)
    setTimeout(() => playTone(550, 150, 'sine', 0.12), 120)
  },

  collect() {
    playTone(880, 80, 'sine', 0.14)
    setTimeout(() => playTone(1100, 150, 'sine', 0.12), 90)
  },

  qrScan() {
    playTone(880, 80, 'sine', 0.15)
    setTimeout(() => playTone(1760, 120, 'sine', 0.15), 100)
  },

  signalLock() {
    playTone(600, 100, 'square', 0.1)
    setTimeout(() => playTone(800, 150, 'square', 0.1), 150)
  },

  /** Apertura de panel / tick */
  tick() {
    playTone(800, 30, 'sine', 0.05)
  },

  /** Pulso de aproximación (señal débil) */
  pulse(intensity: number) {
    const freq = 200 + intensity * 400 // 200Hz (lejos) → 600Hz (cerca)
    const gain = 0.04 + intensity * 0.1
    playTone(freq, 60, 'sine', gain)
  },
}

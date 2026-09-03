import { useEffect, useState, useRef } from 'react'

interface AudioChallengeRuntimeProps {
  onWin: () => void
}

export function AudioChallengeRuntime({ onWin }: AudioChallengeRuntimeProps) {
  const [level, setLevel] = useState(0)
  const [active, setActive] = useState(false)
  const [error, setError] = useState('')
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const progressRef = useRef(0)
  /**
   * El bucle que mira el micrófono necesita saber "estoy activo" AHORA, no
   * en el render en que se definió.
   *
   * checkVolume() se llama sola, justo después de setActive(true) -sin
   * esperar al siguiente render-. React no actualiza `active` hasta
   * entonces, así que esa primera llamada seguía viendo `active=false` -el
   * closure del render de antes del clic- y se paraba en la primera línea:
   * el bucle de requestAnimationFrame nunca llegaba a arrancar. La barra se
   * quedaba en 0% para siempre, con el micrófono realmente escuchando y sin
   * que nada leyera lo que oía. No hacía falta tocar el micrófono ni el
   * hilo de audio: solo esta comprobación necesita el valor de verdad.
   */
  const activeRef = useRef(false)

  useEffect(() => {
    return () => {
      activeRef.current = false
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {})
      }
    }
  }, [])

  async function startListening() {
    try {
      setError('')
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
      const context = new AudioContextClass()
      audioContextRef.current = context

      const source = context.createMediaStreamSource(stream)
      const analyser = context.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)
      analyserRef.current = analyser

      activeRef.current = true
      setActive(true)
      progressRef.current = 0

      checkVolume()
    } catch (err) {
      setError('No se pudo acceder al micrófono. Asegúrate de dar permisos.')
    }
  }

  function checkVolume() {
    if (!analyserRef.current || !activeRef.current) return

    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount)
    analyserRef.current.getByteFrequencyData(dataArray)

    let sum = 0
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i]
    }
    const average = sum / dataArray.length

    // Threshold for blowing into the mic
    if (average > 80) {
      progressRef.current = Math.min(100, progressRef.current + 2)
    } else {
      progressRef.current = Math.max(0, progressRef.current - 1)
    }

    setLevel(progressRef.current)

    if (progressRef.current >= 100) {
      activeRef.current = false
      setActive(false)
      onWin()
    } else {
      requestAnimationFrame(checkVolume)
    }
  }

  return (
    <div className="saga-glass-panel" style={{ padding: 24, textAlign: 'center' }}>
      <h3 style={{ fontSize: 18, fontWeight: 900, marginBottom: 8 }}>Desafío de Audio</h3>
      <p style={{ color: 'rgb(var(--theme-line-soft))', fontSize: 14, marginBottom: 24 }}>
        Sopla o haz ruido cerca del micrófono para cargar la barra.
      </p>

      {!active && progressRef.current === 0 ? (
        <button
          onClick={startListening}
          style={{
            padding: '12px 24px',
            background: '#3b82f6',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            fontWeight: 800,
            cursor: 'pointer',
          }}
        >
          Activar Micrófono
        </button>
      ) : (
        <div
          style={{
            width: '100%',
            height: 24,
            background: 'rgba(255,255,255,0.1)',
            borderRadius: 12,
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          <div
            style={{
              width: `${level}%`,
              height: '100%',
              background: 'rgb(var(--theme-done))',
              transition: 'width 0.1s linear',
            }}
          />
          <span
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 10,
              fontWeight: 900,
              color: '#fff',
            }}
          >
            {Math.round(level)}%
          </span>
        </div>
      )}

      {error && <div style={{ color: '#ef4444', marginTop: 16, fontSize: 12 }}>{error}</div>}
    </div>
  )
}

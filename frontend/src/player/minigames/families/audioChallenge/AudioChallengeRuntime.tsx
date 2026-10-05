import { useEffect, useState, useRef } from 'react'
import { avisarPeticionDePermisoPropia } from '../../../utils/permissionPromptGuard'
import { useSinRetoEnPantalla } from '../../../hooks/useSinRetoEnPantalla'
import { useTextos } from '../../core/useTextos'
import { crearMedidorSostenido, leerConfigDelMedidor } from './medidor'

interface AudioChallengeRuntimeProps {
  /** Umbral y tiempo sostenido del nodo (`volume_threshold`, `sustain_ms`). */
  config?: Record<string, unknown>
  onWin: () => void
}

export function AudioChallengeRuntime({ config, onWin }: AudioChallengeRuntimeProps) {
  const t = useTextos().audio
  // La pantalla no recibía la configuración del nodo: el umbral era un 80 fijo.
  const medidorRef = useRef(crearMedidorSostenido(leerConfigDelMedidor(config)))
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

  // Hasta activar el micrófono sólo hay una pantalla con un botón: sin reto.
  useSinRetoEnPantalla(!active)

  const montadoRef = useRef(true)

  /**
   * Suelta el micrófono y el contexto de audio. Antes sólo se hacía al cerrar la
   * hoja: superado el reto, el micrófono seguía abierto (el indicador rojo del
   * sistema encendido) mientras el jugador leía el mensaje o esperaba al
   * servidor; y si la hoja se cerraba con el permiso aún pendiente, el micrófono
   * que llegaba después ya no lo cerraba nadie.
   */
  const soltarMicrofono = () => {
    activeRef.current = false
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    audioContextRef.current?.close().catch(() => {})
    audioContextRef.current = null
    analyserRef.current = null
  }

  useEffect(() => {
    montadoRef.current = true
    return () => {
      montadoRef.current = false
      soltarMicrofono()
    }
  }, [])

  async function startListening() {
    try {
      setError('')
      // El aviso de permiso del micrófono quita el foco a la página: sin avisar
      // antes, el anti-trampas lo leía como «se fue a otra app» (+30 s y el reto
      // reiniciado en cuanto se pulsaba «Activar micrófono»).
      avisarPeticionDePermisoPropia()
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (!montadoRef.current) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
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
      medidorRef.current = crearMedidorSostenido(leerConfigDelMedidor(config))

      checkVolume()
    } catch {
      setError(t.sinMicrofono)
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

    // Tiempo sostenido por encima del umbral, medido con el reloj y no por
    // fotogramas (ver medidor.ts).
    const lectura = medidorRef.current.muestra(average, performance.now())
    progressRef.current = lectura.progreso

    setLevel(progressRef.current)

    if (lectura.superado) {
      soltarMicrofono()
      setActive(false)
      onWin()
    } else {
      requestAnimationFrame(checkVolume)
    }
  }

  return (
    <div className="saga-glass-panel" style={{ padding: 24, textAlign: 'center' }}>
      <h3 style={{ fontSize: 18, fontWeight: 900, marginBottom: 8 }}>{t.titulo}</h3>
      <p style={{ color: 'rgb(var(--theme-line-soft))', fontSize: 14, marginBottom: 24 }}>
        {t.instrucciones}
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
          {t.activar}
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

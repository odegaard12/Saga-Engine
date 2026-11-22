import { useEffect, useState, useRef, type CSSProperties } from 'react'
import { avisarPeticionDePermisoPropia } from '../../../utils/permissionPromptGuard'
import { useSinRetoEnPantalla } from '../../../hooks/useSinRetoEnPantalla'
import { useTextos } from '../../core/useTextos'
import { crearMedidorSostenido, leerConfigDelMedidor } from './medidor'
import { usePrefiereMenosMovimiento } from '../../../ui/movimiento'

interface AudioChallengeRuntimeProps {
  /** Umbral y tiempo sostenido del nodo (`volume_threshold`, `sustain_ms`). */
  config?: Record<string, unknown>
  onWin: () => void
}

export function AudioChallengeRuntime({ config, onWin }: AudioChallengeRuntimeProps) {
  const t = useTextos().audio
  const reducido = usePrefiereMenosMovimiento()
  // La pantalla no recibía la configuración del nodo: el umbral era un 80 fijo.
  const medidorRef = useRef(crearMedidorSostenido(leerConfigDelMedidor(config)))
  const [level, setLevel] = useState(0)
  const [active, setActive] = useState(false)
  const [error, setError] = useState('')
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const progressRef = useRef(0)
  /** 22/11: el mismo búfer para cada lectura (antes un `Uint8Array` nuevo en cada fotograma, 60 por segundo). */
  const bufferRef = useRef<Uint8Array<ArrayBuffer> | null>(null)
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
   * Revisión 19/10: un doble toque en «Activar micrófono» lanzaba dos
   * `getUserMedia` a la vez; el primer stream se quedaba sin cerrar (micrófono
   * encendido) y había dos bucles leyendo. Candado mientras se pide permiso.
   */
  const pidiendoRef = useRef(false)

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

  // Al volver a la app, iOS deja el audio suspendido: se reanuda si el reto estaba escuchando.
  useEffect(() => {
    const alVolver = () => {
      if (document.visibilityState === 'visible' && activeRef.current) {
        void audioContextRef.current?.resume().catch(() => undefined)
      }
    }
    document.addEventListener('visibilitychange', alVolver)
    return () => document.removeEventListener('visibilitychange', alVolver)
  }, [])

  useEffect(() => {
    montadoRef.current = true
    return () => {
      montadoRef.current = false
      soltarMicrofono()
    }
  }, [])

  async function startListening() {
    if (pidiendoRef.current || activeRef.current) return
    pidiendoRef.current = true
    // iOS sólo deja sonar/escuchar un AudioContext creado DENTRO del toque: antes se creaba tras el `await` del
    // permiso, nacía suspendido y el medidor se quedaba a cero para siempre (revisión 19/10).
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
    const context: AudioContext = audioContextRef.current ?? new AudioContextClass()
    audioContextRef.current = context
    void context.resume?.().catch(() => undefined)
    try {
      setError('')
      // El aviso de permiso del micrófono quita el foco a la página: sin avisar
      // antes, el anti-trampas lo leía como «se fue a otra app» (+30 s y el reto
      // reiniciado en cuanto se pulsaba «Activar micrófono»).
      avisarPeticionDePermisoPropia()
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (!montadoRef.current) {
        stream.getTracks().forEach((track) => track.stop())
        context.close().catch(() => {})
        return
      }
      streamRef.current = stream

      if (context.state === 'suspended') await context.resume().catch(() => undefined)

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
      // Sin permiso: el contexto que se abrió en el toque también se cierra.
      soltarMicrofono()
      setError(t.sinMicrofono)
    } finally {
      pidiendoRef.current = false
    }
  }

  function checkVolume() {
    if (!analyserRef.current || !activeRef.current) return

    const bins = analyserRef.current.frequencyBinCount
    if (bufferRef.current?.length !== bins) bufferRef.current = new Uint8Array(bins)
    const dataArray = bufferRef.current
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

  // 22/11: en la piel de los demás juegos: título a la izquierda, un micrófono dibujado que crece con lo que oye
  // (el aro sigue al nivel; con «reducir movimiento» sin transición) y la barra con su cifra al lado, legible.
  const oyendo = active || progressRef.current > 0
  return (
    <div className="saga-glass-panel" style={panel}>
      <h2 style={{ margin: 0 }}>{t.titulo}</h2>
      <p style={instrucciones}>{t.instrucciones}</p>

      <div style={escena} aria-hidden="true">
        <span
          style={{
            ...aro,
            transform: `scale(${1 + (oyendo ? level / 100 : 0) * 0.45})`,
            opacity: oyendo ? 0.25 + (level / 100) * 0.5 : 0,
            transition: reducido ? 'none' : 'transform 0.12s linear, opacity 0.12s linear',
          }}
        />
        <span style={{ ...microfono, ...(oyendo ? microfonoOyendo : null) }}>
          <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="3" width="6" height="11" rx="3" />
            <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M9 21h6" />
          </svg>
        </span>
      </div>

      {!oyendo ? (
        <button type="button" className="primary" onClick={startListening} style={boton}>
          {t.activar}
        </button>
      ) : (
        <div style={filaMedidor}>
          <div style={pista}>
            {/* 22/11: `transform`, no `width`: cambia en cada fotograma y así no recalcula la maquetación. */}
            <div
              style={{
                ...relleno,
                transform: `scaleX(${level / 100})`,
                transition: reducido ? 'none' : 'transform 0.1s linear',
              }}
            />
          </div>
          <b style={cifra}>{Math.round(level)}%</b>
        </div>
      )}

      {error && (
        <div role="alert" style={aviso}>
          {error}
        </div>
      )}
    </div>
  )
}

const panel: CSSProperties = { display: 'grid', gap: 12, padding: '4px 0 0', color: 'var(--mg-text)' }
const instrucciones: CSSProperties = { margin: 0, color: 'var(--mg-text-2)', fontSize: 15, lineHeight: 1.4 }
const escena: CSSProperties = { position: 'relative', display: 'grid', placeItems: 'center', height: 150 }
const aro: CSSProperties = {
  position: 'absolute',
  width: 104,
  height: 104,
  borderRadius: '50%',
  background: 'rgb(var(--theme-done))',
}
const microfono: CSSProperties = {
  position: 'relative',
  display: 'grid',
  placeItems: 'center',
  width: 96,
  height: 96,
  borderRadius: '50%',
  background: 'var(--saga-pizarra-tarjeta)',
  border: '1px solid var(--saga-pizarra-borde)',
  boxShadow: 'var(--saga-sombra-2)',
  color: 'var(--mg-text-2)',
}
const microfonoOyendo: CSSProperties = {
  background: 'var(--mg-good-fondo)',
  borderColor: 'var(--mg-good)',
  color: 'var(--mg-good)',
}
const boton: CSSProperties = { width: '100%', minHeight: 44, cursor: 'pointer', font: 'inherit', fontSize: 16 }
const filaMedidor: CSSProperties = { display: 'flex', alignItems: 'center', gap: 12, minHeight: 50 }
const pista: CSSProperties = {
  flex: 1,
  height: 16,
  borderRadius: 999,
  overflow: 'hidden',
  background: 'color-mix(in srgb, var(--mg-text) 12%, transparent)',
}
const relleno: CSSProperties = {
  width: '100%',
  height: '100%',
  borderRadius: 999,
  background: 'rgb(var(--theme-done))',
  transformOrigin: 'left',
}
const cifra: CSSProperties = { minWidth: 52, textAlign: 'right', fontSize: 18, fontVariantNumeric: 'tabular-nums' }
const aviso: CSSProperties = {
  borderRadius: 12,
  padding: '8px 12px',
  fontSize: 14,
  fontWeight: 800,
  textAlign: 'center',
  color: 'var(--mg-bad)',
  background: 'color-mix(in srgb, var(--mg-bad) 16%, transparent)',
}

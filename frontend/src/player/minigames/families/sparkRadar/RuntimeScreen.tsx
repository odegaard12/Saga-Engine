import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { PlayerStage } from '../../../../types/player'
import type { ResolvedMinigame } from '../../core/resolver'
import { sounds, haptics } from '../../../utils/haptics'

/**
 * Caza-Señales: radar de reflejos.
 *
 * Aparecen chispas verdes durante un instante y hay que tocarlas antes de que
 * se apaguen. Las rojas son señales falsas: tocarlas resta acierto y tiempo.
 *
 * El texto es neutro a propósito: la ambientación de cada misión va en los
 * textos del nodo, no dentro del motor.
 *
 * Pensado para jugarse de pie en el monte, con una mano y guantes puestos: los
 * blancos son grandes, no hay que memorizar nada y una partida dura menos de
 * un minuto.
 */

interface SparkRadarRuntimeProps {
  resolved: ResolvedMinigame
  stage: PlayerStage
  helperText: string
  submitting: boolean
  onWin: (penaltyMs?: number, tempoDaPartidaMs?: number) => Promise<void>
  /** El reloj del nodo no corre hasta aquí: lo arranca Comenzar. */
  onComezar?: () => void
}

type Spark = {
  id: number
  kind: 'signal' | 'echo'
  /** Posición en porcentaje del radar, para que escale con la pantalla. */
  x: number
  y: number
  bornAt: number
  lifeMs: number
}

type Phase = 'ready' | 'playing' | 'won' | 'lost'

const SPARK_SIZE = 62

function readNumber(config: unknown, key: string, fallback: number): number {
  const raw = (config as Record<string, unknown>)?.[key]
  const value = Number(raw)
  return Number.isFinite(value) && value > 0 ? value : fallback
}

export function SparkRadarRuntimeScreen({
  resolved,
  helperText,
  submitting,
  onComezar,
  onWin,
}: SparkRadarRuntimeProps) {
  const config = resolved.config as Record<string, unknown>

  const targetHits = Math.round(readNumber(config, 'target_hits', 20))
  const timeLimitS = Math.round(readNumber(config, 'time_limit_s', 45))
  const spawnMs = Math.round(readNumber(config, 'spawn_interval_ms', 700))
  const lifeMs = Math.round(readNumber(config, 'spark_life_ms', 1600))
  const echoRatio = Math.min(0.6, Math.max(0, readNumber(config, 'echo_ratio', 0.28)))
  const echoPenaltyS = Math.round(readNumber(config, 'echo_penalty_s', 2))
  /**
   * Cuánto se acelera el radar de principio a fin de la partida.
   *
   * 0 = ritmo constante. 0.55 = al llegar al último acierto las chispas salen y
   * se apagan a algo menos de la mitad de tiempo que al principio. Empieza
   * asequible y acaba apretando, que es lo que hace que no se gane de carrerilla.
   */
  const aceleracion = Math.min(0.8, Math.max(0, readNumber(config, 'speed_ramp', 0.55)))

  const [phase, setPhase] = useState<Phase>('ready')
  const [sparks, setSparks] = useState<Spark[]>([])
  const [hits, setHits] = useState(0)
  const [misses, setMisses] = useState(0)
  const [remainingMs, setRemainingMs] = useState(timeLimitS * 1000)
  const [flash, setFlash] = useState<'none' | 'good' | 'bad'>('none')

  const nextIdRef = useRef(1)
  const endsAtRef = useRef(0)
  const wonRef = useRef(false)

  const reset = useCallback(() => {
    setSparks([])
    setHits(0)
    setMisses(0)
    setRemainingMs(timeLimitS * 1000)
    setFlash('none')
    wonRef.current = false
  }, [timeLimitS])

  /** Instante en que se pulsó Comezar. El reto empieza ahí, no antes. */
  const comezouRef = useRef(0)

  function start() {
    reset()
    comezouRef.current = Date.now()
    onComezar?.()
    endsAtRef.current = Date.now() + timeLimitS * 1000
    setPhase('playing')
  }

  // Reloj y limpieza de chispas apagadas en un solo intervalo: dos temporizadores
  // separados desincronizaban el contador con lo que se veía en pantalla.
  useEffect(() => {
    if (phase !== 'playing') return

    const id = window.setInterval(() => {
      const now = Date.now()
      setSparks((prev) => prev.filter((spark) => now - spark.bornAt < spark.lifeMs))

      const left = endsAtRef.current - now
      setRemainingMs(left > 0 ? left : 0)
      if (left <= 0) setPhase((current) => (current === 'playing' ? 'lost' : current))
    }, 100)

    return () => window.clearInterval(id)
  }, [phase])

  // Generador de chispas, cada vez más rápido.
  //
  // Va con setTimeout encadenado y no con setInterval: el ritmo cambia sobre la
  // marcha según los aciertos que lleve, y un intervalo fijo no puede acelerar.
  // El progreso se lee de un ref para no reiniciar el temporizador en cada
  // acierto, que dejaba un hueco muerto justo después de tocar una chispa.
  const progresoRef = useRef(0)
  progresoRef.current = targetHits > 0 ? Math.min(1, hits / targetHits) : 0

  useEffect(() => {
    if (phase !== 'playing') return

    let id: number | undefined
    let vivo = true

    const factor = () => 1 - aceleracion * progresoRef.current

    const soltarChispa = () => {
      if (!vivo) return

      setSparks((prev) => {
        // Tope de chispas simultáneas: con más, el radar se vuelve ruido y deja
        // de premiar el reflejo.
        if (prev.length >= 4) return prev

        const kind: Spark['kind'] = Math.random() < echoRatio ? 'echo' : 'signal'
        const duracion = Math.max(420, lifeMs * factor())

        return [
          ...prev,
          {
            id: nextIdRef.current++,
            kind,
            // Margen del 12% para que ninguna chispa quede pegada al borde.
            x: 12 + Math.random() * 76,
            y: 12 + Math.random() * 76,
            bornAt: Date.now(),
            lifeMs: kind === 'echo' ? duracion * 0.9 : duracion,
          },
        ]
      })

      id = window.setTimeout(soltarChispa, Math.max(220, spawnMs * factor()))
    }

    id = window.setTimeout(soltarChispa, spawnMs)

    return () => {
      vivo = false
      if (id !== undefined) window.clearTimeout(id)
    }
  }, [phase, spawnMs, lifeMs, echoRatio, aceleracion, targetHits])

  /**
   * Al completar los aciertos se PARA, pero no se avanza todavía.
   *
   * Antes se llamaba a onWin en el acto: el nodo avanzaba, la pantalla se
   * cerraba de golpe y nadie llegaba a ver cuánto había tardado ni cuántas
   * falsas había tocado. El reloj deja de correr aquí; avanzar lo decide el
   * jugador con el botón.
   */
  useEffect(() => {
    if (phase !== 'playing' || hits < targetHits || wonRef.current) return
    wonRef.current = true
    setPhase('won')
    setSparks([])
    sounds.success()
    haptics.success()
  }, [phase, hits, targetHits])

  /**
   * El botón de continuar tarda dos segundos en habilitarse.
   *
   * Al cazar la última señal el dedo sigue en marcha, y el toque siguiente caía
   * justo encima del botón: se salía del nodo sin haber visto el resultado.
   */
  const [podeContinuar, setPodeContinuar] = useState(false)

  useEffect(() => {
    if (phase !== 'won') {
      setPodeContinuar(false)
      return
    }
    const id = window.setTimeout(() => setPodeContinuar(true), 2000)
    return () => window.clearTimeout(id)
  }, [phase])

  const continuarLockRef = useRef(false)

  function continuarRuta() {
    if (continuarLockRef.current) return
    continuarLockRef.current = true
    // Cada señal falsa tocada suma su penalización al tiempo del nodo. Antes
    // sólo acortaba el cronómetro interno: quien fallaba mucho pero llegaba a
    // tiempo quedaba igual de bien en la clasificación que quien no falló.
    // El tiempo que se guarda es el de la partida, no el de la ficha: leer las
    // instrucciones no puede costar puntos.
    const daPartida = comezouRef.current ? Date.now() - comezouRef.current : undefined
    void onWin(misses * echoPenaltyS * 1000, daPartida)
  }

  /**
   * Tocar donde no hay nada también cuenta como fallo.
   *
   * Sin esto, la forma más rápida de ganar era aporrear la pantalla: todos los
   * toques a ciegas eran gratis y alguno acertaba. Ahora el manotazo cuesta lo
   * mismo que tocar una señal falsa.
   */
  function tapVacio() {
    if (phase !== 'playing') return
    setMisses((value) => value + 1)
    setFlash('bad')
    haptics.error()
  }

  function tapSpark(spark: Spark) {
    if (phase !== 'playing') return

    setSparks((prev) => prev.filter((item) => item.id !== spark.id))

    if (spark.kind === 'signal') {
      setHits((value) => value + 1)
      setFlash('good')
      sounds.qrScan()
      haptics.qrScan()
      return
    }

    setMisses((value) => value + 1)
    setFlash('bad')
    haptics.error()
    endsAtRef.current -= echoPenaltyS * 1000
  }

  useEffect(() => {
    if (flash === 'none') return
    const id = window.setTimeout(() => setFlash('none'), 180)
    return () => window.clearTimeout(id)
  }, [flash])

  const seconds = Math.max(0, remainingMs / 1000)
  const progress = Math.min(1, hits / targetHits)

  const radarStyle = useMemo<CSSProperties>(
    () => ({
      ...radar,
      boxShadow:
        flash === 'good'
          ? '0 0 0 2px rgba(74,222,128,.75), inset 0 0 60px rgba(74,222,128,.25)'
          : flash === 'bad'
            ? '0 0 0 2px rgba(248,113,113,.8), inset 0 0 60px rgba(248,113,113,.3)'
            : 'inset 0 0 60px rgba(15,118,110,.25)',
    }),
    [flash]
  )

  return (
    <div style={wrapper}>
      <style>{STYLES}</style>
      <div style={hud}>
        <div style={hudBlock}>
          <span style={hudLabel}>SINAIS</span>
          <strong style={hudValue}>
            {hits}
            <span style={hudTotal}>/{targetHits}</span>
          </strong>
        </div>
        <div style={hudBlock}>
          <span style={hudLabel}>TEMPO</span>
          <strong style={{ ...hudValue, color: seconds <= 5 ? '#f87171' : '#f8fafc' }}>
            {seconds.toFixed(1)}s
          </strong>
        </div>
        <div style={hudBlock}>
          <span style={hudLabel}>ECOS</span>
          <strong style={{ ...hudValue, color: misses > 0 ? '#fbbf24' : '#f8fafc' }}>
            {misses}
          </strong>
        </div>
      </div>

      <div style={progressTrack}>
        <div style={{ ...progressFill, width: `${progress * 100}%` }} />
      </div>

      <div
        style={radarStyle}
        onPointerDown={(evento) => {
          // Sólo si el toque cae en el radar y no en una chispa: las chispas
          // paran el evento por su cuenta.
          if (evento.target === evento.currentTarget) tapVacio()
        }}
      >
        <div style={ring(0.35)} />
        <div style={ring(0.68)} />
        <div style={ring(1)} />
        <div style={crosshairH} />
        <div style={crosshairV} />
        {phase === 'playing' ? <div style={sweep} /> : null}

        {sparks.map((spark) => (
          <button
            key={spark.id}
            type="button"
            aria-label={spark.kind === 'signal' ? 'Sinal' : 'Sinal falsa'}
            onPointerDown={(event) => {
              // pointerdown y no click: en móvil el click llega ~300 ms tarde y
              // la chispa ya se había apagado.
              event.preventDefault()
              event.stopPropagation()
              tapSpark(spark)
            }}
            style={{
              ...sparkButton,
              left: `${spark.x}%`,
              top: `${spark.y}%`,
              background:
                spark.kind === 'signal'
                  ? 'radial-gradient(circle at 35% 30%, #bbf7d0, #22c55e 55%, #15803d)'
                  : 'radial-gradient(circle at 35% 30%, #fecaca, #ef4444 55%, #991b1b)',
              boxShadow:
                spark.kind === 'signal'
                  ? '0 0 24px rgba(34,197,94,.85)'
                  : '0 0 24px rgba(239,68,68,.85)',
            }}
          >
            {spark.kind === 'signal' ? '📡' : '✖'}
          </button>
        ))}

        {phase !== 'playing' ? (
          <div style={overlay}>
            {phase === 'ready' ? (
              <>
                <strong style={overlayTitle}>Caza-Señales</strong>
                <p style={overlayText}>
                  Toca as chispas <span style={{ color: '#4ade80' }}>verdes</span>. Evita as{' '}
                  <span style={{ color: '#f87171' }}>vermellas</span>: son sinais falsas.
                  Cada vermella e cada toque ao aire soman {echoPenaltyS}s.
                </p>
                <p style={overlayGoal}>
                  {targetHits} sinais en {timeLimitS}s
                </p>
                <button type="button" style={primaryButton} onClick={start}>
                  Comezar
                </button>
              </>
            ) : phase === 'won' ? (
              <>
                <strong style={overlayTitle}>✅ Sinal recuperado</strong>
                <p style={overlayText}>
                  Acertos: <strong>{hits}</strong>/{hits + misses} toques.
                </p>
                <p style={overlayText}>
                  {misses > 0 ? (
                    <>
                      {misses} {misses === 1 ? 'sinal falsa' : 'sinais falsas'}:{' '}
                      <strong style={{ color: '#fbbf24' }}>+{misses * echoPenaltyS}s</strong> ao teu
                      tempo.
                    </>
                  ) : (
                    'Sen un só fallo. Sen penalización.'
                  )}
                </p>
                <p style={overlayGoal}>
                  Tempo: {((timeLimitS * 1000 - remainingMs) / 1000).toFixed(1)}s
                </p>
                <div style={resumo}>
                  <div style={resumoFila}>
                    <span>Sinais cazadas</span>
                    <b>
                      {hits}/{targetHits}
                    </b>
                  </div>
                  <div style={resumoFila}>
                    <span>Falsas tocadas</span>
                    <b style={{ color: misses > 0 ? '#fbbf24' : '#4ade80' }}>{misses}</b>
                  </div>
                  <div style={{ ...resumoFila, ...resumoTotal }}>
                    <span>Penalización</span>
                    <b style={{ color: misses > 0 ? '#fbbf24' : '#4ade80' }}>
                      {misses > 0 ? `+${misses * echoPenaltyS}s` : 'ningunha'}
                    </b>
                  </div>
                </div>

                <button
                  type="button"
                  style={{ ...primaryButton, ...(podeContinuar ? null : { opacity: 0.55 }) }}
                  onClick={continuarRuta}
                  disabled={submitting || continuarLockRef.current || !podeContinuar}
                >
                  {submitting ? 'Gardando…' : podeContinuar ? 'Continuar' : 'Le o resultado…'}
                </button>
              </>
            ) : (
              <>
                <strong style={overlayTitle}>⏱ Tempo esgotado</strong>
                <p style={overlayText}>
                  Chegaches a {hits} de {targetHits} sinais. Próbao outra vez.
                </p>
                <button type="button" style={primaryButton} onClick={start}>
                  Reintentar
                </button>
              </>
            )}
          </div>
        ) : null}
      </div>

      <p style={helper}>{helperText}</p>
    </div>
  )
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

const STYLES = `
@keyframes sagaRadarSweep {
  to { transform: rotate(360deg); }
}

@keyframes sagaSparkIn {
  from { transform: translate(-50%, -50%) scale(.4); opacity: 0; }
  to { transform: translate(-50%, -50%) scale(1); opacity: 1; }
}

/* Quien tenga activado "reducir movimiento" no necesita el barrido girando
   delante de los ojos para jugar. */
@media (prefers-reduced-motion: reduce) {
  @keyframes sagaRadarSweep { to { transform: rotate(0deg); } }
  @keyframes sagaSparkIn { from { opacity: 1; } to { opacity: 1; } }
}
`

const wrapper: CSSProperties = {
  display: 'grid',
  gap: 10,
}

const hud: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  gap: 8,
}

const hudBlock: CSSProperties = {
  display: 'grid',
  gap: 2,
  padding: '8px 10px',
  borderRadius: 14,
  background: 'rgba(15,23,42,.72)',
  border: '1px solid rgba(148,163,184,.2)',
  textAlign: 'center',
}

const hudLabel: CSSProperties = {
  fontSize: 9,
  fontWeight: 900,
  letterSpacing: '.14em',
  color: '#94a3b8',
}

const hudValue: CSSProperties = {
  fontSize: 20,
  fontWeight: 950,
  color: '#f8fafc',
  fontVariantNumeric: 'tabular-nums',
}

const hudTotal: CSSProperties = {
  fontSize: 13,
  fontWeight: 800,
  color: '#64748b',
}

const progressTrack: CSSProperties = {
  height: 6,
  borderRadius: 999,
  background: 'rgba(148,163,184,.18)',
  overflow: 'hidden',
}

const progressFill: CSSProperties = {
  height: '100%',
  background: 'linear-gradient(90deg,#34d399,#4ade80)',
  transition: 'width .18s ease-out',
}

const radar: CSSProperties = {
  position: 'relative',
  width: '100%',
  aspectRatio: '1 / 1',
  maxHeight: '52vh',
  margin: '0 auto',
  borderRadius: '50%',
  overflow: 'hidden',
  border: '2px solid rgba(45,212,191,.35)',
  background: 'radial-gradient(circle at 50% 50%, #042f2e, #020617 72%)',
  touchAction: 'manipulation',
  transition: 'box-shadow .12s ease-out',
}

function ring(scale: number): CSSProperties {
  return {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: `${scale * 100}%`,
    height: `${scale * 100}%`,
    transform: 'translate(-50%, -50%)',
    borderRadius: '50%',
    border: '1px solid rgba(45,212,191,.18)',
    pointerEvents: 'none',
  }
}

const crosshairH: CSSProperties = {
  position: 'absolute',
  top: '50%',
  left: 0,
  right: 0,
  height: 1,
  background: 'rgba(45,212,191,.15)',
  pointerEvents: 'none',
}

const crosshairV: CSSProperties = {
  position: 'absolute',
  left: '50%',
  top: 0,
  bottom: 0,
  width: 1,
  background: 'rgba(45,212,191,.15)',
  pointerEvents: 'none',
}

const sweep: CSSProperties = {
  position: 'absolute',
  inset: 0,
  borderRadius: '50%',
  background:
    'conic-gradient(from 0deg, rgba(45,212,191,0) 0deg, rgba(45,212,191,.22) 40deg, rgba(45,212,191,0) 80deg)',
  animation: 'sagaRadarSweep 2.4s linear infinite',
  pointerEvents: 'none',
}

const sparkButton: CSSProperties = {
  position: 'absolute',
  transform: 'translate(-50%, -50%)',
  width: SPARK_SIZE,
  height: SPARK_SIZE,
  borderRadius: '50%',
  border: 'none',
  display: 'grid',
  placeItems: 'center',
  fontSize: 22,
  cursor: 'pointer',
  animation: 'sagaSparkIn .16s ease-out',
  touchAction: 'manipulation',
}

const overlay: CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'grid',
  alignContent: 'center',
  justifyItems: 'center',
  gap: 8,
  padding: 22,
  textAlign: 'center',
  background: 'rgba(2,6,23,.86)',
  backdropFilter: 'blur(3px)',
}

const overlayTitle: CSSProperties = {
  fontSize: 19,
  fontWeight: 950,
  color: '#f8fafc',
}

const overlayText: CSSProperties = {
  margin: 0,
  fontSize: 13,
  lineHeight: 1.4,
  color: '#cbd5f5',
  maxWidth: 280,
}

const overlayGoal: CSSProperties = {
  margin: 0,
  fontSize: 12,
  fontWeight: 900,
  letterSpacing: '.06em',
  color: '#5eead4',
}

/** Resumen de la partida: lo que se cazo, lo que se fallo y lo que cuesta. */
const resumo: CSSProperties = {
  width: '100%',
  display: 'grid',
  gap: 6,
  margin: '4px 0 12px',
  padding: '10px 12px',
  borderRadius: 16,
  border: '1px solid rgba(255,255,255,.14)',
  background: 'linear-gradient(180deg, rgba(255,255,255,.10), rgba(255,255,255,.04))',
}

const resumoFila: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  fontSize: 12.5,
  color: 'rgba(226,232,240,.82)',
}

const resumoTotal: CSSProperties = {
  marginTop: 4,
  paddingTop: 7,
  borderTop: '1px solid rgba(255,255,255,.14)',
  fontWeight: 800,
}

const primaryButton: CSSProperties = {
  marginTop: 6,
  minHeight: 48,
  padding: '0 26px',
  borderRadius: 16,
  border: 'none',
  background: 'linear-gradient(135deg,#34d399,#059669)',
  color: '#022c22',
  fontSize: 15,
  fontWeight: 950,
  cursor: 'pointer',
}

const helper: CSSProperties = {
  margin: 0,
  fontSize: 12,
  lineHeight: 1.35,
  color: '#94a3b8',
  textAlign: 'center',
}

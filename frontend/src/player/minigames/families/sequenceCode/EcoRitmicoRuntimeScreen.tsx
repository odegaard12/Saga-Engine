import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent, PointerEvent } from 'react'
import type { PlayerStage } from '../../../../types/player'
import { useI18n } from '../../../../i18n/useI18n'
import { haptics, sounds } from '../../../utils/haptics'
import { useSinRetoEnPantalla } from '../../../hooks/useSinRetoEnPantalla'
import type { ResolvedMinigame } from '../../core/resolver'
import { crearReproductorDeTonos } from '../../core/tonos'
import { useRegenerarAoOcultar } from '../../core/useRegenerarAoOcultar'
import { Aviso, Cabecera, anotarPartida, usePartida } from '../logica/comun'
import { generarRonda, juzgarGolpe, tiemposDeRonda, type Golpe } from './eco'
import { semillaDelIntento } from './semilla'
import { textosDeEco } from './textos'
import './eco.css'

interface Props {
  resolved: ResolvedMinigame
  stage: PlayerStage
  submitting: boolean
  onWin: (penaltyMs?: number) => Promise<void | boolean>
  onComezar?: () => void
}

type Fase = 'listo' | 'escucha' | 'turno' | 'bien' | 'fallo'

/** Icono + color: se distinguen también sin ver colores. Notas de una pentatónica: suenan bien en cualquier orden. */
const FICHAS = [
  { glifo: '●', color: '#22d3ee', nota: 261.6 },
  { glifo: '▲', color: '#f472b6', nota: 293.7 },
  { glifo: '■', color: 'var(--a-aviso, #facc15)', nota: 329.6 },
  { glifo: '◆', color: 'var(--a-ok, #4ade80)', nota: 392.0 },
  { glifo: '★', color: 'var(--a-aviso, #fb923c)', nota: 440.0 },
  { glifo: '✚', color: '#a78bfa', nota: 523.3 },
]

/** Golpes máximos de una secuencia (15/11): las rondas siguientes repiten este largo, con su propia secuencia. */
const TOPE_GOLPES = 6

const num = (v: unknown, d: number, lo: number, hi: number) => {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? Math.max(lo, Math.min(hi, Math.round(n))) : d
}

/**
 * Eco rítmico (30/10): sustituye al Simón con su mismo id (`sequence_code`). Se enseña una secuencia de golpes, puntos
 * (cortos) y rayas (largos), y hay que repetirla en orden. 22/11 («B mejorada»): al escuchar se dibuja la línea de
 * punto y raya; al repetir la línea son huecos iguales y cada golpe aparece DESPUÉS de darlo, en verde o rojo. La raya
 * se hace dejando el dedo en la ficha hasta que se cierra el aro. Sin micrófono ni red; el sonido es opcional. Un fallo
 * cuesta `penalty_s` y repite la misma secuencia: nunca bloquea ni devuelve al principio.
 */
export function EcoRitmicoRuntimeScreen({ resolved, stage, submitting, onWin, onComezar }: Props) {
  const { locale } = useI18n()
  const t = textosDeEco(locale)
  const cfg = resolved.config as unknown as Record<string, unknown>
  const rondas = num(cfg.levels, 5, 3, 8)
  const nFichas = num(cfg.pad_count, 4, 3, 6)
  const pulsoBase = num(cfg.step_ms, 620, 260, 1200)
  const largas = Math.max(0, Math.min(60, Number(cfg.long_notes ?? 25) || 0))
  const penaS = num(cfg.penalty_s, 10, 5, 120)

  const { partida, cambiar, olvidar } = usePartida(stage?.id, 'sequence_code')
  const ronda = Math.min(rondas, Number(partida.datos.ronda) || 1)
  const [fase, setFase] = useState<Fase>('listo')
  const [aviso, setAviso] = useState<string>('')
  const [encendida, setEncendida] = useState<number | null>(null)
  const [paso, setPaso] = useState(-1)
  const [toques, setToques] = useState<Golpe[]>([])
  // La ficha con el dedo encima y si el aro ya se cerró (= raya).
  const [pulsada, setPulsada] = useState<number | null>(null)
  const [cerrado, setCerrado] = useState(false)
  const [sonido, setSonido] = useState(cfg.sound_enabled !== false)
  // 22/11: reabierta ya resuelta (se cerró la hoja con el envío rechazado o a medias), «Reintentar» tiene que estar:
  // antes quedaba «¡Resuelto!» sin ningún botón, también tras recargar (la partida se guarda).
  const [rechazado, setRechazado] = useState(() => partida.datos.resuelto === true)
  const [tonos] = useState(() => crearReproductorDeTonos())
  const timers = useRef<number[]>([])
  const aro = useRef<number | undefined>(undefined)
  // Un solo dedo a la vez: el que bajó primero (id del puntero, -1 = teclado), su ficha y cuándo bajó.
  const pulsadaRef = useRef<{ id: number; ficha: number; t0: number } | null>(null)
  // 22/11: los golpes van también en un ref: dos toques en el mismo fotograma leían el mismo `toques` del render y el
  // segundo se comparaba con la ficha del primero (un fallo que no era).
  const toquesRef = useRef<Golpe[]>([])

  // 15/11 (decisión de Óscar): al fallar se repite LA MISMA secuencia (intento fijo en 0): el fallo cuesta +10 s, no
  // una secuencia nueva que obligue a empezar de cero. Cada ronda sigue teniendo la suya (`:r${ronda}`).
  const semilla = `${semillaDelIntento(cfg, stage?.id, 0)}:r${ronda}`
  // Ronda 1 = 3 golpes, +1 por ronda, con tope (TOPE_GOLPES): más de 6 golpes con ritmo no lo pasa un jugador normal.
  const largo = Math.min(TOPE_GOLPES, ronda + 2)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- la config no cambia con el juego abierto
  const actual = useMemo(() => generarRonda(semilla, largo, nFichas, largas), [semilla, largo])
  // Cada ronda un poco más rápida, sin bajar de lo que se puede seguir con el dedo.
  const pulso = Math.max(260, pulsoBase - (ronda - 1) * 20)
  const tiempos = tiemposDeRonda(pulso)

  const soltarDedo = useCallback(() => {
    window.clearTimeout(aro.current)
    pulsadaRef.current = null
    setPulsada(null)
    setCerrado(false)
  }, [])
  const limpiar = useCallback(() => {
    timers.current.forEach((id) => window.clearTimeout(id))
    timers.current = []
    soltarDedo()
    setEncendida(null)
  }, [soltarDedo])
  useEffect(
    () => () => {
      limpiar()
      tonos.cerrar()
    },
    [limpiar, tonos]
  )

  // El golpe rojo se queda en la línea hasta «Verla otra vez» (escuchar() vacía los golpes).
  const fallar = (texto: string) => {
    limpiar()
    haptics.error()
    sounds.error()
    cambiar((p) => {
      p.fallos += 1
      p.intento += 1
    })
    setFase('fallo')
    setAviso(texto)
  }

  // Salir a mitad (a apuntarla con calma) cuenta como un fallo.
  useRegenerarAoOcultar(fase === 'escucha' || fase === 'turno', () => fallar(t.salio(penaS)))
  useSinRetoEnPantalla(fase !== 'escucha' && fase !== 'turno')

  const escuchar = () => {
    tonos.preparar() // el audio sólo arranca desde un toque
    limpiar()
    setFase('escucha')
    setAviso('')
    toquesRef.current = []
    setToques([])
    let t0 = 450
    actual.fichas.forEach((ficha, i) => {
      const dura = actual.pulsos[i] === 2 ? tiempos.luzLarga : tiempos.luzCorta
      timers.current.push(
        window.setTimeout(() => {
          setEncendida(ficha)
          setPaso(i)
          if (sonido) tonos.tono(FICHAS[ficha].nota, dura)
          haptics.tick()
        }, t0),
        window.setTimeout(() => setEncendida(null), t0 + dura)
      )
      t0 += dura + tiempos.hueco
    })
    timers.current.push(
      window.setTimeout(() => {
        setPaso(-1)
        setFase('turno')
      }, t0 + 150)
    )
  }

  const ganar = async () => {
    anotarPartida(stage?.id, 'sequence_code', partida, { rondas })
    const ok = await onWin(partida.fallos * penaS * 1000)
    if (ok === false) setRechazado(true)
    else olvidar()
  }

  /** Un golpe terminado: `ms` = lo que estuvo el dedo en la ficha. */
  const tocar = (ficha: number, ms: number) => {
    if (fase !== 'turno' || submitting) return
    const i = toquesRef.current.length
    // Secuencia ya completa (un toque más en el mismo fotograma que el último): no cuenta.
    if (i >= actual.fichas.length) return
    const golpe = juzgarGolpe(actual, i, ficha, ms, tiempos.umbral)
    const hechos = [...toquesRef.current, golpe]
    toquesRef.current = hechos
    setToques(hechos)
    if (golpe.fallo === 'ficha') return fallar(t.malFicha(penaS))
    if (golpe.fallo === 'ritmo') return fallar(t.malRitmo(penaS, actual.pulsos[i] === 2))
    if (hechos.length < actual.fichas.length) return haptics.tick()
    haptics.success()
    if (ronda >= rondas) {
      sounds.success()
      cambiar((p) => (p.datos.resuelto = true))
      setFase('bien')
      void ganar()
      return
    }
    setFase('bien')
  }

  // El dedo baja: se enciende la ficha y el aro empieza a cerrarse; al cerrarse (umbral) ya es raya.
  const bajar = (ficha: number, id: number, t0: number) => {
    if (fase !== 'turno' || submitting) return
    if (pulsadaRef.current) return
    if (toquesRef.current.length >= actual.fichas.length) return
    pulsadaRef.current = { id, ficha, t0 }
    setPulsada(ficha)
    setEncendida(ficha)
    if (sonido) tonos.tono(FICHAS[ficha].nota, 160)
    aro.current = window.setTimeout(() => {
      setCerrado(true)
      haptics.tick()
      if (sonido) tonos.tono(FICHAS[ficha].nota * 2, 70)
    }, tiempos.umbral)
  }
  const subir = (id: number, t1: number) => {
    const p = pulsadaRef.current
    if (!p || p.id !== id) return
    soltarDedo()
    setEncendida(null)
    tocar(p.ficha, t1 - p.t0)
  }
  // El sistema se quedó el gesto (llamada, aviso, gesto del borde): ese golpe no cuenta, ni bien ni mal.
  const cancelar = (id: number) => {
    if (pulsadaRef.current?.id !== id) return
    soltarDedo()
    setEncendida(null)
  }

  const siguiente = () => {
    cambiar((p) => (p.datos.ronda = ronda + 1))
    setFase('listo')
    setAviso('')
  }

  const chips = (
    <>
      <span className="lg-chip">{t.ronda(ronda, rondas)}</span>
      {partida.fallos ? (
        <span className="lg-chip lg-chip-pena">{t.penalizacion(partida.fallos * penaS)}</span>
      ) : null}
      <button
        type="button"
        className="lg-chip eco-sonido"
        aria-pressed={sonido}
        aria-label={t.sonido(sonido)}
        onClick={() => setSonido((s) => !s)}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z" fill="currentColor" />
          {sonido ? <path d="M15.5 9a4 4 0 010 6M18 6.5a8 8 0 010 11" /> : <path d="M16 9.5l5 5M21 9.5l-5 5" />}
        </svg>
      </button>
    </>
  )

  // Sólo en la primera ronda: después ya se sabe.
  const leyenda =
    ronda === 1 ? (
      <p className="eco-leyenda">
        {t.leyenda.split(' · ').map((parte, i) => (
          <span key={i}>
            <i className={`eco-marca ${i ? 'raya' : 'punto'}`} aria-hidden="true" />
            {parte}
          </span>
        ))}
      </p>
    ) : null

  if (!partida.empezado) {
    return (
      <div className="lg-root">
        <Cabecera titulo={t.titulo} chips={chips}>
          {t.intro(rondas, largas > 0)}
        </Cabecera>
        {leyenda}
        <Tablero n={nFichas} nombres={t.fichas} />
        <button
          type="button"
          className="lg-boton primary"
          onClick={() => {
            cambiar((p) => {
              p.empezado = true
              p.t0 = Date.now()
            })
            onComezar?.()
            escuchar()
          }}
        >
          {t.empezar}
        </button>
      </div>
    )
  }

  const resuelto = partida.datos.resuelto === true
  const enEscucha = fase === 'escucha'
  // Al escuchar se dibuja lo que suena; al repetir, sólo lo que ya tocó el jugador (la línea no chiva las rayas).
  const marcas = Array.from({ length: actual.fichas.length }, (_, i) =>
    enEscucha
      ? i <= paso
        ? { raya: actual.pulsos[i] === 2, tono: 'oido' }
        : null
      : toques[i]
        ? { raya: toques[i].raya, tono: toques[i].ok ? 'bien' : 'mal' }
        : null
  )
  const leidas = marcas.filter((m) => m !== null).map((m) => (m.raya ? t.raya : t.punto))
  // Un solo cartel, siempre en el mismo sitio: «Escucha» / «Tu turno» mientras se juega, y el resultado al acabar.
  const [estado, tono] = resuelto
    ? [t.resuelto, 'bien']
    : enEscucha
      ? [t.escucha, '']
      : fase === 'turno'
        ? [t.turno, 'turno']
        : fase === 'bien'
          ? [t.bien, 'bien']
          : fase === 'fallo'
            ? [t.fallo, 'mal']
            : [t.ronda(ronda, rondas), '']
  return (
    <div className="lg-root">
      <Cabecera titulo={t.titulo} chips={chips} />
      <p className={`eco-estado ${tono}`} aria-live="polite">
        {estado}
      </p>
      <div
        className="eco-linea"
        role="img"
        aria-label={`${enEscucha ? t.ritmo : t.tuyos}: ${leidas.join(', ')}`}
        style={{ '--dura': `${tiempos.luzLarga}ms` } as CSSProperties}
      >
        {marcas.map((m, i) => (
          <span key={i} className={`eco-hueco ${fase === 'turno' && i === toques.length ? 'ahora' : ''}`}>
            <i className={m ? `eco-marca ${m.raya ? 'raya' : 'punto'} ${m.tono}` : 'eco-marca vacia'} />
            <small aria-hidden="true">{i + 1}</small>
          </span>
        ))}
      </div>
      {leyenda}
      <Tablero
        n={nFichas}
        nombres={t.fichas}
        encendida={encendida}
        pulsada={pulsada}
        cerrado={cerrado}
        umbral={tiempos.umbral}
        activo={fase === 'turno' && !submitting}
        onBajar={bajar}
        onSubir={subir}
        onCancelar={cancelar}
      />
      {resuelto ? (
        <>
          {submitting ? <Aviso tono="bien">{t.enviando}</Aviso> : null}
          {rechazado ? (
            <button
              type="button"
              className="lg-boton primary"
              disabled={submitting}
              onClick={() => {
                setRechazado(false)
                void ganar()
              }}
            >
              {t.reintentar}
            </button>
          ) : null}
        </>
      ) : fase === 'bien' ? (
        <button type="button" className="lg-boton primary" onClick={siguiente}>
          {t.siguiente}
        </button>
      ) : fase === 'fallo' ? (
        <>
          <Aviso tono="pena">{aviso}</Aviso>
          <button type="button" className="lg-boton primary" onClick={escuchar}>
            {t.otra}
          </button>
        </>
      ) : fase === 'listo' ? (
        <button type="button" className="lg-boton primary" onClick={escuchar}>
          {t.empezar}
        </button>
      ) : null}
    </div>
  )
}

const nada = () => undefined

/** El instante del evento (no el de cuando lo atiende el móvil): un móvil lento no alarga ni acorta el golpe. */
const instante = (e: { timeStamp: number }) => e.timeStamp || performance.now()

function Tablero({
  n,
  nombres,
  encendida = null,
  pulsada = null,
  cerrado = false,
  umbral = 0,
  activo = false,
  onBajar = nada,
  onSubir = nada,
  onCancelar = nada,
}: {
  n: number
  nombres: string[]
  encendida?: number | null
  pulsada?: number | null
  cerrado?: boolean
  umbral?: number
  activo?: boolean
  onBajar?: (ficha: number, id: number, t0: number) => void
  onSubir?: (id: number, t1: number) => void
  onCancelar?: (id: number) => void
}) {
  return (
    <div
      className={`eco-tablero ${activo ? 'activo' : ''}`}
      data-n={n}
      style={{ '--umbral': `${umbral}ms` } as CSSProperties}
    >
      {FICHAS.slice(0, n).map((f, i) => (
        <button
          key={i}
          type="button"
          className={`eco-ficha ${encendida === i ? 'encendida' : ''}`}
          style={{ background: f.color }}
          disabled={!activo}
          aria-label={nombres[i]}
          onContextMenu={(e) => e.preventDefault()}
          onPointerDown={(e: PointerEvent<HTMLButtonElement>) => {
            // En el dedo, no al soltar: desde aquí se mide lo que dura el golpe.
            e.preventDefault()
            try {
              e.currentTarget.setPointerCapture(e.pointerId)
            } catch {
              /* sin captura, el pointerup llega igual si el dedo no sale de la ficha */
            }
            onBajar(i, e.pointerId, instante(e))
          }}
          onPointerUp={(e) => onSubir(e.pointerId, instante(e))}
          onPointerCancel={(e) => onCancelar(e.pointerId)}
          onKeyDown={(e: KeyboardEvent<HTMLButtonElement>) => {
            if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) {
              e.preventDefault()
              onBajar(i, -1, instante(e))
            }
          }}
          onKeyUp={(e) => {
            if (e.key === 'Enter' || e.key === ' ') onSubir(-1, instante(e))
          }}
        >
          <span className="eco-glifo" aria-hidden="true">
            {f.glifo}
            {pulsada === i ? (
              <svg className={`eco-aro ${cerrado ? 'cerrado' : ''}`} viewBox="0 0 48 48">
                <circle className="eco-aro-fondo" cx="24" cy="24" r="21" />
                <circle className="eco-aro-trazo" cx="24" cy="24" r="21" pathLength={100} />
              </svg>
            ) : null}
          </span>
        </button>
      ))}
    </div>
  )
}

export default EcoRitmicoRuntimeScreen

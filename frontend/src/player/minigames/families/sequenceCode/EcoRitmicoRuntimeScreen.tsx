import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PlayerStage } from '../../../../types/player'
import { useI18n } from '../../../../i18n/useI18n'
import { haptics, sounds } from '../../../utils/haptics'
import { useSinRetoEnPantalla } from '../../../hooks/useSinRetoEnPantalla'
import type { ResolvedMinigame } from '../../core/resolver'
import { crearReproductorDeTonos } from '../../core/tonos'
import { useRegenerarAoOcultar } from '../../core/useRegenerarAoOcultar'
import { Aviso, Cabecera, anotarPartida, usePartida } from '../logica/comun'
import { generarRonda, ritmoCorrecto } from './eco'
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
  { glifo: '■', color: '#facc15', nota: 329.6 },
  { glifo: '◆', color: '#4ade80', nota: 392.0 },
  { glifo: '★', color: '#fb923c', nota: 440.0 },
  { glifo: '✚', color: '#a78bfa', nota: 523.3 },
]

const num = (v: unknown, d: number, lo: number, hi: number) => {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? Math.max(lo, Math.min(hi, Math.round(n))) : d
}

/**
 * Eco rítmico (30/10): sustituye al Simón con su mismo id (`sequence_code`). Se enseña una secuencia de golpes con su
 * ritmo (cortos y largos) y hay que repetirla en orden y a ritmo. Sin micrófono ni red; el sonido es opcional. Un fallo
 * cuesta `penalty_s` y trae otra secuencia en la misma ronda: nunca bloquea ni devuelve al principio.
 */
export function EcoRitmicoRuntimeScreen({ resolved, stage, submitting, onWin, onComezar }: Props) {
  const { locale } = useI18n()
  const t = textosDeEco(locale)
  const cfg = resolved.config as unknown as Record<string, unknown>
  const rondas = num(cfg.levels, 6, 3, 8)
  const nFichas = num(cfg.pad_count, 4, 3, 6)
  const pulsoBase = num(cfg.step_ms, 620, 260, 1200)
  const largas = Math.max(0, Math.min(60, Number(cfg.long_notes ?? 25) || 0))
  const penaS = num(cfg.penalty_s, 20, 5, 120)

  const { partida, cambiar, olvidar } = usePartida(stage?.id, 'sequence_code')
  const ronda = Math.min(rondas, Number(partida.datos.ronda) || 1)
  const [fase, setFase] = useState<Fase>('listo')
  const [aviso, setAviso] = useState<string>('')
  const [encendida, setEncendida] = useState<number | null>(null)
  const [paso, setPaso] = useState(-1)
  const [toques, setToques] = useState<number[]>([])
  const [sonido, setSonido] = useState(cfg.sound_enabled !== false)
  const [rechazado, setRechazado] = useState(false)
  const [tonos] = useState(() => crearReproductorDeTonos())
  const timers = useRef<number[]>([])
  const tiempos = useRef<number[]>([])

  const semilla = `${semillaDelIntento(cfg, stage?.id, partida.intento)}:r${ronda}`
  // eslint-disable-next-line react-hooks/exhaustive-deps -- la config no cambia con el juego abierto
  const actual = useMemo(() => generarRonda(semilla, ronda + 2, nFichas, largas), [semilla, ronda])
  // Cada ronda un poco más rápida, sin bajar de lo que se puede seguir con el dedo.
  const pulso = Math.max(260, pulsoBase - (ronda - 1) * 20)

  const limpiar = useCallback(() => {
    timers.current.forEach((id) => window.clearTimeout(id))
    timers.current = []
    setEncendida(null)
  }, [])
  useEffect(
    () => () => {
      limpiar()
      tonos.cerrar()
    },
    [limpiar, tonos]
  )

  const fallar = (texto: string) => {
    limpiar()
    haptics.error()
    sounds.error()
    cambiar((p) => {
      p.fallos += 1
      p.intento += 1
    })
    setToques([])
    setFase('fallo')
    setAviso(texto)
  }

  // Salir a mitad (a apuntarla con calma) cuenta como un fallo y trae otra secuencia.
  useRegenerarAoOcultar(fase === 'escucha' || fase === 'turno', () => fallar(t.salio(penaS)))
  useSinRetoEnPantalla(fase !== 'escucha' && fase !== 'turno')

  const escuchar = () => {
    tonos.preparar() // el audio sólo arranca desde un toque
    limpiar()
    setFase('escucha')
    setAviso('')
    setToques([])
    tiempos.current = []
    let t0 = 450
    actual.fichas.forEach((ficha, i) => {
      const dura = actual.pulsos[i] * pulso
      timers.current.push(
        window.setTimeout(() => {
          setEncendida(ficha)
          setPaso(i)
          if (sonido) tonos.tono(FICHAS[ficha].nota, dura * 0.6)
          haptics.tick()
        }, t0),
        window.setTimeout(() => setEncendida(null), t0 + Math.min(dura * 0.6, 520))
      )
      t0 += dura
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

  const tocar = (ficha: number) => {
    if (fase !== 'turno' || submitting) return
    if (sonido) tonos.tono(FICHAS[ficha].nota, 180)
    setEncendida(ficha)
    timers.current.push(window.setTimeout(() => setEncendida(null), 160))
    const i = toques.length
    if (ficha !== actual.fichas[i]) return fallar(t.malFicha(penaS))
    tiempos.current.push(performance.now())
    const hechos = [...toques, ficha]
    setToques(hechos)
    if (hechos.length < actual.fichas.length) return haptics.tick()
    const intervalos = tiempos.current.slice(1).map((v, k) => v - tiempos.current[k])
    if (!ritmoCorrecto(actual.pulsos, intervalos, pulso)) return fallar(t.malRitmo(penaS))
    haptics.success()
    if (ronda >= rondas) {
      sounds.success()
      cambiar((p) => (p.datos.resuelto = true))
      setFase('bien')
      void ganar()
      return
    }
    setFase('bien')
    setAviso(t.bien)
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
        {sonido ? '🔊' : '🔇'}
      </button>
    </>
  )

  if (!partida.empezado) {
    return (
      <div className="lg-root">
        <Cabecera titulo={t.titulo} chips={chips}>
          {t.intro(rondas, largas > 0)}
        </Cabecera>
        <Tablero
          n={nFichas}
          encendida={null}
          activo={false}
          onTocar={() => undefined}
          nombres={t.fichas}
        />
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
  return (
    <div className="lg-root">
      <Cabecera titulo={t.titulo} chips={chips} />
      <div
        className="eco-pista"
        role="img"
        aria-label={`${t.ritmo}: ${actual.pulsos.map((p) => (p === 2 ? t.largo : t.corto)).join(', ')}`}
      >
        {actual.pulsos.map((p, i) => {
          const hecho = fase === 'turno' ? i < toques.length : resuelto || fase === 'bien'
          return (
            <i
              key={i}
              style={{ flexGrow: p }}
              className={`${hecho ? 'hecho' : ''} ${paso === i ? 'ahora' : ''}`}
              data-largo={p === 2 ? '1' : undefined}
            />
          )
        })}
      </div>
      <p className="eco-estado" aria-live="polite">
        {fase === 'escucha' ? t.escucha : fase === 'turno' ? t.turno : ''}
      </p>
      <Tablero
        n={nFichas}
        encendida={encendida}
        activo={fase === 'turno' && !submitting}
        onTocar={tocar}
        nombres={t.fichas}
      />
      {resuelto ? (
        <>
          <Aviso tono="bien">{submitting ? t.enviando : t.resuelto}</Aviso>
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
        <>
          <Aviso tono="bien">{aviso}</Aviso>
          <button type="button" className="lg-boton primary" onClick={siguiente}>
            {t.siguiente}
          </button>
        </>
      ) : fase === 'fallo' ? (
        <>
          <Aviso tono="pena">{aviso}</Aviso>
          <button type="button" className="lg-boton primary" onClick={escuchar}>
            {t.otra}
          </button>
        </>
      ) : fase === 'listo' ? (
        <button type="button" className="lg-boton primary" onClick={escuchar}>
          {t.ronda(ronda, rondas)} · {t.empezar}
        </button>
      ) : null}
    </div>
  )
}

function Tablero({
  n,
  encendida,
  activo,
  onTocar,
  nombres,
}: {
  n: number
  encendida: number | null
  activo: boolean
  onTocar: (ficha: number) => void
  nombres: string[]
}) {
  return (
    <div className={`eco-tablero ${activo ? 'activo' : ''}`} data-n={n}>
      {FICHAS.slice(0, n).map((f, i) => (
        <button
          key={i}
          type="button"
          className={`eco-ficha ${encendida === i ? 'encendida' : ''}`}
          style={{ background: f.color }}
          disabled={!activo}
          aria-label={nombres[i]}
          onPointerDown={(e) => {
            // En el dedo, no al soltar: el ritmo se mide en el golpe.
            e.preventDefault()
            onTocar(i)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              onTocar(i)
            }
          }}
        >
          <span aria-hidden="true">{f.glifo}</span>
        </button>
      ))}
    </div>
  )
}

export default EcoRitmicoRuntimeScreen

import { useMemo, useState, type CSSProperties } from 'react'
import type { PlayerStage } from '../../../../types/player'
import { useSinRetoEnPantalla } from '../../../hooks/useSinRetoEnPantalla'
import type { ResolvedMinigame } from '../../core/resolver'
import { semillaDelIntento } from '../sequenceCode/semilla'
import { Aviso, Cabecera, anotarPartida, usePartida, useTextosDeLogica } from './comun'
import { bolaPesada, pesar } from './motor'

interface Props {
  resolved: ResolvedMinigame
  stage: PlayerStage
  submitting: boolean
  onWin: (penaltyMs?: number) => Promise<void | boolean>
  onComezar?: () => void
}

type Lado = 'I' | 'D'
type Pesada = { I: number[]; D: number[]; r: -1 | 0 | 1 }

/** Balanza (30/10): una bola pesa más; encontrarla con las pesadas del nivel. La pesada sale de la semilla del jugador. */
export function BalanzaRuntimeScreen({ resolved, stage, submitting, onWin, onComezar }: Props) {
  const tx = useTextosDeLogica()
  const t = tx.balanza
  const cfg = resolved.config as unknown as Record<string, unknown>
  const bolas = Math.max(4, Math.min(27, Number(cfg.balls) || 9))
  const maxPesadas = Math.max(1, Number(cfg.weighings) || 2)
  const penaS = Math.max(0, Number(cfg.penalty_s) || 30)
  const { partida, cambiar, olvidar } = usePartida(stage?.id, 'balanza')
  // Con las reglas o ya resuelto no hay reto delante: salir de la app ahí no cuenta (como en los demás juegos).
  useSinRetoEnPantalla(!partida.empezado || partida.datos.resuelto === true)
  const rondas = Math.max(1, Number(cfg.rounds) || 3)
  const ronda = Number(partida.datos.ronda) || 1
  const semilla = `${semillaDelIntento(cfg, stage?.id, partida.intento)}${ronda > 1 ? `:r${ronda}` : ''}`
  const historial = (partida.datos.historial as Pesada[] | undefined) ?? []
  const [lados, setLados] = useState<Record<number, Lado>>({})
  const [eligiendo, setEligiendo] = useState(false)
  const [aviso, setAviso] = useState<{ tono: 'bien' | 'mal'; texto: string } | null>(null)
  const [rechazado, setRechazado] = useState(false)

  const pesada = useMemo(
    () => bolaPesada(semilla, bolas),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- la config no cambia con el juego abierto
    [semilla, bolas]
  )

  const izquierda = Object.keys(lados)
    .map(Number)
    .filter((b) => lados[b] === 'I')
  const derecha = Object.keys(lados)
    .map(Number)
    .filter((b) => lados[b] === 'D')
  const quedan = Math.max(0, maxPesadas - historial.length)
  const ultima = historial[historial.length - 1]

  const ganar = async () => {
    anotarPartida(stage?.id, 'balanza', partida, { pesadas: historial.length, rondas })
    const ok = await onWin(partida.fallos * penaS * 1000)
    if (ok === false) setRechazado(true)
    else olvidar()
  }

  const tocar = (b: number) => {
    if (submitting) return
    if (eligiendo) {
      setEligiendo(false)
      if (b === pesada && ronda < rondas) {
        setAviso({ tono: 'bien', texto: tx.interrogatorio.bien })
        cambiar((p) => {
          p.datos.ronda = ronda + 1
          p.datos.historial = []
        })
        return
      }
      if (b === pesada) {
        cambiar((p) => (p.datos.resuelto = true))
        void ganar()
        return
      }
      setAviso({ tono: 'mal', texto: t.mal(penaS) })
      setLados({})
      cambiar((p) => {
        p.fallos += 1
        p.intento += 1
        p.datos.historial = []
      })
      return
    }
    setLados((l) => {
      const siguiente = { ...l }
      if (!l[b]) siguiente[b] = 'I'
      else if (l[b] === 'I') siguiente[b] = 'D'
      else delete siguiente[b]
      return siguiente
    })
  }

  const hacerPesada = () => {
    if (!izquierda.length || !derecha.length || !quedan) return
    const r = pesar(pesada, izquierda, derecha)
    setAviso(null)
    cambiar((p) => (p.datos.historial = [...historial, { I: izquierda, D: derecha, r }]))
    setLados({})
  }

  if (!partida.empezado) {
    return (
      <div className="lg-root">
        <Cabecera
          titulo={t.titulo}
          chips={rondas > 1 ? <span className="lg-chip">{tx.ronda(1, rondas)}</span> : null}
        >
          {t.intro(bolas, maxPesadas)}
        </Cabecera>
        <button
          type="button"
          className="lg-boton primary"
          onClick={() => {
            cambiar((p) => {
              p.empezado = true
              p.t0 = Date.now()
            })
            onComezar?.()
          }}
        >
          {tx.empezar}
        </button>
      </div>
    )
  }

  const resuelto = partida.datos.resuelto === true
  // Mientras se colocan bolas la balanza está quieta; tras pesar se inclina hacia el lado que pesa (r = 1: derecha).
  const enPlatos = izquierda.length > 0 || derecha.length > 0 || !ultima
  const giro = enPlatos ? 0 : (ultima?.r ?? 0)
  const signo = (r: number) => (r === 0 ? '=' : r < 0 ? '>' : '<')
  const enPlato = (lado: Lado) =>
    enPlatos ? (lado === 'I' ? izquierda : derecha) : (ultima?.[lado] ?? [])
  const ficha = (b: number, lado?: Lado, clase = '') => (
    <span key={b} className={`lg-ficha ${clase}`} data-lado={lado}>
      {b + 1}
    </span>
  )
  return (
    <div className="lg-root">
      <Cabecera
        titulo={t.titulo}
        chips={
          <>
            {rondas > 1 ? (
              <span className="lg-chip">{tx.ronda(Math.min(ronda, rondas), rondas)}</span>
            ) : null}
            <span className="lg-chip">{t.quedan(quedan)}</span>
            {partida.fallos ? (
              <span className="lg-chip lg-chip-pena">
                {tx.penalizacion(partida.fallos * penaS)}
              </span>
            ) : null}
          </>
        }
      />
      {/* Astil de línea en SVG y dos platos-tarjeta con fichas: tras pesar baja el plato que pesa (r = 1: derecha). */}
      <div
        className="lg-tarjeta lg-escena"
        style={{ '--giro': `${giro * 6}deg`, '--baja': `${giro * 8}px` } as CSSProperties}
        role="img"
        aria-label={enPlatos ? t.titulo : t.resultado(ultima?.r ?? 0)}
        aria-live="polite"
      >
        <svg className="lg-astil" viewBox="0 0 300 40" aria-hidden="true">
          <path className="lg-astil-pie" d="M150 16 L138 38 H162 Z" />
          <g className="lg-brazo">
            <line x1="22" y1="16" x2="278" y2="16" />
            <path className="lg-gancho" d="M72 16 V40 M228 16 V40" />
            <circle cx="72" cy="16" r="4" />
            <circle cx="228" cy="16" r="4" />
          </g>
          <circle className="lg-eje" cx="150" cy="16" r="6" />
        </svg>
        <div className="lg-platos">
          {(['I', 'D'] as const).map((lado) => (
            <div key={lado} className="lg-plato" data-lado={lado}>
              <span className="lg-rotulo">{lado === 'I' ? t.izquierda : t.derecha}</span>
              <div className="lg-fichas">{enPlato(lado).map((b) => ficha(b, lado))}</div>
            </div>
          ))}
          {!enPlatos && ultima ? (
            <b className="lg-signo" data-r={ultima.r} key={historial.length}>
              {signo(ultima.r)}
            </b>
          ) : null}
        </div>
      </div>
      {historial.length ? (
        <ol className="lg-historial">
          {historial.map((h, n) => (
            <li
              key={n}
              className="lg-tarjeta lg-pesada"
              aria-label={`${n + 1}. ${t.resultado(h.r)}`}
            >
              <span className="lg-pesada-n">{n + 1}</span>
              <span className="lg-pesada-lado">
                {h.I.map((b) => ficha(b, 'I', 'lg-ficha-mini'))}
              </span>
              <b className="lg-pesada-signo" data-r={h.r}>
                {signo(h.r)}
              </b>
              <span className="lg-pesada-lado">
                {h.D.map((b) => ficha(b, 'D', 'lg-ficha-mini'))}
              </span>
            </li>
          ))}
        </ol>
      ) : null}
      {resuelto ? (
        <>
          <Aviso tono="bien">{submitting ? tx.enviando : tx.resuelto}</Aviso>
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
              {tx.reintentar}
            </button>
          ) : null}
        </>
      ) : (
        <>
          {eligiendo ? <Aviso tono="pena">{t.eligeBola}</Aviso> : null}
          <div className="lg-bolas" role="group" aria-label={t.titulo}>
            {Array.from({ length: bolas }, (_, b) => (
              <button
                key={b}
                type="button"
                className="lg-boton lg-bola"
                data-lado={eligiendo ? undefined : lados[b]}
                data-eligiendo={eligiendo || undefined}
                aria-label={`${t.bola(b)}${lados[b] ? ` · ${lados[b] === 'I' ? t.izquierda : t.derecha}` : ''}`}
                disabled={submitting}
                onClick={() => tocar(b)}
              >
                {ficha(b, eligiendo ? undefined : lados[b])}
              </button>
            ))}
          </div>
          <div className="lg-fila">
            <button
              type="button"
              className="lg-boton"
              disabled={submitting}
              onClick={() => setEligiendo((e) => !e)}
            >
              {eligiendo ? t.cancelar : t.señalar}
            </button>
            {!eligiendo ? (
              <button
                type="button"
                className="lg-boton primary"
                disabled={submitting || !quedan || !izquierda.length || !derecha.length}
                onClick={hacerPesada}
              >
                {t.pesar}
              </button>
            ) : null}
          </div>
          {aviso ? <Aviso tono={aviso.tono}>{aviso.texto}</Aviso> : null}
          {!eligiendo && quedan && (!izquierda.length || !derecha.length) ? (
            <p className="lg-pie">{t.ayuda}</p>
          ) : null}
        </>
      )}
    </div>
  )
}

export default BalanzaRuntimeScreen

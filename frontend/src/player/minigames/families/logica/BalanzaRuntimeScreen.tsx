import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { PlayerStage } from '../../../../types/player'
import { useSinRetoEnPantalla } from '../../../hooks/useSinRetoEnPantalla'
import type { ResolvedMinigame } from '../../core/resolver'
import { semillaDelIntento } from '../sequenceCode/semilla'
import {
  Aviso,
  Cabecera,
  Confeti,
  anotarPartida,
  quieto,
  usePartida,
  useTextosDeLogica,
} from './comun'
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
  // 22/11: reabierta ya resuelta (hoja cerrada con el envío rechazado o a medias): «Reintentar» tiene que estar.
  const [rechazado, setRechazado] = useState(() => partida.datos.resuelto === true)
  // Sólo vista: la bola acertada brilla un momento y la bandeja tiembla al fallar.
  const [destello, setDestello] = useState<number | null>(null)
  const [temblor, setTemblor] = useState(0)
  const raiz = useRef<HTMLDivElement>(null)
  // Dónde estaba cada bola tocada antes de moverse, para que vuele de la bandeja al plato (o de vuelta).
  const origen = useRef(new Map<number, DOMRect>())
  const sitio = (b: number, enPlato: boolean) =>
    raiz.current?.querySelector<HTMLElement>(
      enPlato ? `[data-plato-ficha="${b}"]` : `[data-tecla="${b}"] .lg-ficha`
    ) ?? null

  useLayoutEffect(() => {
    if (!origen.current.size) return
    const vuelos = [...origen.current]
    origen.current.clear()
    if (quieto()) return
    for (const [b, desde] of vuelos) {
      const el = sitio(b, Boolean(lados[b]))
      if (!el?.animate) continue
      const a = el.getBoundingClientRect()
      const dx = desde.left + desde.width / 2 - (a.left + a.width / 2)
      const dy = desde.top + desde.height / 2 - (a.top + a.height / 2)
      el.animate(
        [
          { transform: `translate(${dx}px, ${dy}px) scale(${desde.width / a.width})` },
          { transform: 'none', offset: 0.62 },
          { transform: 'translateY(-7px)', offset: 0.8 },
          { transform: 'none' },
        ],
        { duration: 480, easing: 'cubic-bezier(0.45, 0, 0.25, 1)' }
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sólo cuando cambian los platos
  }, [lados])

  useEffect(() => {
    if (destello === null) return
    const id = window.setTimeout(() => setDestello(null), 1100)
    return () => window.clearTimeout(id)
  }, [destello])

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
      if (b === pesada) setDestello(b)
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
      setTemblor((n) => n + 1)
      setLados({})
      cambiar((p) => {
        p.fallos += 1
        p.intento += 1
        p.datos.historial = []
      })
      return
    }
    const el = sitio(b, Boolean(lados[b]))
    if (el) origen.current.set(b, el.getBoundingClientRect())
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
  const vaiven = {
    '--giro': giro,
    // Antes de pesar los platos siempre están a nivel; al volver a colocar parte de la última inclinación.
    '--desde': giro === 0 ? (ultima?.r ?? 0) : 0,
  } as CSSProperties
  return (
    <div className="lg-root" ref={raiz}>
      <Cabecera
        titulo={t.titulo}
        chips={
          <>
            {rondas > 1 ? (
              <span className="lg-chip">{tx.ronda(Math.min(ronda, rondas), rondas)}</span>
            ) : null}
            {/* 22/11: las pesadas, también a la vista: un punto por pesada (lleno = queda). */}
            <span className="lg-chip lg-chip-pesadas">
              <span className="lg-puntos" aria-hidden="true">
                {Array.from({ length: maxPesadas }, (_, i) => (
                  <i key={i} data-usada={i >= quedan || undefined} />
                ))}
              </span>
              {t.quedan(quedan)}
            </span>
            {partida.fallos ? (
              <span className="lg-chip lg-chip-pena">
                {tx.penalizacion(partida.fallos * penaS)}
              </span>
            ) : null}
          </>
        }
      />
      {/* 22/11: balanza de dos platos dibujada entera. El astil (SVG) gira sobre el fiel y cada plato cuelga de su
          gancho con dos cuerdas y un cuenco; las bolas puestas se apilan dentro del cuenco. Tras pesar se balancea y
          se asienta del lado que pesa (r = 1: derecha). El nombre de la animación alterna para que vuelva a empezar. */}
      <div
        className="lg-tarjeta lg-escena"
        style={vaiven}
        data-vaiven={giro === 0 ? 'a' : 'b'}
        data-r={!enPlatos && ultima ? ultima.r : undefined}
        role="img"
        aria-label={enPlatos ? t.titulo : t.resultado(ultima?.r ?? 0)}
        aria-live="polite"
      >
        <div className="lg-balanza">
          <svg className="lg-astil" viewBox="0 0 300 140" aria-hidden="true">
            <path className="lg-astil-pie" d="M150 30 L150 122" />
            <path className="lg-astil-base" d="M128 136 Q128 123 141 123 H159 Q172 123 172 136 Z" />
            <path className="lg-escala" d="M131 13 A24 24 0 0 1 169 13" />
            <g className="lg-brazo">
              <line className="lg-fiel" x1="150" y1="30" x2="150" y2="9" />
              <path className="lg-viga" d="M64 30 L150 26 L236 30" />
              <circle className="lg-gancho" cx="64" cy="30" r="4" />
              <circle className="lg-gancho" cx="236" cy="30" r="4" />
            </g>
            <circle className="lg-eje" cx="150" cy="30" r="6.5" />
          </svg>
          {(['I', 'D'] as const).map((lado) => {
            const bolasDelPlato = enPlato(lado)
            return (
              <div key={lado} className="lg-plato" data-lado={lado}>
                <svg className="lg-cuerdas" viewBox="0 0 112 100" aria-hidden="true">
                  <path d="M56 1 L5 83 M56 1 L107 83" />
                </svg>
                <div className="lg-fichas" data-lleno={bolasDelPlato.length > 8 || undefined}>
                  {bolasDelPlato.map((b) => (
                    <span key={b} className="lg-ficha" data-lado={lado} data-plato-ficha={b}>
                      {b + 1}
                    </span>
                  ))}
                </div>
                <svg className="lg-cuenco" viewBox="0 0 112 20" aria-hidden="true">
                  <path d="M1 3 H111 Q106 19 56 19 Q6 19 1 3 Z" />
                </svg>
              </div>
            )
          })}
        </div>
        {/* Tras pesar, el resultado con palabras ocupa el pie (a 360 no cabía entre los dos rótulos). */}
        <div className="lg-pie-balanza">
          {!enPlatos && ultima ? (
            <b className="lg-veredicto" data-r={ultima.r} key={historial.length}>
              {t.resultado(ultima.r)}
            </b>
          ) : (
            <>
              <span className="lg-rotulo" data-lado="I">
                {t.izquierda}
              </span>
              <span className="lg-rotulo" data-lado="D">
                {t.derecha}
              </span>
            </>
          )}
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
          <div className="lg-premio">
            <span className="lg-ficha lg-ficha-premio">
              {pesada + 1}
              <Confeti />
            </span>
          </div>
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
          <div
            className="lg-bolas"
            role="group"
            aria-label={t.titulo}
            data-temblor={temblor ? temblor % 2 : undefined}
            data-eligiendo={eligiendo || undefined}
            // 5/11: con muchas bolas (N3: 18), seis por fila y algo más pequeñas: caben holgadas a 360.
            data-muchas={bolas > 12 ? '1' : undefined}
          >
            {Array.from({ length: bolas }, (_, b) => (
              <button
                key={b}
                type="button"
                className="lg-bola"
                data-tecla={b}
                data-n={b + 1}
                data-lado={eligiendo ? undefined : lados[b]}
                data-eligiendo={eligiendo || undefined}
                data-destello={destello === b || undefined}
                aria-label={`${t.bola(b)}${lados[b] ? ` · ${lados[b] === 'I' ? t.izquierda : t.derecha}` : ''}`}
                disabled={submitting}
                onClick={() => tocar(b)}
              >
                {ficha(b)}
                {destello === b ? <Confeti /> : null}
              </button>
            ))}
          </div>
          <div className="lg-fila">
            {/* 22/11: sin pesadas, señalar es lo único que queda: pasa a ser el botón azul y «Pesar» se va. */}
            <button
              type="button"
              className={!eligiendo && !quedan ? 'lg-boton primary' : 'lg-boton'}
              disabled={submitting}
              onClick={() => setEligiendo((e) => !e)}
            >
              {eligiendo ? t.cancelar : t.señalar}
            </button>
            {!eligiendo && quedan > 0 ? (
              <button
                type="button"
                className="lg-boton primary"
                disabled={submitting || !izquierda.length || !derecha.length}
                onClick={hacerPesada}
              >
                {t.pesar}
              </button>
            ) : null}
          </div>
          {aviso ? <Aviso tono={aviso.tono}>{aviso.texto}</Aviso> : null}
          {/* 22/11: `quedan > 0`, no `quedan`: sin pesadas pintaba un «0» suelto bajo los botones. */}
          {!eligiendo && quedan > 0 && (!izquierda.length || !derecha.length) ? (
            <p className="lg-pie">{t.ayuda}</p>
          ) : null}
        </>
      )}
    </div>
  )
}

export default BalanzaRuntimeScreen

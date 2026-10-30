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
import { generarCaso } from './motor'

interface Props {
  resolved: ResolvedMinigame
  stage: PlayerStage
  submitting: boolean
  onWin: (penaltyMs?: number) => Promise<void | boolean>
  onComezar?: () => void
}

/** Caso escrito por el organizador en el panel (`casos_propios`, lo limpia minigames.py). */
type CasoPropio = {
  pregunta: string
  regla: string
  sospechosos: { nombre: string; frase: string }[]
  culpable: number
}

/** Un tono por sospechoso para el avatar (no son colores de estado: ni verde ni ámbar ni rojo). */
const TONOS = ['#7dd3fc', '#c4b5fd', '#f9a8d4', '#a5b4fc', '#fbcfe8', '#e9d5ff']

/**
 * Interrogatorio (30/10): casos de «sólo uno dice la verdad» generados por semilla, con solución única. Si el
 * organizador escribió casos propios se juegan ésos, en orden, y un fallo repite el mismo caso.
 */
export function InterrogatorioRuntimeScreen({
  resolved,
  stage,
  submitting,
  onWin,
  onComezar,
}: Props) {
  const tx = useTextosDeLogica()
  const t = tx.interrogatorio
  const cfg = resolved.config as unknown as Record<string, unknown>
  const propios = Array.isArray(cfg.casos_propios) ? (cfg.casos_propios as CasoPropio[]) : []
  const casos = propios.length || Math.max(1, Number(cfg.cases) || 5)
  const penaS = Math.max(0, Number(cfg.penalty_s) || 30)
  const { partida, cambiar, olvidar } = usePartida(stage?.id, 'interrogatorio')
  // Con las reglas o ya resuelto no hay reto delante: salir de la app ahí no cuenta (como en los demás juegos).
  useSinRetoEnPantalla(!partida.empezado || partida.datos.resuelto === true)
  const caso = Number(partida.datos.caso) || 1
  const [aviso, setAviso] = useState<{ tono: 'bien' | 'mal'; texto: string } | null>(null)
  const [rechazado, setRechazado] = useState(false)
  // Se señala primero y se acusa con el botón azul: un toque suelto no cuesta 30 s.
  const [señalado, setSeñalado] = useState<{ k: number; clave: string } | null>(null)
  // Sólo vista: la fila acusada en falso tiembla antes de pasar al caso siguiente, y el acierto deja un sello.
  const [fallo, setFallo] = useState<number | null>(null)
  const [sello, setSello] = useState<{ nombre: string; tono: string; n: number } | null>(null)
  const raiz = useRef<HTMLDivElement>(null)
  // La llave vuela desde donde estaba (la pregunta o el hueco de otro sospechoso) hasta donde está ahora.
  const desde = useRef<DOMRect | null>(null)
  const llave = (k: number | null) =>
    raiz.current?.querySelector<SVGElement>(
      k === null ? '.lg-llave-pregunta' : `[data-hueco="${k}"] svg`
    ) ?? null

  const generado = useMemo(
    () =>
      generarCaso(
        `${semillaDelIntento(cfg, stage?.id, partida.intento)}:caso${caso}`,
        Number(cfg.suspects) || 4,
        cfg.meta === true,
        cfg.regla_mixta === true
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- la config no cambia con el juego abierto
    [cfg.seed, stage?.id, partida.intento, caso]
  )
  const propio = propios[caso - 1]
  const actual = propio
    ? {
        nombres: propio.sospechosos.map((s) => s.nombre),
        frases: propio.sospechosos.map((s) => s.frase),
        regla: propio.regla,
        pregunta: propio.pregunta || t.pregunta,
        culpable: propio.culpable,
      }
    : {
        nombres: generado.nombres,
        frases: generado.dichos.map((d, i) => t.dicho(d, generado.nombres, i)),
        regla: t.regla[generado.regla],
        pregunta: t.pregunta,
        culpable: generado.culpable,
      }

  const ganar = async () => {
    anotarPartida(stage?.id, 'interrogatorio', partida, { casos })
    const ok = await onWin(partida.fallos * penaS * 1000)
    if (ok === false) setRechazado(true)
    else olvidar()
  }

  const sel0 = señalado?.clave === `${caso}-${partida.intento}` ? señalado.k : null
  useLayoutEffect(() => {
    const origen = desde.current
    desde.current = null
    const el = llave(sel0)
    if (!origen || !el?.animate || quieto()) return
    const a = el.getBoundingClientRect()
    const dx = origen.left + origen.width / 2 - (a.left + a.width / 2)
    const dy = origen.top + origen.height / 2 - (a.top + a.height / 2)
    el.animate(
      [
        { transform: `translate(${dx}px, ${dy}px) rotate(-40deg)`, opacity: 1 },
        { transform: 'none', opacity: 1, offset: 0.6 },
        { transform: 'scale(1.3)', opacity: 1, offset: 0.78 },
        { transform: 'none', opacity: 1 },
      ],
      { duration: 480, easing: 'cubic-bezier(0.45, 0, 0.25, 1)' }
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sólo cuando la llave cambia de sitio
  }, [sel0, caso, partida.intento])

  useEffect(() => {
    if (!sello) return
    const id = window.setTimeout(() => setSello(null), 1600)
    return () => window.clearTimeout(id)
  }, [sello])

  const mover = (k: number | null) => {
    desde.current = llave(sel0)?.getBoundingClientRect() ?? null
    setSeñalado(k === null ? null : { k, clave: `${caso}-${partida.intento}` })
  }

  const acusar = (k: number) => {
    if (fallo !== null) return
    mover(null)
    if (k === actual.culpable) {
      setSello({ nombre: actual.nombres[k], tono: TONOS[k % TONOS.length], n: Date.now() })
      elegir(k)
      return
    }
    // ponytail: el fallo se anota 450 ms después para que se vea el temblor; ya cuesta penaS segundos.
    setFallo(k)
    window.setTimeout(() => {
      setFallo(null)
      elegir(k)
    }, 450)
  }

  const elegir = (k: number) => {
    if (submitting) return
    if (k === actual.culpable) {
      if (caso >= casos) {
        cambiar((p) => (p.datos.resuelto = true))
        void ganar()
        return
      }
      setAviso({ tono: 'bien', texto: t.bien })
      cambiar((p) => (p.datos.caso = caso + 1))
      return
    }
    setAviso({ tono: 'mal', texto: propio ? t.malPropio(penaS) : t.mal(penaS) })
    cambiar((p) => {
      p.fallos += 1
      p.intento += 1
    })
  }

  if (!partida.empezado) {
    return (
      <div className="lg-root">
        <Cabecera titulo={t.titulo}>{t.intro}</Cabecera>
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
  const clave = `${caso}-${partida.intento}`
  const sel = sel0
  const inicial = (n: string) => n.trim().charAt(0).toUpperCase()
  return (
    <div className="lg-root" ref={raiz}>
      <Cabecera
        titulo={t.titulo}
        chips={
          <>
            <span className="lg-chip">{t.caso(Math.min(caso, casos), casos)}</span>
            {partida.fallos ? (
              <span className="lg-chip lg-chip-pena">
                {tx.penalizacion(partida.fallos * penaS)}
              </span>
            ) : null}
          </>
        }
      />
      {actual.regla ? (
        <p className="lg-regla">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 5h16v10H9l-5 4z" />
            <path d="M9 10h6" />
          </svg>
          {actual.regla}
        </p>
      ) : null}
      <p className="lg-pregunta">
        <svg
          className="lg-llave-pregunta"
          data-fuera={sel !== null || undefined}
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle cx="8" cy="12" r="4" />
          <path d="M12 12h9M18 12v3M21 12v2" />
        </svg>
        {actual.pregunta}
      </p>
      <ul className="lg-careo" key={clave}>
        {actual.nombres.map((nombre, i) => (
          <li key={i} style={{ animationDelay: `${i * 80}ms` }}>
            <button
              type="button"
              className="lg-tarjeta lg-sospechoso"
              aria-pressed={sel === i}
              data-fallo={fallo === i || undefined}
              data-culpable={(resuelto && i === actual.culpable) || undefined}
              disabled={submitting || resuelto || fallo !== null}
              style={{ '--tono': TONOS[i % TONOS.length] } as CSSProperties}
              onClick={() => {
                setAviso(null)
                mover(sel === i ? null : i)
              }}
            >
              <span className="lg-ficha lg-cara" aria-hidden="true">
                {inicial(nombre)}
                {resuelto && i === actual.culpable ? <Confeti /> : null}
              </span>
              <span className="lg-quien">
                <span className="lg-nombre">{nombre}</span>
                {actual.frases[i] ? <q className="lg-dice">{actual.frases[i]}</q> : null}
              </span>
              {resuelto && i === actual.culpable ? (
                <b className="lg-sello lg-sello-fila">{t.culpable}</b>
              ) : null}
              <span className="lg-hueco-llave" data-hueco={i} aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <circle cx="8" cy="12" r="4" />
                  <path d="M12 12h9M18 12v3M21 12v2" />
                </svg>
              </span>
            </button>
          </li>
        ))}
      </ul>
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
          <button
            type="button"
            className="lg-boton primary"
            disabled={submitting || sel === null || fallo !== null}
            onClick={() => {
              if (sel !== null) acusar(sel)
            }}
          >
            {sel === null ? t.señala : t.acusar(actual.nombres[sel])}
          </button>
          {sello ? (
            <p className="lg-acierto" role="status" key={sello.n}>
              <span
                className="lg-ficha lg-cara"
                style={{ '--tono': sello.tono } as CSSProperties}
                aria-hidden="true"
              >
                {inicial(sello.nombre)}
                <Confeti />
              </span>
              <b className="lg-sello">{t.culpable}</b>
              <span>{sello.nombre}</span>
            </p>
          ) : aviso ? (
            <Aviso tono={aviso.tono}>{aviso.texto}</Aviso>
          ) : null}
        </>
      )}
    </div>
  )
}

export default InterrogatorioRuntimeScreen

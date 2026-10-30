import { useMemo, useState, type CSSProperties } from 'react'
import type { PlayerStage } from '../../../../types/player'
import { useSinRetoEnPantalla } from '../../../hooks/useSinRetoEnPantalla'
import type { ResolvedMinigame } from '../../core/resolver'
import { semillaDelIntento } from '../sequenceCode/semilla'
import { Aviso, Cabecera, anotarPartida, usePartida, useTextosDeLogica } from './comun'
import { generarCodigo, pistas } from './motor'

interface Props {
  resolved: ResolvedMinigame
  stage: PlayerStage
  submitting: boolean
  onWin: (penaltyMs?: number) => Promise<void | boolean>
  onComezar?: () => void
}

/** Símbolo + color: se distinguen también sin ver colores. */
const GLIFOS = ['●', '▲', '■', '◆', '★', '✚', '♥', '☾']
const COLORES = [
  '#22d3ee',
  '#f472b6',
  '#facc15',
  '#4ade80',
  '#fb923c',
  '#a78bfa',
  '#f87171',
  '#e2e8f0',
]

function Simbolo({ i, etiqueta }: { i: number; etiqueta: string }) {
  return (
    <span
      className="lg-simbolo"
      style={{ background: COLORES[i] }}
      role="img"
      aria-label={etiqueta}
    >
      {GLIFOS[i]}
    </span>
  )
}

/** Mastermind (30/10): código secreto por semilla de jugador; pistas de bien colocados y en otro sitio. */
export function MastermindRuntimeScreen({ resolved, stage, submitting, onWin, onComezar }: Props) {
  const tx = useTextosDeLogica()
  const t = tx.mastermind
  const cfg = resolved.config as unknown as Record<string, unknown>
  const largo = Math.max(3, Math.min(5, Number(cfg.code_length) || 4))
  const simbolos = Math.max(4, Math.min(8, Number(cfg.symbols) || 6))
  const maximo = Math.max(1, Number(cfg.max_attempts) || 10)
  const repetir = cfg.repeats === true
  const penaS = Math.max(0, Number(cfg.penalty_s) || 30)
  const { partida, cambiar, olvidar } = usePartida(stage?.id, 'mastermind')
  const rondas = Math.max(1, Number(cfg.rounds) || 2)
  const ronda = Number(partida.datos.ronda) || 1
  const semilla = `${semillaDelIntento(cfg, stage?.id, partida.intento)}${ronda > 1 ? `:r${ronda}` : ''}`
  const intentos = (partida.datos.intentos as number[][] | undefined) ?? []
  const [fila, setFila] = useState<number[]>([])
  const [aviso, setAviso] = useState<{ tono: 'bien' | 'pena'; texto: string } | null>(null)
  const [rechazado, setRechazado] = useState(false)
  // Con las reglas o ya resuelto no hay reto delante: salir de la app ahí no cuenta (como en los demás juegos).
  useSinRetoEnPantalla(!partida.empezado || partida.datos.resuelto === true)

  const secreto = useMemo(
    () => generarCodigo(semilla, largo, simbolos, repetir),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- la config no cambia con el juego abierto
    [semilla, largo, simbolos, repetir]
  )

  const ganar = async () => {
    anotarPartida(stage?.id, 'mastermind', partida, { intentos: intentos.length + 1, rondas })
    const ok = await onWin(partida.fallos * penaS * 1000)
    if (ok === false) setRechazado(true)
    else olvidar()
  }

  const probar = () => {
    if (fila.length !== largo || submitting) return
    const p = pistas(secreto, fila)
    setFila([])
    if (p.exactas === largo && ronda < rondas) {
      setAviso({ tono: 'bien', texto: tx.interrogatorio.bien })
      cambiar((q) => {
        q.datos.ronda = ronda + 1
        q.datos.intentos = []
      })
      return
    }
    if (p.exactas === largo) {
      cambiar((q) => {
        q.datos.intentos = [...intentos, fila]
        q.datos.resuelto = true
      })
      void ganar()
      return
    }
    if (intentos.length + 1 >= maximo) {
      setAviso({ tono: 'pena', texto: t.agotado(penaS) })
      cambiar((q) => {
        q.fallos += 1
        q.intento += 1
        q.datos.intentos = []
      })
      return
    }
    setAviso(null)
    cambiar((q) => (q.datos.intentos = [...intentos, fila]))
  }

  if (!partida.empezado) {
    return (
      <div className="lg-root">
        <Cabecera
          titulo={t.titulo}
          chips={rondas > 1 ? <span className="lg-chip">{tx.ronda(1, rondas)}</span> : null}
        >
          {t.intro(largo, maximo, repetir)}
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
  return (
    <div className="lg-root">
      <Cabecera
        titulo={t.titulo}
        chips={
          <>
            {rondas > 1 ? (
              <span className="lg-chip">{tx.ronda(Math.min(ronda, rondas), rondas)}</span>
            ) : null}
            <span className="lg-chip">{t.quedan(Math.max(0, maximo - intentos.length))}</span>
            {partida.fallos ? (
              <span className="lg-chip lg-chip-pena">
                {tx.penalizacion(partida.fallos * penaS)}
              </span>
            ) : null}
          </>
        }
      />
      <div className="lg-intentos" aria-live="polite">
        {intentos.map((intento, n) => {
          const p = pistas(secreto, intento)
          return (
            <div key={n} className="lg-tarjeta lg-intento">
              <span style={{ display: 'flex', gap: 4 }}>
                {intento.map((s, i) => (
                  <Simbolo key={i} i={s} etiqueta={t.simbolo(s)} />
                ))}
              </span>
              <span
                className="lg-marcas"
                style={{ '--columnas': Math.ceil(largo / 2) } as CSSProperties}
                role="img"
                aria-label={`${p.exactas} ${t.exactas}, ${p.casi} ${t.casi}`}
              >
                {Array.from({ length: largo }, (_, k) => (
                  <span
                    key={k}
                    className="lg-clavija"
                    data-tipo={k < p.exactas ? 'exacta' : k < p.exactas + p.casi ? 'casi' : undefined}
                    style={{ animationDelay: `${k * 110}ms` }}
                  />
                ))}
              </span>
            </div>
          )
        })}
      </div>
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
          <div className="lg-tarjeta" style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
            {Array.from({ length: largo }, (_, i) =>
              fila[i] === undefined ? (
                <span key={i} className="lg-hueco" aria-hidden="true" />
              ) : (
                <Simbolo key={i} i={fila[i]} etiqueta={t.simbolo(fila[i])} />
              )
            )}
          </div>
          <div className="lg-paleta" role="group" aria-label={t.titulo}>
            {Array.from({ length: simbolos }, (_, s) => (
              <button
                key={s}
                type="button"
                className="lg-boton"
                aria-label={t.simbolo(s)}
                disabled={submitting || fila.length >= largo || (!repetir && fila.includes(s))}
                onClick={() => setFila((f) => [...f, s])}
              >
                <Simbolo i={s} etiqueta="" />
              </button>
            ))}
          </div>
          <div className="lg-fila">
            <button
              type="button"
              className="lg-boton"
              disabled={!fila.length || submitting}
              onClick={() => setFila((f) => f.slice(0, -1))}
            >
              {t.borrar}
            </button>
            <button
              type="button"
              className="lg-boton primary"
              disabled={fila.length !== largo || submitting}
              onClick={probar}
            >
              {t.probar}
            </button>
          </div>
          {aviso ? <Aviso tono={aviso.tono}>{aviso.texto}</Aviso> : null}
          <p className="lg-pie">
            <span className="lg-exacta">●</span> {t.exactas} · <span className="lg-casi">○</span>{' '}
            {t.casi}
          </p>
        </>
      )}
    </div>
  )
}

export default MastermindRuntimeScreen

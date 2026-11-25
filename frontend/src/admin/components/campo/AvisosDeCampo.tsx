import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { AdminReactOverviewStage } from '../../lib/adminApi'
import {
  TARJETAS_DE_ENTRADA,
  TEXTO_GRAVEDAD,
  agruparAvisos,
  contarGruposDeAvisos,
  filtrarGrupos,
  fraseDeAviso,
  horaCorta,
  resumenDeGrupo,
  type AvisoDeCampo,
  type FiltroDeAvisos,
  type GrupoDeAvisos,
} from '../../lib/campo'

type Props = {
  avisos: AvisoDeCampo[] | null
  cargando: boolean
  error: string | null
  stages: AdminReactOverviewStage[]
  /** Sólo los de un jugador (desde su ficha), o todos. */
  soloDe?: { id: string; nombre: string } | null
  estado: React.ReactNode
  disco: (profileId: string, lado?: 'chico') => React.ReactNode
  onFicha: (profileId: string) => void
  /** Una tarjeta = un grupo (jugador y motivo): se marcan todos sus avisos sin revisar. */
  onRevisado: (grupo: GrupoDeAvisos) => void
  onPenalizar: (grupo: GrupoDeAvisos, segundos: number) => void
  onQuitarFiltro: () => void
  onRecargar: () => void
}

const OPCIONES_DE_PENALIZACION = [60, 120, 300]

/**
 * Los avisos del antitrampa como tarjetas (24/11, panel de campo): quién y cuándo, la gravedad escrita (Alta, Media, Nota),
 * la frase con los números de la prueba y tres acciones del ancho del pulgar: abrir su ficha, penalizar (suma tiempo por
 * la cola de siempre) y marcar revisado (se guarda en el servidor y deja de contar en el botón).
 */
export default function AvisosDeCampo(props: Props) {
  const { avisos, cargando, error, stages, soloDe, estado, disco, onFicha, onRevisado, onPenalizar, onQuitarFiltro, onRecargar } = props
  const [filtro, setFiltro] = useState<FiltroDeAvisos>('revisar')
  const [penalizando, setPenalizando] = useState<GrupoDeAvisos | null>(null)
  const [segundos, setSegundos] = useState(60)
  const [todasLasTarjetas, setTodasLasTarjetas] = useState(false)
  const grupos = useMemo(
    () => agruparAvisos((avisos || []).filter((a: AvisoDeCampo) => !soloDe || a.profileId === soloDe.id), stages),
    [avisos, soloDe, stages]
  )
  const cuenta = contarGruposDeAvisos(grupos)
  const enteras = filtrarGrupos(grupos, filtro)
  // 24/11 (panel 2): con 15 jugadores la lista no inunda: las 8 de más confianza y «Ver N más».
  const lista = todasLasTarjetas || soloDe ? enteras : enteras.slice(0, TARJETAS_DE_ENTRADA)

  return (
    <section className="campo-panel campo-avisos" aria-label="Avisos">
      <header className="campo-panel-cabeza">
        <div className="campo-panel-titulo">
          <h2>{soloDe ? `Avisos de ${soloDe.nombre}` : 'Avisos'}</h2>
          {estado}
        </div>
        <div className="campo-filtros" role="group" aria-label="Qué avisos ver">
          {(
            [
              ['revisar', 'Para revisar'],
              ['notas', 'Notas'],
              ['revisados', 'Revisados'],
            ] as const
          ).map(([clave, texto]) => (
            <button
              key={clave}
              type="button"
              className="campo-filtro"
              aria-pressed={filtro === clave}
              onClick={() => {
                setFiltro(clave)
                setTodasLasTarjetas(false)
              }}
            >
              {texto} <span className="campo-num">{cuenta[clave]}</span>
            </button>
          ))}
        </div>
        {soloDe ? (
          <button type="button" className="campo-enlace" onClick={onQuitarFiltro}>
            Ver los de todos
          </button>
        ) : null}
      </header>

      <div className="campo-panel-cuerpo">
        {error ? (
          <div className="campo-vacio" role="alert">
            <strong>No se pudieron traer los avisos</strong>
            <span>{error}</span>
            <button type="button" className="campo-boton" onClick={onRecargar}>
              Reintentar
            </button>
          </div>
        ) : avisos === null && cargando ? (
          <p className="campo-vacio" role="status">
            Cargando avisos…
          </p>
        ) : lista.length === 0 ? (
          <div className="campo-vacio">
            <strong>{filtro === 'revisar' ? 'Nada que revisar' : filtro === 'notas' ? 'Sin notas' : 'Ninguno revisado todavía'}</strong>
            <span>
              {filtro === 'revisar'
                ? 'El servidor avisa aquí de velocidades imposibles, juegos superados demasiado rápido, avances lejos del nodo o GPS que no parece un GPS.'
                : filtro === 'notas'
                  ? 'Las notas no acusan a nadie: sin GPS, modo prueba, posición manual o un nodo pasado desde el panel.'
                  : 'Lo que marques como revisado o penalizado queda aquí.'}
            </span>
          </div>
        ) : (
          <ul className="campo-tarjetas">
            {lista.map((g) => {
              const a = g.ultimo
              const { titulo, frase } = fraseDeAviso(a.s, stages)
              const extra = resumenDeGrupo(g)
              return (
                <li key={g.clave} className={`campo-tarjeta ${g.gravedad}`}>
                  <div className="campo-tarjeta-cabeza">
                    {disco(g.profileId, 'chico')}
                    <p>
                      <strong>{g.nombre}</strong> <span className="campo-num">· {horaCorta(a.s.at)}</span>
                    </p>
                    <span className={`campo-gravedad ${g.gravedad}`} title={`Confianza ${Math.round(g.confianza * 100)} %`}>
                      {TEXTO_GRAVEDAD[g.gravedad]}
                      {g.gravedad !== 'nota' ? <small className="campo-num"> {Math.round(g.confianza * 100)} %</small> : null}
                    </span>
                  </div>
                  <p className="campo-tarjeta-frase">
                    <strong>{titulo}.</strong> {frase}
                    {extra ? <span className="campo-tarjeta-veces campo-num"> {extra}.</span> : null}
                  </p>
                  {g.revisado ? (
                    <p className="campo-tarjeta-hecho">
                      {a.s.revisada_como === 'penalizado' ? 'Penalizado' : 'Revisado'}
                      {a.s.revisada_en ? ` a las ${horaCorta(a.s.revisada_en)}` : ''}
                    </p>
                  ) : null}
                  <div className="campo-tarjeta-acciones">
                    <button type="button" onClick={() => onFicha(g.profileId)}>
                      Ficha
                    </button>
                    <button
                      type="button"
                      disabled={g.revisado}
                      onClick={() => {
                        setSegundos(60)
                        setPenalizando(g)
                      }}
                    >
                      Penalizar
                    </button>
                    <button type="button" disabled={g.revisado} onClick={() => onRevisado(g)}>
                      Revisado
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
        {lista.length < enteras.length ? (
          <button type="button" className="campo-boton campo-ver-mas" onClick={() => setTodasLasTarjetas(true)}>
            Ver {enteras.length - lista.length} más
          </button>
        ) : null}
      </div>

      {penalizando
        ? createPortal(
            <div
              className="r8-hoja-fondo"
              onClick={(e) => {
                if (e.target === e.currentTarget) setPenalizando(null)
              }}
            >
              <div
                className="r8-hoja"
                role="dialog"
                aria-modal="true"
                aria-label={`Penalizar a ${penalizando.nombre}`}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setPenalizando(null)
                }}
              >
                <h3>Penalizar a {penalizando.nombre}</h3>
                <p>
                  Se suma tiempo a su total por «{fraseDeAviso(penalizando.ultimo.s, stages).titulo.toLowerCase()}»
                  {penalizando.veces > 1 ? ` (una sola vez por los ${penalizando.veces} avisos)` : ''} y el aviso queda como
                  penalizado. Sin cobertura se envía solo al volver.
                </p>
                <fieldset className="r8-opciones">
                  <legend>Tiempo que se le suma</legend>
                  {OPCIONES_DE_PENALIZACION.map((s) => (
                    <label key={s} className="r8-opcion">
                      <input type="radio" name="penalizacion" checked={segundos === s} onChange={() => setSegundos(s)} />
                      <strong>+{s / 60} min</strong>
                    </label>
                  ))}
                </fieldset>
                <div className="r8-pie">
                  <button type="button" className="r8-boton" onClick={() => setPenalizando(null)}>
                    <strong>Cancelar</strong>
                  </button>
                  <button
                    type="button"
                    className="r8-boton primario"
                    onClick={() => {
                      onPenalizar(penalizando, segundos)
                      setPenalizando(null)
                    }}
                  >
                    <strong>Sumar {segundos / 60} min</strong>
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </section>
  )
}

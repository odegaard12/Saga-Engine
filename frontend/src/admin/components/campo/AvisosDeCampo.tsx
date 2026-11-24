import { useState } from 'react'
import { createPortal } from 'react-dom'
import type { AdminReactOverviewStage } from '../../lib/adminApi'
import {
  TEXTO_GRAVEDAD,
  contarAvisos,
  filtrarAvisos,
  fraseDeAviso,
  horaCorta,
  type AvisoDeCampo,
  type FiltroDeAvisos,
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
  onRevisado: (aviso: AvisoDeCampo) => void
  onPenalizar: (aviso: AvisoDeCampo, segundos: number) => void
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
  const [penalizando, setPenalizando] = useState<AvisoDeCampo | null>(null)
  const [segundos, setSegundos] = useState(60)
  const todos = (avisos || []).filter((a) => !soloDe || a.profileId === soloDe.id)
  const cuenta = contarAvisos(todos)
  const lista = filtrarAvisos(todos, filtro)

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
              onClick={() => setFiltro(clave)}
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
                ? 'El servidor avisa aquí de velocidades imposibles, juegos superados demasiado rápido o avances lejos del nodo.'
                : filtro === 'notas'
                  ? 'Las notas no acusan a nadie: sin GPS, modo prueba o posición manual.'
                  : 'Lo que marques como revisado o penalizado queda aquí.'}
            </span>
          </div>
        ) : (
          <ul className="campo-tarjetas">
            {lista.map((a) => {
              const { titulo, frase } = fraseDeAviso(a.s, stages)
              return (
                <li key={a.clave} className={`campo-tarjeta ${a.gravedad}`}>
                  <div className="campo-tarjeta-cabeza">
                    {disco(a.profileId, 'chico')}
                    <p>
                      <strong>{a.nombre}</strong> <span className="campo-num">· {horaCorta(a.s.at)}</span>
                    </p>
                    <span className={`campo-gravedad ${a.gravedad}`}>{TEXTO_GRAVEDAD[a.gravedad]}</span>
                  </div>
                  <p className="campo-tarjeta-frase">
                    <strong>{titulo}.</strong> {frase}
                  </p>
                  {a.revisado ? (
                    <p className="campo-tarjeta-hecho">
                      {a.s.revisada_como === 'penalizado' ? 'Penalizado' : 'Revisado'}
                      {a.s.revisada_en ? ` a las ${horaCorta(a.s.revisada_en)}` : ''}
                    </p>
                  ) : null}
                  <div className="campo-tarjeta-acciones">
                    <button type="button" onClick={() => onFicha(a.profileId)}>
                      Ficha
                    </button>
                    <button
                      type="button"
                      disabled={a.revisado}
                      onClick={() => {
                        setSegundos(60)
                        setPenalizando(a)
                      }}
                    >
                      Penalizar
                    </button>
                    <button type="button" disabled={a.revisado} onClick={() => onRevisado(a)}>
                      Revisado
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
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
                  Se suma tiempo a su total por «{fraseDeAviso(penalizando.s, stages).titulo.toLowerCase()}» y el aviso queda como
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

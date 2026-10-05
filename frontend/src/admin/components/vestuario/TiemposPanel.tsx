import { Fragment, useEffect, useState } from 'react'
import { fetchTiempos, type TiemposResponse } from '../../lib/adminApi'
import { describeAdminError } from '../../lib/adminErrors'
import { etiquetaVeredicto } from '../../lib/etiquetasProximidad'
import {
  boton,
  formatoHora,
  formatoTiempo,
  nota,
  notaError,
  tabla,
  tablaWrap,
  td,
  th,
} from './estilos'

const FUENTE: Record<string, string> = {
  observado: 'manda lo observado',
  declarado: 'manda lo declarado',
  sin_apertura: 'sin apertura: vale lo declarado',
  sin_hora: 'sin hora del evento: vale lo declarado',
  sin_registro: 'partida anterior a esta versión',
}

const MOTIVO: Record<string, string> = {
  declared_time_exceeds_observed: 'Declara más de lo que cabe',
  completion_faster_than_possible: 'Demasiado rápido',
  offline_event_timestamp_in_future: 'Hora del futuro',
  impossible_travel_speed: 'Velocidad imposible',
  manual_position_used: 'GPS manual (prueba)',
}

/**
 * Revisión de la clasificación ANTES de dar el premio: por jugador y nodo, lo
 * que declaró el móvil, lo que observó el servidor, lo que se aplicó y las
 * sospechas. Sólo lectura. La regla está en backend/app/runtime/tiempos_de_nodo.py.
 */
export default function TiemposPanel() {
  const [datos, setDatos] = useState<TiemposResponse | null>(null)
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)
  const [abierto, setAbierto] = useState<string>('')

  async function cargar() {
    setCargando(true)
    setError('')
    try {
      setDatos(await fetchTiempos())
    } catch (e) {
      setError(describeAdminError(e, 'cargar'))
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    void cargar()
  }, [])

  const jugadores = datos?.jugadores || []

  return (
    <div className="admin-cms-local-panel admin-settings-panel admin-panel-modern">
      <div className="admin-panel-hero">
        <div>
          <span className="admin-kicker">⏱️ Clasificación</span>
          <h2>Tiempos calculados por el servidor</h2>
          <p>
            Tiempo de cada nodo = el mayor entre lo que declara el móvil y lo que el servidor vio
            pasar desde que el jugador abrió el nodo hasta que lo superó (como mucho 30 min).
            Caminar entre nodos no cuenta. Las penalizaciones se suman siempre. A igual tiempo, gana
            quien acabó antes.
          </p>
        </div>
        <div className="admin-panel-count">
          <strong>{jugadores.filter((j) => j.finished).length}</strong>
          <span>han terminado</span>
        </div>
      </div>

      <section className="admin-settings-section-modern">
        <button type="button" style={boton} disabled={cargando} onClick={() => void cargar()}>
          {cargando ? 'Cargando…' : '🔄 Recargar'}
        </button>
        {error ? <p style={notaError}>{error}</p> : null}

        <div style={{ ...tablaWrap, marginTop: 10 }}>
          <table style={tabla}>
            <thead>
              <tr>
                <th style={th}>#</th>
                <th style={th}>Jugador</th>
                <th style={th}>Nodos</th>
                <th style={th}>Total</th>
                <th style={th}>Penaliz.</th>
                <th style={th}>Acabó</th>
                <th style={th}>Sospechas</th>
              </tr>
            </thead>
            <tbody>
              {jugadores.map((j, i) => (
                <Fragment key={j.user}>
                  <tr
                    style={{
                      cursor: 'pointer',
                      background: abierto === j.user ? 'rgba(255,255,255,.05)' : undefined,
                    }}
                    onClick={() => setAbierto(abierto === j.user ? '' : j.user)}
                  >
                    <td style={td}>{i + 1}</td>
                    <td style={{ ...td, fontWeight: 800 }}>
                      {abierto === j.user ? '▾ ' : '▸ '}
                      {j.display_name}
                      {(j.nodos_modo_prueba?.length || j.nodos_sin_gps?.length) ? (
                        <small
                          style={{ display: 'block', color: '#fbbf24', fontWeight: 600 }}
                          title="Sólo informativo: no penaliza"
                        >
                          {j.nodos_modo_prueba?.length
                            ? `${etiquetaVeredicto('modo_prueba')}: ${j.nodos_modo_prueba.length} `
                            : ''}
                          {j.nodos_sin_gps?.length
                            ? `${etiquetaVeredicto('sin_gps')}: ${j.nodos_sin_gps.length}`
                            : ''}
                        </small>
                      ) : null}
                    </td>
                    <td style={td}>
                      {j.level}/{datos?.total_nodes ?? '—'}
                    </td>
                    <td style={{ ...td, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
                      {formatoTiempo(j.total_time_ms)}
                    </td>
                    <td style={td}>{formatoTiempo(j.penalties_ms)}</td>
                    <td style={td}>{j.finished ? formatoHora(j.finished_at) : '—'}</td>
                    <td
                      style={{
                        ...td,
                        color: j.suspicion_count ? '#fbbf24' : '#94a3b8',
                        fontWeight: 800,
                      }}
                    >
                      {j.suspicion_count ? `⚠ ${j.suspicion_count}` : '0'}
                    </td>
                  </tr>
                  {abierto === j.user ? (
                    <tr>
                      <td style={td} colSpan={7}>
                        {j.nodos.length === 0 ? (
                          <p style={nota}>Aún no ha superado ningún nodo.</p>
                        ) : (
                          <table style={tabla}>
                            <thead>
                              <tr>
                                <th style={th}>Nodo</th>
                                <th style={th}>Declarado</th>
                                <th style={th}>Observado</th>
                                <th style={th}>Aplicado</th>
                                <th style={th}>Penaliz.</th>
                                <th style={th}>Vía</th>
                                <th style={th}>Proximidad</th>
                                <th style={th}>Sospechas</th>
                              </tr>
                            </thead>
                            <tbody>
                              {j.nodos.map((n) => (
                                <tr key={n.level}>
                                  <td style={td}>
                                    {n.level + 1}. {n.title}
                                  </td>
                                  <td style={td}>{formatoTiempo(n.declared_ms)}</td>
                                  <td style={td}>{formatoTiempo(n.observed_ms)}</td>
                                  <td
                                    style={{
                                      ...td,
                                      fontWeight: 800,
                                      color: n.fuente === 'observado' ? '#fbbf24' : '#e2e8f0',
                                    }}
                                    title={FUENTE[n.fuente] || n.fuente}
                                  >
                                    {formatoTiempo(n.applied_ms)}
                                  </td>
                                  <td style={td}>
                                    {n.penalty_ms ? formatoTiempo(n.penalty_ms) : '—'}
                                  </td>
                                  <td style={td}>
                                    {n.origen === 'offline'
                                      ? 'sin cobertura'
                                      : n.origen === 'online'
                                        ? 'con red'
                                        : '—'}
                                  </td>
                                  <td
                                    style={{
                                      ...td,
                                      color:
                                        n.proximidad === 'lejos'
                                          ? '#f87171'
                                          : n.proximidad === 'modo_prueba' || n.prueba || n.proximidad === 'sin_gps'
                                            ? '#fbbf24'
                                            : '#94a3b8',
                                    }}
                                    title="Sólo informativo: no penaliza"
                                  >
                                    {n.prueba && n.proximidad !== 'modo_prueba'
                                      ? `${etiquetaVeredicto('modo_prueba')}${n.proximidad === 'lejos' ? ` · ${etiquetaVeredicto('lejos')}` : ''}`
                                      : etiquetaVeredicto(n.proximidad) || '—'}
                                  </td>
                                  <td
                                    style={{
                                      ...td,
                                      color: n.sospechas.length ? '#fbbf24' : '#94a3b8',
                                    }}
                                  >
                                    {n.sospechas.length
                                      ? n.sospechas
                                          .map((s) => MOTIVO[s.reason] || s.reason)
                                          .join(' · ')
                                      : '—'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                        <p style={nota}>
                          En amarillo, los nodos donde manda lo que vio el servidor (el móvil
                          declaró menos). Pasa el ratón por el aplicado para ver por qué.
                        </p>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

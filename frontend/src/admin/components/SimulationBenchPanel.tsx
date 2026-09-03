import { useState, type CSSProperties } from 'react'
import { cleanupSimulationBench, runLongSessionPauseBench, runSimulationBench } from '../lib/adminApi'

interface InformeJugador {
  nombre: string
  dispositivo: string
  duracion_ms: number
  nivel_final: number
  nodos_esperados: number
  errores: string[]
  peticiones: Array<{ tipo: string; estado: number | string; ms: number }>
  nodos_en_corte: number[]
}

interface Informe {
  device: string
  network: string
  player_count: number
  stage_count: number
  duration_ms: number
  total_requests: number
  latency_p50_ms: number
  latency_p95_ms: number
  players: InformeJugador[]
  players_with_errors: number
}

type Estado = 'idle' | 'running' | 'done' | 'blocked' | 'error'

interface InformePartidaLarga {
  nombre: string
  device: string
  stage_count: number
  punto_de_pausa: number
  nivel_tras_pausa: number
  nivel_final: number
  errores: string[]
}

/**
 * El banco de pruebas, enganchado al panel.
 *
 * Lanza jugadores simulados (SIM_XX) por la misión REAL -no una de mentira-,
 * cada uno con su perfil de dispositivo y de red, y enseña el informe: qué
 * tardó, qué falló, si el nivel final cuadra. Ver
 * backend/app/runtime/simulation_bench.py para el cómo.
 *
 * Se niega a correr si hay jugadores de VERDAD con la ruta empezada -salvo
 * que se marque "forzar"-, y deja un botón para borrar el rastro (SIM_XX)
 * al terminar.
 */
export default function SimulationBenchPanel() {
  const [playerCount, setPlayerCount] = useState(3)
  const [device, setDevice] = useState('mixed')
  const [network, setNetwork] = useState('mala')
  const [estado, setEstado] = useState<Estado>('idle')
  const [informe, setInforme] = useState<Informe | null>(null)
  const [aviso, setAviso] = useState<string>('')
  const [jugadoresEnMarcha, setJugadoresEnMarcha] = useState<string[]>([])
  const [limpiando, setLimpiando] = useState(false)
  const [limpiado, setLimpiado] = useState<string[] | null>(null)

  const [estadoLarga, setEstadoLarga] = useState<Estado>('idle')
  const [informeLarga, setInformeLarga] = useState<InformePartidaLarga | null>(null)
  const [avisoLarga, setAvisoLarga] = useState<string>('')
  const [jugadoresEnMarchaLarga, setJugadoresEnMarchaLarga] = useState<string[]>([])

  async function ejecutarPartidaLarga(forzar: boolean) {
    setEstadoLarga('running')
    setAvisoLarga('')

    const { httpStatus, data } = await runLongSessionPauseBench({
      device,
      pause_at: 0.5,
      force: forzar,
    })

    if (httpStatus === 409) {
      setEstadoLarga('blocked')
      setJugadoresEnMarchaLarga(data?.players_in_progress || [])
      return
    }

    if (httpStatus !== 200 || data?.status !== 'ok') {
      setEstadoLarga('error')
      setAvisoLarga(data?.detail || `HTTP ${httpStatus}`)
      return
    }

    setInformeLarga(data.report)
    setEstadoLarga('done')
  }

  async function ejecutar(forzar: boolean) {
    setEstado('running')
    setAviso('')
    setLimpiado(null)

    const { httpStatus, data } = await runSimulationBench({
      player_count: playerCount,
      device,
      network,
      force: forzar,
    })

    if (httpStatus === 409) {
      setEstado('blocked')
      setJugadoresEnMarcha(data?.players_in_progress || [])
      return
    }

    if (httpStatus !== 200 || data?.status !== 'ok') {
      setEstado('error')
      setAviso(data?.detail || `HTTP ${httpStatus}`)
      return
    }

    setInforme(data.report)
    setEstado('done')
  }

  async function limpiar() {
    setLimpiando(true)
    const { httpStatus, data } = await cleanupSimulationBench()
    setLimpiando(false)
    if (httpStatus === 200) {
      setLimpiado(data?.cleaned || [])
    }
  }

  return (
    <div className="admin-cms-local-panel admin-settings-panel admin-panel-modern">
      <div className="admin-panel-hero">
        <div>
          <span className="admin-kicker">🧪 Banco de pruebas</span>
          <h2>Simular jugadores</h2>
          <p>
            Recorre la misión real con jugadores de mentira -prefijo SIM_-, cada uno con su
            móvil y su cobertura, para ver cómo se comporta de verdad antes de que lo haga
            gente real.
          </p>
        </div>
      </div>

      <section className="admin-settings-section-modern">
        <div className="admin-settings-section-head">
          <strong>Parámetros</strong>
          <span>Cuántos, con qué móvil, y con qué cobertura.</span>
        </div>

        <div className="admin-settings-grid-modern">
          <label>
            Jugadores (1-8)
            <input
              type="number"
              min={1}
              max={8}
              value={playerCount}
              onChange={(event) => setPlayerCount(Math.max(1, Math.min(8, Number(event.target.value) || 1)))}
            />
          </label>

          <label>
            Dispositivo
            <select value={device} onChange={(event) => setDevice(event.target.value)}>
              <option value="mixed">Mezclado (iPhone + Android)</option>
              <option value="iphone">iPhone</option>
              <option value="android">Android</option>
            </select>
          </label>

          <label>
            Cobertura
            <select value={network} onChange={(event) => setNetwork(event.target.value)}>
              <option value="buena">Buena</option>
              <option value="mala">Mala (lenta, algún eco)</option>
              <option value="inestable">Inestable (lenta y con ecos)</option>
              <option value="corte">Corte a mitad de ruta (vaguada, tramo sin señal)</option>
              <option value="a_saltos">A saltos (entra y sale de cobertura toda la ruta)</option>
              <option value="sin_cobertura">Sin cobertura (todo por la cola offline)</option>
            </select>
          </label>
        </div>

        <div style={filaBotones}>
          <button type="button" style={botonPrimario} disabled={estado === 'running'} onClick={() => ejecutar(false)}>
            {estado === 'running' ? 'Corriendo…' : '▶️ Ejecutar'}
          </button>
          <button type="button" style={botonSecundario} disabled={limpiando} onClick={limpiar}>
            {limpiando ? 'Limpiando…' : '🧹 Limpiar rastro (SIM_*)'}
          </button>
        </div>

        {limpiado !== null && (
          <p style={notaOk}>
            {limpiado.length === 0
              ? 'No había nada que limpiar.'
              : `Limpiado: ${limpiado.join(', ')}`}
          </p>
        )}

        {estado === 'blocked' && (
          <div style={avisoBloqueo}>
            <strong>⚠️ Hay jugadores de verdad con la ruta empezada:</strong> {jugadoresEnMarcha.join(', ')}.
            <br />
            Lanzar el banco ahora metería jugadores de mentira en medio de la partida real.
            <div style={{ marginTop: 8 }}>
              <button type="button" style={botonSecundario} onClick={() => ejecutar(true)}>
                Lanzar de todos modos
              </button>
            </div>
          </div>
        )}

        {estado === 'error' && <p style={notaError}>{aviso}</p>}
      </section>

      {informe && (
        <section className="admin-settings-section-modern">
          <div className="admin-settings-section-head">
            <strong>Informe</strong>
            <span>
              {informe.player_count} jugadores · {informe.stage_count} nodos · {informe.device} ·{' '}
              {informe.network} · {(informe.duration_ms / 1000).toFixed(1)} s en total
            </span>
          </div>

          <div style={resumenGrid}>
            <div style={tarjetaResumen}>
              <div style={tarjetaLabel}>Peticiones</div>
              <div style={tarjetaValor}>{informe.total_requests}</div>
            </div>
            <div style={tarjetaResumen}>
              <div style={tarjetaLabel}>Latencia p50</div>
              <div style={tarjetaValor}>{informe.latency_p50_ms.toFixed(0)} ms</div>
            </div>
            <div style={tarjetaResumen}>
              <div style={tarjetaLabel}>Latencia p95</div>
              <div style={tarjetaValor}>{informe.latency_p95_ms.toFixed(0)} ms</div>
            </div>
            <div style={{ ...tarjetaResumen, ...(informe.players_with_errors ? tarjetaResumenMal : tarjetaResumenBien) }}>
              <div style={tarjetaLabel}>Con errores</div>
              <div style={tarjetaValor}>{informe.players_with_errors} / {informe.player_count}</div>
            </div>
          </div>

          <div style={tablaWrap}>
            <table style={tabla}>
              <thead>
                <tr>
                  <th style={th}>Jugador</th>
                  <th style={th}>Nivel final</th>
                  <th style={th}>Corte</th>
                  <th style={th}>Duración</th>
                  <th style={th}>Peticiones</th>
                  <th style={th}>Errores</th>
                </tr>
              </thead>
              <tbody>
                {informe.players.map((jugador) => (
                  <tr key={jugador.nombre}>
                    <td style={td}>{jugador.nombre}</td>
                    <td style={td}>
                      {jugador.nivel_final} / {jugador.nodos_esperados}
                    </td>
                    <td style={td}>
                      {jugador.nodos_en_corte && jugador.nodos_en_corte.length > 0
                        ? `nodos ${jugador.nodos_en_corte.map((n) => n + 1).join(', ')}`
                        : '—'}
                    </td>
                    <td style={td}>{(jugador.duracion_ms / 1000).toFixed(1)} s</td>
                    <td style={td}>{jugador.peticiones.length}</td>
                    <td style={{ ...td, color: jugador.errores.length ? '#f87171' : '#4ade80' }}>
                      {jugador.errores.length ? jugador.errores.join(' · ') : '✓ sin errores'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="admin-settings-section-modern">
        <div className="admin-settings-section-head">
          <strong>¿Se guarda bien todo?</strong>
          <span>
            Partida larga con una pausa real en medio: un jugador llega hasta la mitad de la
            ruta, cierra esa sesión -como quien se queda sin batería-, y retoma con una sesión
            nueva desde donde dice el servidor que se quedó. Usa el dispositivo elegido arriba.
          </span>
        </div>

        <div style={filaBotones}>
          <button
            type="button"
            style={botonSecundario}
            disabled={estadoLarga === 'running'}
            onClick={() => ejecutarPartidaLarga(false)}
          >
            {estadoLarga === 'running' ? 'Corriendo…' : '⏸️ Probar pausa y retomar'}
          </button>
        </div>

        {estadoLarga === 'blocked' && (
          <div style={avisoBloqueo}>
            <strong>⚠️ Hay jugadores de verdad con la ruta empezada:</strong>{' '}
            {jugadoresEnMarchaLarga.join(', ')}.
            <div style={{ marginTop: 8 }}>
              <button type="button" style={botonSecundario} onClick={() => ejecutarPartidaLarga(true)}>
                Lanzar de todos modos
              </button>
            </div>
          </div>
        )}

        {estadoLarga === 'error' && <p style={notaError}>{avisoLarga}</p>}

        {informeLarga && (
          <div style={resumenGrid}>
            <div style={tarjetaResumen}>
              <div style={tarjetaLabel}>Pausa en el nodo</div>
              <div style={tarjetaValor}>{informeLarga.punto_de_pausa}</div>
            </div>
            <div style={tarjetaResumen}>
              <div style={tarjetaLabel}>Nivel tras la pausa</div>
              <div style={tarjetaValor}>
                {informeLarga.nivel_tras_pausa} / {informeLarga.punto_de_pausa}
              </div>
            </div>
            <div style={tarjetaResumen}>
              <div style={tarjetaLabel}>Nivel final</div>
              <div style={tarjetaValor}>
                {informeLarga.nivel_final} / {informeLarga.stage_count}
              </div>
            </div>
            <div
              style={{
                ...tarjetaResumen,
                ...(informeLarga.errores.length ? tarjetaResumenMal : tarjetaResumenBien),
              }}
            >
              <div style={tarjetaLabel}>Resultado</div>
              <div style={{ ...tarjetaValor, fontSize: 14 }}>
                {informeLarga.errores.length ? informeLarga.errores.join(' · ') : '✓ se guardó bien'}
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

const filaBotones: CSSProperties = {
  display: 'flex',
  gap: 10,
  marginTop: 14,
  flexWrap: 'wrap',
}

const botonPrimario: CSSProperties = {
  padding: '10px 18px',
  borderRadius: 8,
  border: '1px solid rgba(56,189,248,.5)',
  background: 'linear-gradient(180deg, rgba(56,189,248,.9), rgba(2,132,199,.9))',
  color: '#fff',
  fontWeight: 800,
  cursor: 'pointer',
}

const botonSecundario: CSSProperties = {
  padding: '10px 18px',
  borderRadius: 8,
  border: '1px solid rgba(255,255,255,.2)',
  background: 'rgba(255,255,255,.06)',
  color: '#e2e8f0',
  fontWeight: 700,
  cursor: 'pointer',
}

const avisoBloqueo: CSSProperties = {
  marginTop: 14,
  padding: '12px 14px',
  borderRadius: 8,
  border: '1px solid rgba(251,191,36,.4)',
  background: 'rgba(251,191,36,.1)',
  color: '#fde68a',
  fontSize: 13,
  lineHeight: 1.5,
}

const notaError: CSSProperties = {
  marginTop: 12,
  color: '#f87171',
  fontSize: 13,
}

const notaOk: CSSProperties = {
  marginTop: 12,
  color: '#94a3b8',
  fontSize: 13,
}

const resumenGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
  gap: 10,
  marginTop: 4,
}

const tarjetaResumen: CSSProperties = {
  padding: '10px 12px',
  borderRadius: 8,
  background: 'rgba(255,255,255,.05)',
  border: '1px solid rgba(255,255,255,.1)',
}

const tarjetaResumenBien: CSSProperties = {
  borderColor: 'rgba(74,222,128,.4)',
}

const tarjetaResumenMal: CSSProperties = {
  borderColor: 'rgba(248,113,113,.4)',
}

const tarjetaLabel: CSSProperties = {
  fontSize: 10.5,
  fontWeight: 800,
  letterSpacing: '.05em',
  color: '#94a3b8',
  textTransform: 'uppercase',
}

const tarjetaValor: CSSProperties = {
  fontSize: 20,
  fontWeight: 900,
  color: '#fff',
  marginTop: 2,
}

const tablaWrap: CSSProperties = {
  marginTop: 14,
  overflowX: 'auto',
}

const tabla: CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 12.5,
}

const th: CSSProperties = {
  textAlign: 'left',
  padding: '6px 10px',
  borderBottom: '1px solid rgba(255,255,255,.15)',
  color: '#94a3b8',
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: '.04em',
}

const td: CSSProperties = {
  padding: '7px 10px',
  borderBottom: '1px solid rgba(255,255,255,.06)',
  color: '#e2e8f0',
}

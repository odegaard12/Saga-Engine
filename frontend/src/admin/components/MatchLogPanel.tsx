import { useEffect, useState, type CSSProperties } from 'react'
import {
  downloadMatchLogExport,
  fetchAdminReactOverview,
  fetchMatchLog,
  type AdminReactOverviewProfile,
  type MatchLogEntry,
} from '../lib/adminApi'

type Estado = 'idle' | 'loading' | 'done' | 'error'

const ICONO_POR_TIPO: Record<string, string> = {
  session_open: '🔓',
  position_sample: '📍',
  node_opened: '📂',
  node_completed: '✅',
  advance: '✅',
  minigame_started: '🎮',
  minigame_finished: '🏁',
  minigame_restarted: '🔁',
  qr_scanned: '🔳',
  nfc_url_opened: '📶',
  inventory_item_collected: '🎒',
  inventory_item_used: '🛠️',
  team_ready: '🤝',
  team_proof_created: '🖼️',
  team_proof_accepted: '🖼️',
  offline_sync_batch: '📡',
  offline_sync_received: '📡',
  suspicion: '🚩',
  info_note: 'ℹ️',
}

const ETIQUETA_POR_TIPO: Record<string, string> = {
  session_open: 'Sesión abierta',
  position_sample: 'Posición',
  node_opened: 'Nodo abierto',
  node_completed: 'Nodo completado',
  advance: 'Nodo completado',
  minigame_started: 'Minijuego iniciado',
  minigame_finished: 'Minijuego terminado',
  minigame_restarted: 'Minijuego reiniciado',
  qr_scanned: 'QR escaneado',
  nfc_url_opened: 'NFC abierto',
  inventory_item_collected: 'Objeto recogido',
  inventory_item_used: 'Objeto usado',
  team_ready: 'Equipo listo',
  team_proof_created: 'Prueba de equipo creada',
  team_proof_accepted: 'Prueba de equipo aceptada',
  offline_sync_batch: 'Sincronización sin cobertura',
  offline_sync_received: 'Sincronización sin cobertura',
  suspicion: 'Sospecha de trampa',
  info_note: 'Nota informativa',
}

function formatFecha(iso?: string): string {
  if (!iso) return '—'
  const fecha = new Date(iso)
  if (Number.isNaN(fecha.getTime())) return iso
  return fecha.toLocaleString()
}

function resumenPayload(payload?: Record<string, unknown>): string {
  if (!payload || Object.keys(payload).length === 0) return '—'
  return Object.entries(payload)
    .filter(([, valor]) => valor !== null && valor !== undefined && valor !== '')
    .map(([clave, valor]) => `${clave}: ${typeof valor === 'object' ? JSON.stringify(valor) : String(valor)}`)
    .join(' · ')
}

function descargarBlob(blob: Blob, nombre: string) {
  const url = URL.createObjectURL(blob)
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.download = nombre
  document.body.appendChild(enlace)
  enlace.click()
  document.body.removeChild(enlace)
  URL.revokeObjectURL(url)
}

/**
 * Registro de partida: qué hizo cada jugador durante la ruta, para revisar
 * después y detectar trampas. Sólo hay filas mientras la misión estuvo
 * PROGRAMADA y ACTIVA (ver backend/app/runtime/match_log.py) -fuera de esa
 * ventana no se anota nada-.
 */
export default function MatchLogPanel() {
  const [jugadores, setJugadores] = useState<AdminReactOverviewProfile[]>([])
  const [jugadorId, setJugadorId] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')

  const [entradas, setEntradas] = useState<MatchLogEntry[]>([])
  const [estado, setEstado] = useState<Estado>('idle')
  const [aviso, setAviso] = useState('')
  const [exportando, setExportando] = useState<'' | 'json' | 'csv'>('')

  useEffect(() => {
    void (async () => {
      try {
        const overview = await fetchAdminReactOverview()
        if (overview.status === 'ok') {
          setJugadores(overview.profiles || [])
        }
      } catch {
        // Sin lista de jugadores el filtro por texto libre sigue funcionando.
      }
    })()
  }, [])

  async function cargar() {
    setEstado('loading')
    setAviso('')
    try {
      const respuesta = await fetchMatchLog({
        user: jugadorId || undefined,
        desde: desde ? new Date(desde).toISOString() : undefined,
        hasta: hasta ? new Date(hasta).toISOString() : undefined,
      })
      if (respuesta.status !== 'ok') {
        setEstado('error')
        setAviso(respuesta.detail || 'No se pudo cargar el registro de partida.')
        return
      }
      // Más recientes primero.
      setEntradas([...(respuesta.entries || [])].reverse())
      setEstado('done')
    } catch (error) {
      setEstado('error')
      setAviso(error instanceof Error ? error.message : 'Error al cargar el registro de partida.')
    }
  }

  useEffect(() => {
    void cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function exportar(formato: 'json' | 'csv') {
    setExportando(formato)
    try {
      const blob = await downloadMatchLogExport({
        user: jugadorId || undefined,
        desde: desde ? new Date(desde).toISOString() : undefined,
        hasta: hasta ? new Date(hasta).toISOString() : undefined,
        formato,
      })
      descargarBlob(blob, `registro-de-partida-${jugadorId || 'todos'}.${formato}`)
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'No se pudo exportar el registro.')
    } finally {
      setExportando('')
    }
  }

  const sospechas = entradas.filter((entrada) => entrada.severity === 'suspicion').length

  return (
    <div className="admin-cms-local-panel admin-settings-panel admin-panel-modern">
      <div className="admin-panel-hero">
        <div>
          <span className="admin-kicker">🕵️ Registro de partida</span>
          <h2>Línea de tiempo por jugador</h2>
          <p>
            Todo lo que ha hecho un jugador durante la ruta -latidos, nodos, minijuegos, QR, mochila, sincronización
            sin cobertura y sospechas del motor antitrampas-. Sólo hay filas mientras la misión estaba programada y
            en marcha.
          </p>
        </div>

        <div className="admin-panel-count">
          <strong>{sospechas}</strong>
          <span>sospechas en el filtro</span>
        </div>
      </div>

      <section className="admin-settings-section-modern">
        <div className="admin-settings-section-head">
          <strong>Filtro</strong>
          <span>Jugador y rango de fechas.</span>
        </div>

        <div style={filaFiltros}>
          <select value={jugadorId} onChange={(event) => setJugadorId(event.target.value)} style={selector}>
            <option value="">Todos los jugadores</option>
            {jugadores.map((jugador) => (
              <option key={jugador.id} value={jugador.id}>
                {jugador.display_name || jugador.id}
              </option>
            ))}
          </select>

          <label style={etiquetaFecha}>
            Desde
            <input
              type="datetime-local"
              value={desde}
              onChange={(event) => setDesde(event.target.value)}
              style={inputFecha}
            />
          </label>

          <label style={etiquetaFecha}>
            Hasta
            <input
              type="datetime-local"
              value={hasta}
              onChange={(event) => setHasta(event.target.value)}
              style={inputFecha}
            />
          </label>

          <button type="button" style={botonSecundario} disabled={estado === 'loading'} onClick={() => void cargar()}>
            {estado === 'loading' ? 'Cargando…' : '🔄 Aplicar filtro'}
          </button>
        </div>

        <div style={filaBotones}>
          <button
            type="button"
            style={botonSecundario}
            disabled={exportando !== ''}
            onClick={() => void exportar('json')}
          >
            {exportando === 'json' ? 'Exportando…' : '⬇️ Exportar JSON'}
          </button>
          <button
            type="button"
            style={botonSecundario}
            disabled={exportando !== ''}
            onClick={() => void exportar('csv')}
          >
            {exportando === 'csv' ? 'Exportando…' : '⬇️ Exportar CSV'}
          </button>
        </div>

        {estado === 'error' && <p style={notaError}>{aviso}</p>}
      </section>

      <section className="admin-settings-section-modern">
        {entradas.length === 0 ? (
          <div className="admin-empty-panel admin-empty-panel-modern">
            <strong>Sin filas</strong>
            <span>No hay nada anotado con este filtro -o la misión no estaba activa en ese rango-.</span>
          </div>
        ) : (
          <div style={tablaWrap}>
            <table style={tabla}>
              <thead>
                <tr>
                  <th style={th}>Cuándo</th>
                  <th style={th}>Jugador</th>
                  <th style={th}>Evento</th>
                  <th style={th}>Detalle</th>
                </tr>
              </thead>
              <tbody>
                {entradas.map((entrada) => {
                  const esSospecha = entrada.severity === 'suspicion'
                  return (
                    <tr key={entrada.id} style={esSospecha ? filaSospecha : undefined}>
                      <td style={td}>{formatFecha(entrada.created_at)}</td>
                      <td style={td}>{entrada.display_name || entrada.user}</td>
                      <td style={{ ...td, fontWeight: 700, color: esSospecha ? '#fbbf24' : undefined }}>
                        {ICONO_POR_TIPO[entrada.type] || '•'} {ETIQUETA_POR_TIPO[entrada.type] || entrada.type}
                      </td>
                      <td style={td}>{resumenPayload(entrada.payload)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

const filaFiltros: CSSProperties = {
  display: 'flex',
  gap: 10,
  marginTop: 14,
  flexWrap: 'wrap',
  alignItems: 'flex-end',
}

const filaBotones: CSSProperties = {
  display: 'flex',
  gap: 10,
  marginTop: 12,
  flexWrap: 'wrap',
  alignItems: 'center',
}

const etiquetaFecha: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  fontSize: 11,
  color: '#94a3b8',
  textTransform: 'uppercase',
  letterSpacing: '.04em',
}

const inputFecha: CSSProperties = {
  padding: '8px 10px',
  borderRadius: 8,
  border: '1px solid rgba(255,255,255,.2)',
  background: 'rgba(0,0,0,.3)',
  color: '#e2e8f0',
}

const selector: CSSProperties = {
  padding: '8px 10px',
  borderRadius: 8,
  border: '1px solid rgba(255,255,255,.2)',
  background: 'rgba(0,0,0,.3)',
  color: '#e2e8f0',
}

const botonSecundario: CSSProperties = {
  padding: '8px 14px',
  borderRadius: 8,
  border: '1px solid rgba(255,255,255,.2)',
  background: 'rgba(255,255,255,.06)',
  color: '#e2e8f0',
  fontWeight: 700,
  cursor: 'pointer',
}

const notaError: CSSProperties = {
  marginTop: 12,
  color: '#f87171',
  fontSize: 13,
}

const tablaWrap: CSSProperties = {
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

const filaSospecha: CSSProperties = {
  background: 'rgba(251,191,36,.08)',
}

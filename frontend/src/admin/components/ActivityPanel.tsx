import { useEffect, useState, type CSSProperties } from 'react'
import {
  fetchAdminEvents,
  fetchAntiCheatFlags,
  markAdminEvent,
  type AdminEvent,
  type AdminEventStatus,
  type AntiCheatPlayerFlags,
} from '../lib/adminApi'
import { describeAdminError } from '../lib/adminErrors'
import { etiquetaProximidad } from '../lib/etiquetasProximidad'
import {
  EVENTS_PAGE_LIMIT,
  describePendingCount,
  sortEventsNewestFirst,
} from '../lib/adminEventsView'

const ETIQUETA_MOTIVO: Record<string, string> = {
  impossible_travel_speed: 'Velocidad imposible entre nodos',
  completion_faster_than_possible: 'Reto superado demasiado rápido',
  offline_event_timestamp_in_future: 'Evento offline con fecha futura',
  left_app_during_minigame: 'Salió de la app durante el minijuego',
  opened_app_switcher_during_minigame: 'Abrió el selector de apps durante el minijuego',
  manual_position_used: 'Usó posición manual (modo prueba)',
  // Revisión de la evidencia de la partida (backend/app/runtime/evidencia.py):
  // el servidor vuelve a comprobar lo que el móvil dio por bueno. Son avisos,
  // no bloqueos: el jugador avanzó igual.
  evidence_answer_mismatch: 'La respuesta enviada no cuadra con la del servidor',
  evidence_rounds_mismatch: 'Las rondas de la partida no cuadran con lo que tocaba',
  evidence_penalty_short: 'Penalización recortada respecto a los fallos',
  evidence_too_fast: 'Rondas contestadas más rápido de lo humano',
  evidence_qr_mismatch: 'El QR leído no es el del nodo',
  evidence_gps_far_mapa_mudo: 'Mapa mudo: ningún GPS cerca del punto real',
  evidence_gps_missing: 'Mapa mudo completado sin muestras de GPS',
  evidence_missing: 'Partida sin la evidencia que exige el juego (móvil modificado)',
  evidence_legacy_client: 'Nodo completado sin evidencia (app antigua)',
  evidence_unreadable: 'Evidencia ilegible',
}

type Estado = 'idle' | 'loading' | 'done' | 'error'

const ETIQUETA_ESTADO: Record<AdminEventStatus, string> = {
  pending: 'Pendiente',
  synced: 'Leído',
  failed: 'Fallido',
  ignored: 'Ignorado',
}

function formatFecha(iso?: string): string {
  if (!iso) return '—'
  const fecha = new Date(iso)
  if (Number.isNaN(fecha.getTime())) return iso
  return fecha.toLocaleString()
}

function formatFechaMs(ms?: number): string {
  if (!ms) return '—'
  const fecha = new Date(ms)
  if (Number.isNaN(fecha.getTime())) return String(ms)
  return fecha.toLocaleString()
}

/**
 * Registro de actividad del servidor: heartbeats, QR escaneados, acciones de
 * admin... Antes esto sólo se podía ver leyendo events.json a mano en el
 * servidor. Aquí se lista con /api/admin/events y se puede marcar como
 * leído (estado "synced") con /api/admin/events/mark.
 */
export default function ActivityPanel() {
  const [eventos, setEventos] = useState<AdminEvent[]>([])
  // Total de pendientes según el servidor, si lo manda (la lista se corta en 200).
  const [pendientesServidor, setPendientesServidor] = useState<number | null>(null)
  const [estado, setEstado] = useState<Estado>('idle')
  const [aviso, setAviso] = useState('')
  const [filtroEstado, setFiltroEstado] = useState<'' | AdminEventStatus>('')
  const [marcando, setMarcando] = useState<string>('')

  // Sospechas de trampa: sección aparte porque no son "actividad" del
  // servidor, son avisos para que el organizador decida algo.
  const [sospechas, setSospechas] = useState<AntiCheatPlayerFlags[]>([])
  const [estadoSospechas, setEstadoSospechas] = useState<Estado>('idle')

  async function cargarSospechas() {
    setEstadoSospechas('loading')
    try {
      const respuesta = await fetchAntiCheatFlags()
      if (respuesta.status === 'ok') {
        setSospechas(respuesta.players || [])
        setEstadoSospechas('done')
      } else {
        setEstadoSospechas('error')
      }
    } catch {
      setEstadoSospechas('error')
    }
  }

  async function cargar() {
    setEstado('loading')
    setAviso('')
    try {
      const respuesta = await fetchAdminEvents({
        limit: EVENTS_PAGE_LIMIT,
        status: filtroEstado || undefined,
      })
      if (respuesta.status !== 'ok') {
        setEstado('error')
        setAviso(respuesta.detail || 'No se pudo cargar la actividad.')
        return
      }
      // Más recientes primero, por la fecha de cada evento: el orden en que los
      // devuelve el servidor no se da por supuesto.
      setEventos(sortEventsNewestFirst(respuesta.events || []))
      // El servidor cuenta los pendientes aparte (COUNT), sin depender de lo que quepa
      // en la página: es el número bueno aunque haya filtro.
      setPendientesServidor(
        typeof respuesta.pending_count === 'number' ? respuesta.pending_count : null
      )
      setEstado('done')
    } catch (error) {
      setEstado('error')
      setAviso(describeAdminError(error, 'cargar'))
    }
  }

  useEffect(() => {
    void cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroEstado])

  useEffect(() => {
    void cargarSospechas()
  }, [])

  async function marcarLeido(evento: AdminEvent) {
    setMarcando(evento.id)
    try {
      const respuesta = await markAdminEvent(evento.id, 'synced')
      if (respuesta.status === 'ok' && respuesta.event) {
        setEventos((actuales) =>
          actuales.map((item) => (item.id === evento.id ? (respuesta.event as AdminEvent) : item))
        )
      } else {
        window.alert(respuesta.detail || 'No se pudo marcar como leído.')
      }
    } catch (error) {
      window.alert(`No se pudo marcar como leído: ${describeAdminError(error)}`)
    } finally {
      setMarcando('')
    }
  }

  // No se afirma «200 pendientes» cuando solo se han cargado 200 filas.
  const pendientes = describePendingCount(eventos, EVENTS_PAGE_LIMIT, pendientesServidor)
  const contarPendientes =
    pendientesServidor !== null || !filtroEstado || filtroEstado === 'pending'

  return (
    <div className="admin-cms-local-panel admin-settings-panel admin-panel-modern">
      <div className="admin-panel-hero">
        <div>
          <span className="admin-kicker">📋 Actividad</span>
          <h2>Registro de eventos</h2>
          <p>
            Lo que ha ido pasando en el servidor: heartbeats, QR escaneados, acciones de admin...
            Marca un evento como leído cuando ya lo has revisado.
          </p>
        </div>

        <div
          className="admin-panel-count"
          title={
            !contarPendientes
              ? 'Con este filtro no se pueden contar los pendientes: elige «Todos los estados».'
              : pendientes.exact
                ? undefined
                : `Solo se cargan los ${EVENTS_PAGE_LIMIT} eventos más recientes: puede haber más pendientes.`
          }
        >
          <strong>{contarPendientes ? pendientes.text : '—'}</strong>
          <span>pendientes</span>
        </div>
      </div>

      <section className="admin-settings-section-modern">
        <div className="admin-settings-section-head">
          <strong>🛡️ Motor antitrampas SAGA Engine</strong>
          <span>
            Avisos automáticos del servidor: velocidad imposible, retos superados demasiado rápido
            (mínimo propio por minijuego) o eventos offline con fecha futura. No afectan solos a la
            clasificación —lo decides tú—. Las notas neutras (p.ej. uso de posición manual) se
            muestran aparte: no son una acusación.
          </span>
        </div>

        {estadoSospechas === 'loading' && sospechas.length === 0 ? (
          <p style={notaError}>Cargando…</p>
        ) : sospechas.length === 0 ? (
          <div className="admin-empty-panel admin-empty-panel-modern">
            <strong>Sin sospechas</strong>
            <span>De momento no hay ninguna anotación.</span>
          </div>
        ) : (
          <div style={tablaWrap}>
            <table style={tabla}>
              <thead>
                <tr>
                  <th style={th}>Jugador</th>
                  <th style={th}>Sospechas</th>
                  <th style={th}>Notas neutras</th>
                  <th style={th}>Último motivo</th>
                  <th style={th}>Cuándo</th>
                </tr>
              </thead>
              <tbody>
                {sospechas.map((jugador) => {
                  const ultima = jugador.suspicions[0]
                  const ultimaEsInfo = ultima?.severity === 'info'
                  return (
                    <tr key={jugador.user}>
                      <td style={td}>{jugador.display_name}</td>
                      <td
                        style={{
                          ...td,
                          color: jugador.suspicion_count > 0 ? '#fbbf24' : '#94a3b8',
                          fontWeight: 800,
                        }}
                      >
                        {jugador.suspicion_count}
                      </td>
                      <td style={{ ...td, color: '#94a3b8', fontWeight: 600 }}>
                        {jugador.info_count}
                      </td>
                      <td style={{ ...td, color: ultimaEsInfo ? '#94a3b8' : undefined }}>
                        {ultima
                          ? etiquetaProximidad(ultima.reason) ||
                            ETIQUETA_MOTIVO[ultima.reason] ||
                            ultima.reason
                          : '—'}
                      </td>
                      <td style={td}>{formatFechaMs(ultima?.at)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="admin-settings-section-modern">
        <div className="admin-settings-section-head">
          <strong>Filtro</strong>
          <span>Por estado del evento.</span>
        </div>

        <div style={filaBotones}>
          <select
            value={filtroEstado}
            onChange={(event) => setFiltroEstado(event.target.value as '' | AdminEventStatus)}
            style={selector}
          >
            <option value="">Todos los estados</option>
            <option value="pending">Pendientes</option>
            <option value="synced">Leídos</option>
            <option value="failed">Fallidos</option>
            <option value="ignored">Ignorados</option>
          </select>
          <button
            type="button"
            style={botonSecundario}
            disabled={estado === 'loading'}
            onClick={() => void cargar()}
          >
            {estado === 'loading' ? 'Cargando…' : '🔄 Recargar'}
          </button>
        </div>

        {estado === 'error' && <p style={notaError}>{aviso}</p>}
      </section>

      <section className="admin-settings-section-modern">
        {eventos.length === 0 ? (
          <div className="admin-empty-panel admin-empty-panel-modern">
            <strong>Sin eventos</strong>
            <span>No hay actividad que mostrar con este filtro.</span>
          </div>
        ) : (
          <div style={tablaWrap}>
            <table style={tabla}>
              <thead>
                <tr>
                  <th style={th}>Fecha</th>
                  <th style={th}>Tipo</th>
                  <th style={th}>Usuario</th>
                  <th style={th}>Origen</th>
                  <th style={th}>Estado</th>
                  <th style={th}>Detalle</th>
                  <th style={th}></th>
                </tr>
              </thead>
              <tbody>
                {eventos.map((evento) => (
                  <tr key={evento.id}>
                    <td style={td}>{formatFecha(evento.created_at)}</td>
                    <td style={td}>{evento.type}</td>
                    <td style={td}>{evento.user || '—'}</td>
                    <td style={td}>{evento.source}</td>
                    <td
                      style={{
                        ...td,
                        color:
                          evento.status === 'failed'
                            ? '#f87171'
                            : evento.status === 'pending'
                              ? '#fbbf24'
                              : '#94a3b8',
                      }}
                    >
                      {ETIQUETA_ESTADO[evento.status] || evento.status}
                    </td>
                    <td style={td}>{evento.error || '—'}</td>
                    <td style={td}>
                      {evento.status === 'pending' || evento.status === 'failed' ? (
                        <button
                          type="button"
                          style={botonSecundario}
                          disabled={marcando === evento.id}
                          onClick={() => void marcarLeido(evento)}
                        >
                          {marcando === evento.id ? 'Marcando…' : 'Marcar leído'}
                        </button>
                      ) : (
                        '✓'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
  alignItems: 'center',
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

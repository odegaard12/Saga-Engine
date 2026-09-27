import { useEffect, useState, type CSSProperties } from 'react'
import { fetchAdminEvents, markAdminEvent, type AdminEvent, type AdminEventStatus } from '../lib/adminApi'

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

/**
 * Registro de actividad del servidor: heartbeats, QR escaneados, acciones de
 * admin... Antes esto sólo se podía ver leyendo events.json a mano en el
 * servidor. Aquí se lista con /api/admin/events y se puede marcar como
 * leído (estado "synced") con /api/admin/events/mark.
 */
export default function ActivityPanel() {
  const [eventos, setEventos] = useState<AdminEvent[]>([])
  const [estado, setEstado] = useState<Estado>('idle')
  const [aviso, setAviso] = useState('')
  const [filtroEstado, setFiltroEstado] = useState<'' | AdminEventStatus>('')
  const [marcando, setMarcando] = useState<string>('')

  async function cargar() {
    setEstado('loading')
    setAviso('')
    try {
      const respuesta = await fetchAdminEvents({
        limit: 200,
        status: filtroEstado || undefined,
      })
      if (respuesta.status !== 'ok') {
        setEstado('error')
        setAviso(respuesta.detail || 'No se pudo cargar la actividad.')
        return
      }
      // Más recientes primero: el backend los devuelve en orden de llegada.
      setEventos([...(respuesta.events || [])].reverse())
      setEstado('done')
    } catch (error) {
      setEstado('error')
      setAviso(error instanceof Error ? error.message : 'Error al cargar la actividad.')
    }
  }

  useEffect(() => {
    void cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroEstado])

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
      window.alert(error instanceof Error ? error.message : 'No se pudo marcar como leído.')
    } finally {
      setMarcando('')
    }
  }

  const pendientes = eventos.filter((evento) => evento.status === 'pending').length

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

        <div className="admin-panel-count">
          <strong>{pendientes}</strong>
          <span>pendientes</span>
        </div>
      </div>

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
          <button type="button" style={botonSecundario} disabled={estado === 'loading'} onClick={() => void cargar()}>
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
                    <td style={{ ...td, color: evento.status === 'failed' ? '#f87171' : evento.status === 'pending' ? '#fbbf24' : '#94a3b8' }}>
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

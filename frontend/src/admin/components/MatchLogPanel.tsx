import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import {
  downloadMatchLogExport,
  fetchAdminReactOverview,
  fetchMatchLog,
  type AdminReactOverviewProfile,
  type MatchLogEntry,
} from '../lib/adminApi'
import { describeAdminError } from '../lib/adminErrors'

type Estado = 'idle' | 'loading' | 'done' | 'error'
type Vista = 'nodos' | 'cronologica'

const ICONO_POR_TIPO: Record<string, string> = {
  session_open: '🔓',
  position_sample: '📍',
  node_opened: '📂',
  node_completed: '✅',
  advance: '✅',
  advance_rejected: '⛔',
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
  advance_rejected: 'Avance NO aplicado por el servidor',
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
  offline_sync_batch: 'Sincronización tras un tramo sin cobertura',
  offline_sync_received: 'Sincronización sin cobertura',
  suspicion: 'Sospecha de trampa',
  info_note: 'Nota informativa',
}

/** Los motivos del motor antitrampas, en español. Mismo texto que en Actividad. */
const ETIQUETA_MOTIVO: Record<string, string> = {
  impossible_travel_speed: 'Velocidad imposible entre nodos',
  completion_faster_than_possible: 'Reto superado demasiado rápido',
  offline_event_timestamp_in_future: 'Evento offline con fecha futura',
  left_app_during_minigame: 'Salió de la app durante el minijuego',
  opened_app_switcher_during_minigame: 'Abrió el selector de apps durante el minijuego',
  manual_position_used: 'Usó posición manual (modo prueba)',
  evidence_answer_mismatch: 'La respuesta enviada no cuadra con la del servidor',
  evidence_rounds_mismatch: 'Las rondas de la partida no cuadran con lo que tocaba',
  evidence_penalty_short: 'Penalización recortada respecto a los fallos',
  evidence_too_fast: 'Rondas contestadas más rápido de lo humano',
  evidence_qr_mismatch: 'El QR leído no es el del nodo',
  evidence_gps_far_mapa_mudo: 'Mapa mudo: ningún GPS cerca del punto real',
  evidence_gps_missing: 'Mapa mudo completado sin muestras de GPS',
  evidence_missing: 'Partida sin la evidencia que exige el juego (móvil modificado)',
  evidence_legacy_client: 'Nodo completado sin evidencia (app antigua)',
}

/** Campos del payload que son fontanería de la cola y no ayudan a revisar. */
const CAMPOS_RUIDO = new Set([
  'client_event_id',
  'local_event_id',
  'local_created_at',
  'retry_count',
  'seq',
  'offline_at_creation',
  'offline',
  'sync_delay_ms',
  'node_id',
  'via',
  'local_progress',
  'level_after',
])

const SIN_NODO = '__sin_nodo__'

function formatFecha(iso?: string): string {
  if (!iso) return '—'
  const fecha = new Date(iso)
  if (Number.isNaN(fecha.getTime())) return iso
  return fecha.toLocaleString()
}

function formatHora(iso?: string): string {
  if (!iso) return '—'
  const fecha = new Date(iso)
  if (Number.isNaN(fecha.getTime())) return iso
  return fecha.toLocaleTimeString()
}

function formatDuracion(ms: number): string {
  const segundos = Math.round(ms / 1000)
  if (segundos < 90) return `${segundos} s`
  const minutos = Math.round(segundos / 60)
  if (minutos < 90) return `${minutos} min`
  return `${(minutos / 60).toFixed(1)} h`
}

function payloadDe(entrada: MatchLogEntry): Record<string, unknown> {
  return entrada.payload && typeof entrada.payload === 'object' ? entrada.payload : {}
}

function resumenPayload(payload?: Record<string, unknown>): string {
  if (!payload || Object.keys(payload).length === 0) return '—'
  const texto = Object.entries(payload)
    .filter(([clave, valor]) => !CAMPOS_RUIDO.has(clave) && valor !== null && valor !== undefined && valor !== '')
    .map(([clave, valor]) => `${clave}: ${typeof valor === 'object' ? JSON.stringify(valor) : String(valor)}`)
    .join(' · ')
  return texto || '—'
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

function esSospecha(entrada: MatchLogEntry): boolean {
  return entrada.severity === 'suspicion' || entrada.type === 'suspicion'
}

function sinCobertura(entrada: MatchLogEntry): boolean {
  return Boolean(payloadDe(entrada).offline)
}

function retrasoMs(entrada: MatchLogEntry): number {
  const retraso = Number(payloadDe(entrada).sync_delay_ms)
  return Number.isFinite(retraso) ? retraso : 0
}

function cuando(entrada: MatchLogEntry): string {
  return entrada.occurred_at || entrada.client_created_at || entrada.created_at
}

type GrupoDeNodo = {
  clave: string
  titulo: string
  entradas: MatchLogEntry[]
}

type GrupoDeJugador = {
  user: string
  nombre: string
  entradas: MatchLogEntry[]
  nodos: GrupoDeNodo[]
}

/**
 * Agrupa la línea de tiempo por jugador y, dentro, por nodo.
 *
 * Las filas llegan ordenadas por CUÁNDO OCURRIERON. Una fila sin nodo -una
 * posición, la apertura de sesión- se pega al nodo en curso, que es en lo que
 * estaba el jugador en ese momento; antes del primer nodo van a «Antes del
 * primer nodo». Un nodo nuevo abre grupo en la primera fila que lo nombra.
 */
function agrupar(entradas: MatchLogEntry[]): GrupoDeJugador[] {
  const porJugador = new Map<string, GrupoDeJugador>()

  for (const entrada of entradas) {
    let grupo = porJugador.get(entrada.user)
    if (!grupo) {
      grupo = { user: entrada.user, nombre: entrada.display_name || entrada.user, entradas: [], nodos: [] }
      porJugador.set(entrada.user, grupo)
    }
    grupo.entradas.push(entrada)
  }

  for (const grupo of porJugador.values()) {
    let actual: GrupoDeNodo | null = null
    const vistos = new Map<string, GrupoDeNodo>()

    for (const entrada of grupo.entradas) {
      const nodoId = String(payloadDe(entrada).node_id ?? '').trim()

      if (nodoId) {
        let nodo = vistos.get(nodoId)
        if (!nodo) {
          const indice = payloadDe(entrada).node_index
          nodo = {
            clave: nodoId,
            titulo:
              indice !== undefined && indice !== null
                ? `Nodo ${Number(indice) + 1} · id ${nodoId}`
                : `Nodo id ${nodoId}`,
            entradas: [],
          }
          vistos.set(nodoId, nodo)
          grupo.nodos.push(nodo)
        }
        actual = nodo
        nodo.entradas.push(entrada)
        continue
      }

      if (!actual) {
        actual = { clave: SIN_NODO, titulo: 'Antes del primer nodo', entradas: [] }
        vistos.set(SIN_NODO, actual)
        grupo.nodos.push(actual)
      }
      actual.entradas.push(entrada)
    }
  }

  return Array.from(porJugador.values())
}

function detalleDeAvance(entrada: MatchLogEntry): string {
  const p = payloadDe(entrada)
  const partes: string[] = []
  if (p.kind) partes.push(`tipo ${String(p.kind)}`)
  if (p.game_id) partes.push(`juego ${String(p.game_id)}`)
  if (p.time_spent_ms !== undefined && p.time_spent_ms !== null) partes.push(`tiempo ${formatDuracion(Number(p.time_spent_ms))}`)
  if (Number(p.penalty_ms) > 0) partes.push(`penalización ${formatDuracion(Number(p.penalty_ms))}`)
  if (p.manual) partes.push('código de respaldo')
  if (p.gano_por) partes.push(`ganado por ${String(p.gano_por)}`)
  if (p.via) partes.push(`llegó por ${String(p.via)}`)
  if (p.evidencia) partes.push(`evidencia ${String(p.evidencia)}`)
  if (p.respuestas) partes.push(`respuestas ${JSON.stringify(p.respuestas)}`)
  if (p.rondas_n !== undefined) partes.push(`${String(p.rondas_n)} rondas`)
  if (p.fallos !== undefined) partes.push(`${String(p.fallos)} fallos`)
  if (p.qr_leido) partes.push(`QR «${String(p.qr_leido)}»`)
  if (p.gps_n !== undefined) {
    partes.push(
      `GPS ${String(p.gps_n)} muestras` +
        (p.gps_manual_n ? ` (${String(p.gps_manual_n)} manuales)` : '') +
        (p.gps_distancia_minima_m !== undefined ? `, a ${String(p.gps_distancia_minima_m)} m como mínimo` : '')
    )
  }
  if (Array.isArray(p.sospechas) && p.sospechas.length) {
    partes.push(`🚩 ${(p.sospechas as string[]).map((motivo) => ETIQUETA_MOTIVO[motivo] || motivo).join(', ')}`)
  }
  return partes.join(' · ') || '—'
}

function detalleDe(entrada: MatchLogEntry): string {
  if (entrada.type === 'advance' || entrada.type === 'node_completed') return detalleDeAvance(entrada)

  if (esSospecha(entrada)) {
    const p = payloadDe(entrada)
    const motivo = String(p.reason || '')
    const resto = resumenPayload({ ...p, reason: undefined })
    return `${ETIQUETA_MOTIVO[motivo] || motivo}${resto !== '—' ? ` — ${resto}` : ''}`
  }

  if (entrada.type === 'advance_rejected') {
    const p = payloadDe(entrada)
    return `motivo: ${String(p.error || '?')} · el servidor iba por el nodo ${Number(p.server_level ?? 0) + 1}`
  }

  if (entrada.type === 'offline_sync_batch') {
    const p = payloadDe(entrada)
    return `${String(p.event_count ?? '?')} eventos subidos de golpe` +
      (p.delay_ms ? ` · el más viejo llevaba ${formatDuracion(Number(p.delay_ms))} esperando` : '')
  }

  if (entrada.type === 'position_sample') {
    const p = payloadDe(entrada)
    const lat = Number(p.lat)
    const lon = Number(p.lon)
    const coords = Number.isFinite(lat) && Number.isFinite(lon) ? `${lat.toFixed(5)}, ${lon.toFixed(5)}` : '—'
    return `${coords}${p.accuracy ? ` (±${String(p.accuracy)} m)` : ''}${p.source === 'manual' ? ' · manual' : ''}`
  }

  return resumenPayload(payloadDe(entrada))
}

/**
 * Registro de partida: qué hizo cada jugador durante la ruta, para revisar
 * después y detectar trampas. Sólo hay filas mientras la misión estuvo
 * PROGRAMADA y ACTIVA (ver backend/app/runtime/match_log.py) -fuera de esa
 * ventana no se anota nada-.
 *
 * Pensado para repasar la partida en casa: por jugador, por nodo, con la hora
 * a la que PASÓ cada cosa (la del móvil) y la hora a la que llegó, los tramos
 * sin cobertura marcados y las sospechas resaltadas.
 */
export default function MatchLogPanel({ missionLaunchAt = '' }: { missionLaunchAt?: string }) {
  // Sin fecha de inicio de la misión NO se anota nada (ni este registro ni los
  // rastros GPS): el panel se veía vacío sin decir por qué (informe A13).
  const sinFechaDeInicio = !String(missionLaunchAt || '').trim()
  const [jugadores, setJugadores] = useState<AdminReactOverviewProfile[]>([])
  const [jugadorId, setJugadorId] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [soloSospechas, setSoloSospechas] = useState(false)
  const [soloSinCobertura, setSoloSinCobertura] = useState(false)
  const [vista, setVista] = useState<Vista>('nodos')

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

  function consulta() {
    return {
      user: jugadorId || undefined,
      desde: desde ? new Date(desde).toISOString() : undefined,
      hasta: hasta ? new Date(hasta).toISOString() : undefined,
      solo_sospechas: soloSospechas || undefined,
      solo_sin_cobertura: soloSinCobertura || undefined,
    }
  }

  async function cargar() {
    setEstado('loading')
    setAviso('')
    try {
      const respuesta = await fetchMatchLog(consulta())
      if (respuesta.status !== 'ok') {
        setEstado('error')
        setAviso(respuesta.detail || 'No se pudo cargar el registro de partida.')
        return
      }
      // Ya viene ordenado por cuándo ocurrió cada cosa.
      setEntradas([...(respuesta.entries || [])])
      setEstado('done')
    } catch (error) {
      setEstado('error')
      setAviso(describeAdminError(error, 'cargar'))
    }
  }

  useEffect(() => {
    void cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function exportar(formato: 'json' | 'csv') {
    setExportando(formato)
    try {
      const blob = await downloadMatchLogExport({ ...consulta(), formato })
      descargarBlob(blob, `registro-de-partida-${jugadorId || 'todos'}.${formato}`)
    } catch (error) {
      window.alert(`No se pudo exportar el registro: ${describeAdminError(error, 'cargar')}`)
    } finally {
      setExportando('')
    }
  }

  const sospechas = entradas.filter(esSospecha).length
  const sinRed = entradas.filter(sinCobertura).length
  const nodosCompletados = entradas.filter((entrada) => entrada.type === 'advance').length
  const grupos = useMemo(() => agrupar(entradas), [entradas])

  return (
    <div className="admin-cms-local-panel admin-settings-panel admin-panel-modern">
      <div className="admin-panel-hero">
        <div>
          <span className="admin-kicker">🕵️ Registro de partida</span>
          <h2>Línea de tiempo por jugador</h2>
          <p>
            Todo lo que ha hecho un jugador durante la ruta -latidos, nodos, minijuegos, QR, mochila, sincronización
            sin cobertura y sospechas del motor antitrampas-, ordenado por cuándo ocurrió de verdad (la hora del
            móvil). Sólo hay filas mientras la misión estaba programada y en marcha.
          </p>
        </div>

        <div className="admin-panel-count">
          <strong>{sospechas}</strong>
          <span>sospechas en el filtro</span>
        </div>
      </div>

      {sinFechaDeInicio ? (
        <div
          role="status"
          style={{
            margin: '12px 0',
            padding: '12px 14px',
            borderRadius: 10,
            border: '1px solid rgba(250, 204, 21, 0.45)',
            background: 'rgba(250, 204, 21, 0.1)',
            color: '#fde68a',
            fontSize: 13,
            lineHeight: 1.5,
          }}
        >
          <strong>⚠️ El Registro de partida está apagado.</strong> La misión no tiene fecha de inicio y,
          sin ella, no se anota nada: ni este registro ni los rastros GPS («Ver Rastros» en el mapa).
          Pon la fecha en Ajustes → «Fecha y Hora de Inicio» (vale una hora que ya haya pasado) para
          que empiece a anotar. Lo que se juegue mientras tanto no se podrá revisar después.
        </div>
      ) : null}

      <section className="admin-settings-section-modern">
        <div className="admin-settings-section-head">
          <strong>Filtro</strong>
          <span>Jugador, rango de fechas y qué mirar.</span>
        </div>

        <div style={filaFiltros}>
          <select
            value={jugadorId}
            onChange={(event) => setJugadorId(event.target.value)}
            style={selector}
            aria-label="Jugador"
          >
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

          <label style={casilla}>
            <input
              type="checkbox"
              style={casillaInput}
              checked={soloSospechas}
              onChange={(event) => setSoloSospechas(event.target.checked)}
            />
            Sólo sospechas
          </label>

          <label style={casilla}>
            <input
              type="checkbox"
              style={casillaInput}
              checked={soloSinCobertura}
              onChange={(event) => setSoloSinCobertura(event.target.checked)}
            />
            Sólo sin cobertura
          </label>

          <button type="button" style={botonSecundario} disabled={estado === 'loading'} onClick={() => void cargar()}>
            {estado === 'loading' ? 'Cargando…' : '🔄 Aplicar filtro'}
          </button>
        </div>

        <div style={filaBotones}>
          <button
            type="button"
            style={vista === 'nodos' ? botonActivo : botonSecundario}
            onClick={() => setVista('nodos')}
          >
            Por nodo
          </button>
          <button
            type="button"
            style={vista === 'cronologica' ? botonActivo : botonSecundario}
            onClick={() => setVista('cronologica')}
          >
            Cronológica
          </button>

          <span style={{ width: 12 }} />

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
        {entradas.length > 0 && (
          <div style={filaResumen} data-testid="match-log-resumen">
            <span style={chip}>{entradas.length} filas</span>
            <span style={chip}>{nodosCompletados} nodos completados</span>
            <span style={sinRed > 0 ? chipSinRed : chip}>{sinRed} sin cobertura</span>
            <span style={sospechas > 0 ? chipSospecha : chip}>{sospechas} sospechas</span>
          </div>
        )}

        {entradas.length === 0 ? (
          <div className="admin-empty-panel admin-empty-panel-modern">
            <strong>Sin filas</strong>
            <span>No hay nada anotado con este filtro -o la misión no estaba activa en ese rango-.</span>
          </div>
        ) : vista === 'cronologica' ? (
          <TablaDeFilas entradas={entradas} />
        ) : (
          grupos.map((jugador) => (
            <div key={jugador.user} style={bloqueJugador}>
              <h3 style={tituloJugador}>{jugador.nombre}</h3>

              {jugador.nodos.map((nodo, indice) => {
                const nSospechas = nodo.entradas.filter(esSospecha).length
                const nSinRed = nodo.entradas.filter(sinCobertura).length
                const retrasoMax = nodo.entradas.reduce((max, entrada) => Math.max(max, retrasoMs(entrada)), 0)
                return (
                  <details key={`${nodo.clave}-${indice}`} open style={bloqueNodo}>
                    <summary style={cabeceraNodo}>
                      <strong>{nodo.titulo}</strong>
                      <span style={chip}>{nodo.entradas.length} filas</span>
                      {nSinRed > 0 && (
                        <span style={chipSinRed}>
                          📵 {nSinRed} sin cobertura
                          {retrasoMax > 0 ? ` · subido ${formatDuracion(retrasoMax)} después` : ''}
                        </span>
                      )}
                      {nSospechas > 0 && <span style={chipSospecha}>🚩 {nSospechas} sospechas</span>}
                    </summary>
                    <TablaDeFilas entradas={nodo.entradas} />
                  </details>
                )
              })}
            </div>
          ))
        )}
      </section>
    </div>
  )
}

function TablaDeFilas({ entradas }: { entradas: MatchLogEntry[] }) {
  return (
    <div style={tablaWrap}>
      <table style={tabla}>
        <thead>
          <tr>
            <th style={th}>Ocurrió</th>
            <th style={th}>Llegó al servidor</th>
            <th style={th}>Jugador</th>
            <th style={th}>Evento</th>
            <th style={th}>Detalle</th>
          </tr>
        </thead>
        <tbody>
          {entradas.map((entrada) => {
            const sospecha = esSospecha(entrada)
            const diferido = sinCobertura(entrada)
            const retraso = retrasoMs(entrada)
            const rechazado = entrada.type === 'advance_rejected'
            const estilo = sospecha ? filaSospecha : rechazado ? filaRechazo : diferido ? filaSinCobertura : undefined
            return (
              <tr key={entrada.id} style={estilo} data-sin-cobertura={diferido ? 'si' : undefined}>
                <td style={td}>{formatFecha(cuando(entrada))}</td>
                <td style={td}>
                  {formatHora(entrada.created_at)}
                  {diferido && retraso > 0 ? (
                    <span style={notaRetraso}> · +{formatDuracion(retraso)}</span>
                  ) : null}
                </td>
                <td style={td}>{entrada.display_name || entrada.user}</td>
                <td style={{ ...td, fontWeight: 700, color: sospecha ? '#fbbf24' : undefined }}>
                  {ICONO_POR_TIPO[entrada.type] || '•'} {ETIQUETA_POR_TIPO[entrada.type] || entrada.type}
                  {diferido ? <span style={marcaSinCobertura}> 📵 sin cobertura</span> : null}
                </td>
                <td style={td}>{detalleDe(entrada)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
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

const filaResumen: CSSProperties = {
  display: 'flex',
  gap: 8,
  flexWrap: 'wrap',
  marginBottom: 14,
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

const casilla: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 12.5,
  color: '#e2e8f0',
  paddingBottom: 8,
}

const casillaInput: CSSProperties = {
  width: 18,
  height: 18,
  minWidth: 18,
  padding: 0,
  accentColor: '#60a5fa',
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

const botonActivo: CSSProperties = {
  ...botonSecundario,
  background: 'rgba(96,165,250,.22)',
  border: '1px solid rgba(96,165,250,.6)',
}

const notaError: CSSProperties = {
  marginTop: 12,
  color: '#f87171',
  fontSize: 13,
}

const chip: CSSProperties = {
  padding: '3px 10px',
  borderRadius: 999,
  background: 'rgba(255,255,255,.08)',
  color: '#e2e8f0',
  fontSize: 12,
  fontWeight: 700,
}

const chipSinRed: CSSProperties = {
  ...chip,
  background: 'rgba(96,165,250,.2)',
  color: '#bfdbfe',
}

const chipSospecha: CSSProperties = {
  ...chip,
  background: 'rgba(251,191,36,.22)',
  color: '#fde68a',
}

const bloqueJugador: CSSProperties = {
  marginBottom: 22,
}

const tituloJugador: CSSProperties = {
  margin: '0 0 8px',
  fontSize: 16,
  color: '#f1f5f9',
}

const bloqueNodo: CSSProperties = {
  marginBottom: 10,
  border: '1px solid rgba(255,255,255,.1)',
  borderRadius: 10,
  padding: '8px 10px',
  background: 'rgba(255,255,255,.02)',
}

const cabeceraNodo: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  flexWrap: 'wrap',
  cursor: 'pointer',
  color: '#e2e8f0',
  fontSize: 13,
}

const tablaWrap: CSSProperties = {
  overflowX: 'auto',
  marginTop: 8,
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
  background: 'rgba(251,191,36,.12)',
  boxShadow: 'inset 3px 0 0 #fbbf24',
}

const filaRechazo: CSSProperties = {
  background: 'rgba(248,113,113,.1)',
  boxShadow: 'inset 3px 0 0 #f87171',
}

const filaSinCobertura: CSSProperties = {
  background: 'rgba(96,165,250,.08)',
  boxShadow: 'inset 3px 0 0 #60a5fa',
}

const marcaSinCobertura: CSSProperties = {
  marginLeft: 6,
  fontSize: 11,
  fontWeight: 600,
  color: '#93c5fd',
}

const notaRetraso: CSSProperties = {
  color: '#93c5fd',
  fontSize: 11,
}

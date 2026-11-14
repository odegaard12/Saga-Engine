import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import type { PlayerGamePayload } from '../../types/player'
import {
  getOfflineMissionSummary,
  saveLocalProgressSnapshot,
  syncPendingOfflineEvents,
  type OfflineMissionSummary,
} from '../offline/missionPack'
import {
  flushOfflineEvents,
  loadOfflineSnapshot,
  type SagaOfflineSnapshot,
} from '../offline/localFirst'
import { cadaMientrasVisible } from '../../shared/cadaMientrasVisible'

type Props = {
  user: string
  payload: PlayerGamePayload
  /**
   * Abre «Prepararse»: la misma comprobación y descarga que la pantalla de carga
   * (app, misión y mapa, con su barra cada una) y los permisos.
   *
   * Este panel tenía su propia descarga, aparte: bajaba la configuración, la
   * partida y el mapa a la vez, sin comprobar nada, sin mirar la cola pendiente
   * (el jugador retrocedía) y diciendo «preparado» aunque algo hubiera fallado.
   * Ya no: hay UNA sola, y esto la abre.
   */
  onPrepararTodo?: () => void
}

type Action = 'save' | 'sync' | null

export function MissionPackPanel({ user, payload, onPrepararTodo }: Props) {
  const [summary, setSummary] = useState<OfflineMissionSummary | null>(null)

  const [queue, setQueue] = useState<SagaOfflineSnapshot>(() => loadOfflineSnapshot(user))

  const [action, setAction] = useState<Action>(null)

  const [message, setMessage] = useState<string | null>(null)

  const [error, setError] = useState(false)

  const [online, setOnline] = useState(
    typeof navigator === 'undefined' ? true : navigator.onLine !== false
  )

  const refresh = useCallback(async () => {
    setOnline(typeof navigator === 'undefined' ? true : navigator.onLine !== false)

    setQueue(loadOfflineSnapshot(user))

    try {
      setSummary(await getOfflineMissionSummary(user))
    } catch {
      setSummary(null)
    }
  }, [user])

  useEffect(() => {
    void refresh()

    const parar = cadaMientrasVisible(refresh, 5000)

    window.addEventListener('online', refresh)
    window.addEventListener('offline', refresh)
    window.addEventListener('storage', refresh)

    return () => {
      parar()
      window.removeEventListener('online', refresh)
      window.removeEventListener('offline', refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [refresh])

  const pending = (summary?.pendingEvents || 0) + queue.queued_events.length

  const downloaded = Boolean(summary?.hasPack)

  const busy = action !== null

  function download() {
    if (busy || !onPrepararTodo) return
    onPrepararTodo()
  }

  async function save() {
    if (busy) return

    setAction('save')
    setMessage(null)
    setError(false)

    try {
      await saveLocalProgressSnapshot(payload)
      await refresh()
      setMessage('Avance guardado')
    } catch {
      setError(true)
      setMessage('No se pudo guardar')
    } finally {
      setAction(null)
    }
  }

  async function sync() {
    if (busy || !online) return

    setAction('sync')
    setMessage(null)
    setError(false)

    try {
      await syncPendingOfflineEvents(user)
      await flushOfflineEvents(user)
      await refresh()

      const remaining =
        ((await getOfflineMissionSummary(user))?.pendingEvents || 0) +
        loadOfflineSnapshot(user).queued_events.length

      if (remaining > 0) {
        setError(true)
        setMessage(`${remaining} pendiente` + `${remaining === 1 ? '' : 's'}`)
      } else {
        setMessage('Progreso sincronizado')
      }
    } catch {
      setError(true)
      setMessage('Error al sincronizar')
    } finally {
      setAction(null)
    }
  }

  const statusLabel = downloaded
    ? online
      ? 'PREPARADO'
      : 'OFFLINE LISTO'
    : online
      ? 'POR PREPARAR'
      : 'SIN CONEXIÓN'

  return (
    <section style={card}>
      <div style={topRow}>
        <strong style={title}>Juego offline</strong>

        <span style={downloaded ? readyBadge : online ? pendingBadge : offlineBadge}>
          {statusLabel}
        </span>
      </div>

      <button
        type="button"
        style={primary}
        disabled={busy || !online || !onPrepararTodo}
        onClick={download}
      >
        {downloaded ? 'Actualizar juego offline' : 'Preparar juego offline'}
      </button>

      {/* 2/11: «Guardar progreso» y «Sincronizar» son de rescate (la app sincroniza sola): plegados en «Avanzado». Con
          avances pendientes se avisa en el título para que no se escondan del todo. */}
      <details style={avanzado}>
        <summary style={avanzadoTitulo}>
          {/* 4/11: había dos «Avanzado» iguales en Herramientas: cada uno dice ya qué guarda. */}
          Avanzado: guardar y sincronizar{pending > 0 ? ` · ${pending} pendientes` : ''}
        </summary>
      <div style={actions}>
        <button
          type="button"
          style={{ ...secondary, ...(busy ? secondaryApagado : null) }}
          disabled={busy}
          onClick={save}
        >
          {action === 'save' ? 'Guardando…' : 'Guardar progreso'}
        </button>

        <button
          type="button"
          style={{
            ...secondary,
            ...(busy || !online || pending === 0 ? secondaryApagado : null),
          }}
          disabled={busy || !online || pending === 0}
          onClick={sync}
        >
          {action === 'sync'
            ? 'Sincronizando…'
            : pending > 0
              ? `Sincronizar (${pending})`
              : 'Todo al día'}
        </button>
      </div>
      </details>

      {message ? <div style={error ? messageError : messageOk}>{message}</div> : null}
    </section>
  )
}

const avanzado: CSSProperties = { marginTop: 4 }
const avanzadoTitulo: CSSProperties = {
  cursor: 'pointer',
  // 14/11: 44 px de alto (se toca con el dedo) y el color del tema: el fijo claro era invisible en Día (1,1:1).
  minHeight: 44,
  display: 'flex',
  alignItems: 'center',
  padding: '0 2px',
  color: 'rgba(var(--a-texto-rgb, 226, 238, 255), 0.8)',
  font: '700 12.5px system-ui, sans-serif',
}

const card: CSSProperties = {
  display: 'grid',
  gap: 10,
  padding: 8,
}

const topRow: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 10,
}

const title: CSSProperties = {
  color: '#ffffff',
  fontSize: 16,
  fontWeight: 950,
  letterSpacing: '-0.02em',
}

/**
 * 11.5px y solidos, no 8px con borde translucido.
 *
 * Lo canto la auditoria del banco: "Preparado" salia a 8px. Eso no es un
 * rotulo de seccion -que si va pequeño a proposito-, es el ESTADO del mapa
 * guardado, o sea justo el dato por el que alguien abre esta hoja.
 *
 * Y de paso al mismo idioma que el resto: solidos y redondos de verdad, sin
 * borde translucido ni el radio de pildora del tema -3px en fuego, casi
 * cuadrado-, igual que ya se hizo con los chips de la mesa de trabajo.
 */
const badge: CSSProperties = {
  minHeight: 23,
  display: 'inline-flex',
  alignItems: 'center',
  padding: '0 10px',
  borderRadius: 999,
  border: 0,
  fontSize: 11.5,
  fontWeight: 900,
  whiteSpace: 'nowrap',
}

const readyBadge: CSSProperties = {
  ...badge,
  // Verde universal de "listo", no el del tema: es una señal, no marca.
  background: '#22c55e',
  color: '#0b1220',
}

const pendingBadge: CSSProperties = {
  ...badge,
  background: 'var(--theme-card-inset)',
  color: 'rgba(255,255,255,.7)',
}

const offlineBadge: CSSProperties = {
  ...badge,
  background: 'rgba(245,158,11,.9)',
  color: '#2a1205',
}

const button: CSSProperties = {
  // 44, no 42: «Actualizar juego offline» se queda corto para el dedo según
  // la auditoría del banco (y los dos de abajo comparten esta base).
  minHeight: 44,
  borderRadius: 'var(--theme-radius-card)',
  fontSize: 11,
  fontWeight: 950,
}

const primary: CSSProperties = {
  ...button,
  // D1: el único azul de acción; el verde se reserva para «correcto/hecho».
  border: 0,
  background: 'var(--theme-primary)',
  // 14/11: el texto pensado para ir sobre el acento (en Día «ink-deep» sobre azul daba 2,9:1).
  color: 'var(--s-acento-texto, rgb(var(--theme-ink-deep)))',
  boxShadow: 'var(--saga-sombra-2)',
}

const actions: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: 7,
}

// SIGUE
// la tarjeta solida el relleno de cristal ya no se distinguia del fondo.
/**
 * "Botones transparentes, sin marco" -y tenian razon: lo eran.
 *
 * El borde estaba pintado con `--theme-card-inset`, que es EL MISMO color
 * que el fondo de la tarjeta que los rodea. Un marco pintado del color de
 * lo que enmarca no se ve: quedaba fondo transparente sin nada alrededor,
 * indistinguible del hueco vacio de la hoja. Ahora usa `--theme-hairline`,
 * que es la linea que SI se ve en el resto de la aplicacion -las filas de
 * "antes de salir", los separadores de la clasificacion-.
 */
const secondary: CSSProperties = {
  ...button,
  minHeight: 44,
  borderRadius: 12,
  border: `1px solid var(--theme-hairline)`,
  background: 'var(--theme-card)',
  color: 'rgba(var(--a-texto-rgb, 255, 255, 255), .9)',
}

/**
 * "Hay botones que no cambian": estaban con `disabled`, pero un atributo
 * HTML no cambia nada por si solo en un estilo en linea -hacia falta una
 * regla `:disabled`, que esto no tiene-. Visualmente, "Todo al dia" (sin
 * nada que sincronizar) se veia IGUAL que "Sincronizar (3)" a punto de
 * pulsarse. Ahora lo apagado se ve apagado.
 */
const secondaryApagado: CSSProperties = {
  // 14/11: 0,45 dejaba «Todo al día» en 2,7:1; 0,72 sigue viéndose apagado (y no se puede pulsar) pero se lee.
  opacity: 0.72,
  cursor: 'not-allowed',
}

const messageBase: CSSProperties = {
  padding: '8px 10px',
  borderRadius: 'var(--theme-radius-card)',
  fontSize: 10,
  fontWeight: 850,
}

const messageOk: CSSProperties = {
  ...messageBase,
  background: 'rgba(var(--theme-done), .11)',
  color: '#dcfce7',
}

const messageError: CSSProperties = {
  ...messageBase,
  background: 'rgba(220,38,38,.13)',
  color: '#fee2e2',
}

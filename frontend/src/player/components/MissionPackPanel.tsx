import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { fetchFieldProofs, fetchPlayerGame, fetchPublicConfig } from '../../shared/api'
import type { PlayerGamePayload } from '../../types/player'
import {
  getOfflineMissionSummary,
  saveLocalProgressSnapshot,
  saveMissionPack,
  syncPendingOfflineEvents,
  type OfflineMissionSummary,
} from '../offline/missionPack'
import {
  flushOfflineEvents,
  loadOfflineSnapshot,
  type SagaOfflineSnapshot,
} from '../offline/localFirst'
import { cachePlayerShell } from '../offline/pwaShell'
import { cacheFieldProofAssets, cacheFieldProofs } from '../offline/fieldProofCache'
import { prefetchMissionMapTiles } from '../offline/mapTileCache'

type Props = {
  user: string
  payload: PlayerGamePayload
}

type Action = 'download' | 'save' | 'sync' | null

export function MissionPackPanel({ user, payload }: Props) {
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

    const timer = window.setInterval(refresh, 5000)

    window.addEventListener('online', refresh)
    window.addEventListener('offline', refresh)
    window.addEventListener('storage', refresh)

    return () => {
      window.clearInterval(timer)
      window.removeEventListener('online', refresh)
      window.removeEventListener('offline', refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [refresh])

  const pending = (summary?.pendingEvents || 0) + queue.queued_events.length

  const downloaded = Boolean(summary?.hasPack)

  const busy = action !== null

  async function download() {
    if (busy) return

    setAction('download')
    setMessage(null)
    setError(false)

    try {
      const [config, game, fieldProofPayload] = await Promise.all([
        fetchPublicConfig(),
        fetchPlayerGame(user, { offlinePack: true }),
        fetchFieldProofs(user).catch(() => ({ proofs: [] })),
      ])

      const fieldProofs = Array.isArray(fieldProofPayload.proofs) ? fieldProofPayload.proofs : []

      const pack = await saveMissionPack({
        user,
        config,
        payload: game,
      })

      cacheFieldProofs(user, fieldProofs)

      await Promise.all([
        cachePlayerShell(`/player/${encodeURIComponent(user)}`),
        prefetchMissionMapTiles(game.stages || [], (progress) => {
          setMessage(progress.detail || 'Descargando mapas...')
        }),
        cacheFieldProofAssets(fieldProofs),
      ])

      setMessage(`Juego offline preparado · ${pack.stage_count} nodos`)

      await refresh()
    } catch (nextError) {
      setError(true)
      setMessage(nextError instanceof Error ? nextError.message : 'No se pudo preparar.')
    } finally {
      setAction(null)
    }
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

      <button type="button" style={primary} disabled={busy || !online} onClick={download}>
        {action === 'download'
          ? 'Preparando todo…'
          : downloaded
            ? 'Actualizar juego offline'
            : 'Preparar juego offline'}
      </button>

      <div style={actions}>
        <button type="button" style={secondary} disabled={busy} onClick={save}>
          {action === 'save' ? 'Guardando…' : 'Guardar progreso'}
        </button>

        <button
          type="button"
          style={secondary}
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

      {message ? <div style={error ? messageError : messageOk}>{message}</div> : null}
    </section>
  )
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
  minHeight: 42,
  borderRadius: 'var(--theme-radius-card)',
  fontSize: 11,
  fontWeight: 950,
}

const primary: CSSProperties = {
  ...button,
  border: '1px solid rgba(187,247,208,.22)',
  background: 'linear-gradient(180deg, rgb(var(--theme-done)), rgb(var(--theme-done)))',
  color: '#ffffff',
  boxShadow: '0 12px 26px rgba(22,163,74,.18)',
}

const actions: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: 7,
}

// Contorno neutro, como el resto de botones de la hoja de Ferramentas: sobre
// la tarjeta solida el relleno de cristal ya no se distinguia del fondo.
const secondary: CSSProperties = {
  ...button,
  minHeight: 44,
  borderRadius: 12,
  border: `1px solid var(--theme-card-inset)`,
  background: 'transparent',
  color: 'rgba(255,255,255,.78)',
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

import {
  useCallback,
  useEffect,
  useState,
  type CSSProperties,
} from 'react'
import {
  fetchPlayerGame,
  fetchPublicConfig,
} from '../../shared/api'
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
import {
  cacheMissionMapTiles,
  cachePlayerShell,
} from '../offline/pwaShell'

type Props = {
  user: string
  payload: PlayerGamePayload
}

type Action =
  | 'download'
  | 'save'
  | 'sync'
  | null

export function MissionPackPanel({
  user,
  payload,
}: Props) {
  const [summary, setSummary] =
    useState<OfflineMissionSummary | null>(null)

  const [queue, setQueue] =
    useState<SagaOfflineSnapshot>(() =>
      loadOfflineSnapshot(user)
    )

  const [action, setAction] =
    useState<Action>(null)

  const [message, setMessage] =
    useState<string | null>(null)

  const [error, setError] =
    useState(false)

  const [tileCount, setTileCount] =
    useState<number | null>(null)

  const [online, setOnline] =
    useState(
      typeof navigator === 'undefined'
        ? true
        : navigator.onLine !== false
    )

  const refresh =
    useCallback(async () => {
      setOnline(
        typeof navigator === 'undefined'
          ? true
          : navigator.onLine !== false
      )

      setQueue(loadOfflineSnapshot(user))

      try {
        setSummary(
          await getOfflineMissionSummary(user)
        )
      } catch {
        setSummary(null)
      }
    }, [user])

  useEffect(() => {
    void refresh()

    const timer =
      window.setInterval(refresh, 5000)

    window.addEventListener('online', refresh)
    window.addEventListener('offline', refresh)
    window.addEventListener('storage', refresh)

    return () => {
      window.clearInterval(timer)
      window.removeEventListener(
        'online',
        refresh,
      )
      window.removeEventListener(
        'offline',
        refresh,
      )
      window.removeEventListener(
        'storage',
        refresh,
      )
    }
  }, [refresh])

  const pending =
    (summary?.pendingEvents || 0) +
    queue.queued_events.length

  const nodes =
    summary?.stageCount ||
    payload.stages?.length ||
    0

  const downloaded =
    Boolean(summary?.hasPack)

  const busy = action !== null

  async function download() {
    if (busy) return

    setAction('download')
    setMessage(null)
    setError(false)

    try {
      const [config, game] =
        await Promise.all([
          fetchPublicConfig(),
          fetchPlayerGame(
            user,
            { offlinePack: true },
          ),
        ])

      const pack = await saveMissionPack({
        user,
        config,
        payload: game,
      })

      await cachePlayerShell(
        `/player/${encodeURIComponent(user)}`
      )

      const tiles =
        await cacheMissionMapTiles(
          game.stages || [],
        )

      setTileCount(tiles.cached)

      setMessage(
        `${pack.stage_count} nodos · ` +
        `${tiles.cached} teselas listas`,
      )

      await refresh()
    } catch (nextError) {
      setError(true)
      setMessage(
        nextError instanceof Error
          ? nextError.message
          : 'No se pudo preparar.',
      )
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
        ((
          await getOfflineMissionSummary(user)
        )?.pendingEvents || 0) +
        loadOfflineSnapshot(user)
          .queued_events.length

      if (remaining > 0) {
        setError(true)
        setMessage(
          `${remaining} pendiente` +
          `${remaining === 1 ? '' : 's'}`,
        )
      } else {
        setMessage('Todo sincronizado')
      }
    } catch {
      setError(true)
      setMessage('Error al sincronizar')
    } finally {
      setAction(null)
    }
  }

  return (
    <section style={card}>
      <div style={header}>
        <div>
          <strong style={title}>
            Juego offline
          </strong>

          <div style={statusLine}>
            {nodes} nodos
            {' · '}
            Nivel {summary?.currentLevel ?? payload.level ?? 0}
            {' · '}
            {pending} pendientes
            {tileCount !== null
              ? ` · ${tileCount} teselas`
              : ''}
          </div>
        </div>

        <span
          style={
            online
              ? readyBadge
              : offlineBadge
          }
        >
          {online
            ? downloaded
              ? 'LISTO'
              : 'ONLINE'
            : 'SIN RED'}
        </span>
      </div>

      <button
        type="button"
        style={primary}
        disabled={busy || !online}
        onClick={download}
      >
        {action === 'download'
          ? 'DESCARGANDO JUEGO OFFLINE…'
          : 'DESCARGAR JUEGO OFFLINE'}
      </button>

      <div style={actions}>
        <button
          type="button"
          style={secondary}
          disabled={busy}
          onClick={save}
        >
          {action === 'save'
            ? 'Guardando…'
            : 'Guardar avance'}
        </button>

        <button
          type="button"
          style={secondary}
          disabled={
            busy ||
            !online ||
            pending === 0
          }
          onClick={sync}
        >
          {action === 'sync'
            ? 'Sincronizando…'
            : pending > 0
              ? 'Sincronizar'
              : 'Al día'}
        </button>
      </div>

      {message ? (
        <div
          style={
            error
              ? messageError
              : messageOk
          }
        >
          {message}
        </div>
      ) : null}
    </section>
  )
}

const card: CSSProperties = {
  display: 'grid',
  gap: 10,
  padding: 12,
  borderRadius: 18,
  border:
    '1px solid rgba(255,255,255,.10)',
  background: 'rgba(15,23,42,.28)',
}

const header: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 10,
}

const title: CSSProperties = {
  display: 'block',
  color: '#ffffff',
  fontSize: 14,
  fontWeight: 900,
}

const statusLine: CSSProperties = {
  marginTop: 3,
  color: 'rgba(226,232,240,.68)',
  fontSize: 10,
  lineHeight: 1.35,
}

const badge: CSSProperties = {
  minHeight: 22,
  display: 'inline-flex',
  alignItems: 'center',
  padding: '0 8px',
  borderRadius: 999,
  fontSize: 9,
  fontWeight: 900,
}

const readyBadge: CSSProperties = {
  ...badge,
  background: 'rgba(34,197,94,.15)',
  color: '#dcfce7',
}

const offlineBadge: CSSProperties = {
  ...badge,
  background: 'rgba(245,158,11,.15)',
  color: '#fef3c7',
}

const button: CSSProperties = {
  minHeight: 42,
  borderRadius: 14,
  fontSize: 11,
  fontWeight: 900,
}

const primary: CSSProperties = {
  ...button,
  border:
    '1px solid rgba(96,165,250,.24)',
  background:
    'linear-gradient(180deg, rgba(59,130,246,.88), rgba(37,99,235,.82))',
  color: '#ffffff',
}

const actions: CSSProperties = {
  display: 'grid',
  gridTemplateColumns:
    'repeat(2, minmax(0, 1fr))',
  gap: 8,
}

const secondary: CSSProperties = {
  ...button,
  border:
    '1px solid rgba(255,255,255,.10)',
  background: 'rgba(255,255,255,.07)',
  color: '#f8fafc',
}

const messageBase: CSSProperties = {
  padding: '7px 9px',
  borderRadius: 11,
  fontSize: 10,
  fontWeight: 800,
}

const messageOk: CSSProperties = {
  ...messageBase,
  background: 'rgba(34,197,94,.10)',
  color: '#dcfce7',
}

const messageError: CSSProperties = {
  ...messageBase,
  background: 'rgba(220,38,38,.12)',
  color: '#fee2e2',
}

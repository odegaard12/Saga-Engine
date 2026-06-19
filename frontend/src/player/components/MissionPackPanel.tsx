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
        setMessage('Progreso sincronizado')
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
      <div style={topRow}>
        <span style={eyebrow}>SIN CONEXIÓN</span>
        <span style={online ? readyBadge : offlineBadge}>
          {online ? downloaded ? 'PREPARADO' : 'EN LÍNEA' : 'SIN RED'}
        </span>
      </div>
      <div style={intro}>
        <strong style={title}>Preparar esta misión</strong>
        <p style={description}>Guarda el juego y el mapa para continuar aunque pierdas cobertura.</p>
      </div>
      <div style={metrics}>
        <div style={metric}><strong>{nodes}</strong><span>Nodos</span></div>
        <div style={metric}><strong>{pending}</strong><span>Pendientes</span></div>
        <div style={metric}><strong>{tileCount !== null ? tileCount : downloaded ? '✓' : '—'}</strong><span>Mapa</span></div>
      </div>
      <button type="button" style={primary} disabled={busy || !online} onClick={download}>
        {action === 'download' ? 'Preparando misión y mapa…' : downloaded ? 'Actualizar descarga offline' : 'Descargar para usar sin conexión'}
      </button>
      <div style={actions}>
        <button type="button" style={secondary} disabled={busy} onClick={save}>{action === 'save' ? 'Guardando…' : 'Guardar progreso'}</button>
        <button type="button" style={secondary} disabled={busy || !online || pending === 0} onClick={sync}>
          {action === 'sync' ? 'Sincronizando…' : pending > 0 ? `Sincronizar (${pending})` : 'Todo al día'}
        </button>
      </div>
      {message ? <div style={error ? messageError : messageOk}>{message}</div> : null}
      <div style={footnote}>Incluye la interfaz, los datos de la misión y las teselas de mapa disponibles.</div>
    </section>
  )

}

const card: CSSProperties = {
  display: 'grid', gap: 12, padding: 16, borderRadius: 24,
  border: '1px solid rgba(96,165,250,.24)',
  background: 'linear-gradient(150deg, rgba(30,64,175,.22), rgba(15,23,42,.78) 55%, rgba(15,23,42,.62))',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,.06)',
}
const topRow: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }
const eyebrow: CSSProperties = { color: '#93c5fd', fontSize: 9, fontWeight: 950, letterSpacing: '0.16em' }
const intro: CSSProperties = { display: 'grid', gap: 5 }
const title: CSSProperties = { color: '#fff', fontSize: 18, fontWeight: 950, letterSpacing: '-0.02em' }
const description: CSSProperties = { margin: 0, color: 'rgba(226,232,240,.76)', fontSize: 12, lineHeight: 1.45 }
const badge: CSSProperties = { minHeight: 24, display: 'inline-flex', alignItems: 'center', padding: '0 9px', borderRadius: 999, fontSize: 9, fontWeight: 950 }
const readyBadge: CSSProperties = { ...badge, background: 'rgba(34,197,94,.14)', border: '1px solid rgba(74,222,128,.20)', color: '#dcfce7' }
const offlineBadge: CSSProperties = { ...badge, background: 'rgba(245,158,11,.14)', border: '1px solid rgba(251,191,36,.20)', color: '#fef3c7' }
const metrics: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 8 }
const metric: CSSProperties = { minHeight: 58, display: 'grid', placeItems: 'center', alignContent: 'center', gap: 2, borderRadius: 16, border: '1px solid rgba(255,255,255,.08)', background: 'rgba(15,23,42,.44)', color: '#fff', fontSize: 15, fontWeight: 950 }
const button: CSSProperties = { minHeight: 46, borderRadius: 16, fontSize: 12, fontWeight: 950 }
const primary: CSSProperties = { ...button, border: '1px solid rgba(147,197,253,.28)', background: 'linear-gradient(180deg,#3b82f6,#1d4ed8)', color: '#fff', boxShadow: '0 12px 26px rgba(29,78,216,.24)' }
const actions: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 8 }
const secondary: CSSProperties = { ...button, border: '1px solid rgba(148,163,184,.16)', background: 'rgba(51,65,85,.72)', color: '#f8fafc' }
const messageBase: CSSProperties = { padding: '9px 11px', borderRadius: 13, fontSize: 11, fontWeight: 850 }
const messageOk: CSSProperties = { ...messageBase, background: 'rgba(34,197,94,.11)', color: '#dcfce7' }
const messageError: CSSProperties = { ...messageBase, background: 'rgba(220,38,38,.13)', color: '#fee2e2' }
const footnote: CSSProperties = { color: 'rgba(148,163,184,.72)', fontSize: 10, lineHeight: 1.4 }

import {
  useCallback,
  useEffect,
  useState,
  type CSSProperties,
} from 'react'
import {
  fetchFieldProofs,
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
import {
  cacheFieldProofAssets,
  cacheFieldProofs,
} from '../offline/fieldProofCache'

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

  const downloaded =
    Boolean(summary?.hasPack)

  const busy = action !== null

  async function download() {
    if (busy) return

    setAction('download')
    setMessage(null)
    setError(false)

    try {
      const [config, game, fieldProofPayload] =
        await Promise.all([
          fetchPublicConfig(),
          fetchPlayerGame(
            user,
            { offlinePack: true },
          ),
          fetchFieldProofs(user).catch(() => ({ proofs: [] })),
        ])

      const fieldProofs = Array.isArray(fieldProofPayload.proofs)
        ? fieldProofPayload.proofs
        : []

      const pack = await saveMissionPack({
        user,
        config,
        payload: game,
      })

      cacheFieldProofs(user, fieldProofs)

      await Promise.all([
        cachePlayerShell(
          `/player/${encodeURIComponent(user)}`
        ),
        cacheMissionMapTiles(
          game.stages || [],
        ),
        cacheFieldProofAssets(fieldProofs),
      ])

      setMessage(
        `Juego offline preparado · ${pack.stage_count} nodos`,
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
        <div style={titleBlock}>
          <span style={eyebrow}>JUEGO OFFLINE</span>
          <strong style={title}>Preparar para jugar</strong>
          <small style={description}>
            Incluye misión, mapa, juegos y fotografías visibles en el mapa.
          </small>
        </div>
        <span style={downloaded ? readyBadge : online ? pendingBadge : offlineBadge}>
          {statusLabel}
        </span>
      </div>

      <button
        type="button"
        style={primary}
        disabled={busy || !online}
        onClick={download}
      >
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
  padding: 13,
  borderRadius: 20,
  border: '1px solid rgba(96,165,250,.20)',
  background: 'linear-gradient(145deg, rgba(30,64,175,.17), rgba(15,23,42,.62))',
}
const topRow: CSSProperties = { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }
const titleBlock: CSSProperties = { display: 'grid', gap: 3, minWidth: 0 }
const eyebrow: CSSProperties = { color: '#93c5fd', fontSize: 8, fontWeight: 950, letterSpacing: '0.14em' }
const title: CSSProperties = { color: '#fff', fontSize: 16, fontWeight: 950, letterSpacing: '-0.02em' }
const description: CSSProperties = { color: 'rgba(226,232,240,.70)', fontSize: 11, lineHeight: 1.35 }
const badge: CSSProperties = { minHeight: 23, display: 'inline-flex', alignItems: 'center', padding: '0 8px', borderRadius: 999, fontSize: 8, fontWeight: 950, whiteSpace: 'nowrap' }
const readyBadge: CSSProperties = { ...badge, background: 'rgba(34,197,94,.14)', border: '1px solid rgba(74,222,128,.20)', color: '#dcfce7' }
const pendingBadge: CSSProperties = { ...badge, background: 'rgba(59,130,246,.14)', border: '1px solid rgba(96,165,250,.20)', color: '#dbeafe' }
const offlineBadge: CSSProperties = { ...badge, background: 'rgba(245,158,11,.14)', border: '1px solid rgba(251,191,36,.20)', color: '#fef3c7' }
const button: CSSProperties = { minHeight: 42, borderRadius: 14, fontSize: 11, fontWeight: 950 }
const primary: CSSProperties = { ...button, border: '1px solid rgba(147,197,253,.26)', background: 'linear-gradient(180deg,#3b82f6,#1d4ed8)', color: '#fff' }
const actions: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 7 }
const secondary: CSSProperties = { ...button, minHeight: 38, border: '1px solid rgba(148,163,184,.14)', background: 'rgba(51,65,85,.66)', color: '#f8fafc' }
const messageBase: CSSProperties = { padding: '8px 10px', borderRadius: 12, fontSize: 10, fontWeight: 850 }
const messageOk: CSSProperties = { ...messageBase, background: 'rgba(34,197,94,.11)', color: '#dcfce7' }
const messageError: CSSProperties = { ...messageBase, background: 'rgba(220,38,38,.13)', color: '#fee2e2' }

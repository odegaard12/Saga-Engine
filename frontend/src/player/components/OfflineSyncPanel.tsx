import { useEffect, useState, type CSSProperties } from 'react'
import {
  flushOfflineEvents,
  loadOfflineSnapshot,
  type SagaOfflineSnapshot,
  type SagaSyncStatus,
} from '../offline/localFirst'

interface OfflineSyncPanelProps {
  user: string
}

const AUTO_SYNC_INTERVAL_MS = 20_000

function statusLabel(status: SagaSyncStatus): string {
  if (status === 'syncing') return 'SYNC EN CURSO'
  if (status === 'offline') return 'SIN CONEXIÓN'
  if (status === 'error') return 'ERROR SYNC'
  return 'ONLINE'
}

function getLastSyncLabel(value?: string): string {
  if (!value) return 'Nunca sincronizado'

  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return 'Última sincronización desconocida'

  const ageSeconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000))
  if (ageSeconds < 10) return 'Sincronizado ahora'
  if (ageSeconds < 60) return `Sincronizado hace ${ageSeconds}s`

  const ageMinutes = Math.round(ageSeconds / 60)
  if (ageMinutes < 60) return `Sincronizado hace ${ageMinutes}min`

  const ageHours = Math.round(ageMinutes / 60)
  return `Sincronizado hace ${ageHours}h`
}

export function OfflineSyncPanel({ user }: OfflineSyncPanelProps) {
  const [pendingCount, setPendingCount] = useState(0)
  const [syncStatus, setSyncStatus] = useState<SagaSyncStatus>('online')
  const [lastSyncLabel, setLastSyncLabel] = useState('Nunca sincronizado')
  const [syncing, setSyncing] = useState(false)

  function applySnapshot(snapshot: SagaOfflineSnapshot) {
    setPendingCount(snapshot.queued_events.length)
    setSyncStatus(snapshot.sync_status)
    setLastSyncLabel(getLastSyncLabel(snapshot.last_successful_sync_at))
  }

  async function syncNow() {
    if (syncing) return

    setSyncing(true)
    setSyncStatus('syncing')

    try {
      const snapshot = await flushOfflineEvents(user)
      applySnapshot(snapshot)
    } catch {
      const snapshot = loadOfflineSnapshot(user)
      applySnapshot({
        ...snapshot,
        sync_status: 'error',
      })
    } finally {
      setSyncing(false)
    }
  }

  useEffect(() => {
    if (typeof window === 'undefined') return

    let cancelled = false
    let autoSyncing = false

    function applyIfActive(snapshot: SagaOfflineSnapshot) {
      if (!cancelled) {
        applySnapshot(snapshot)
      }
    }

    async function refreshAndMaybeSync() {
      const current = loadOfflineSnapshot(user)
      applyIfActive(current)

      if (current.queued_events.length === 0 || autoSyncing) {
        return
      }

      autoSyncing = true
      applyIfActive({
        ...current,
        sync_status: 'syncing',
      })

      try {
        const next = await flushOfflineEvents(user)
        applyIfActive(next)
      } catch {
        const failed = loadOfflineSnapshot(user)
        applyIfActive({
          ...failed,
          sync_status: 'error',
        })
      } finally {
        autoSyncing = false
      }
    }

    refreshAndMaybeSync()
    const intervalId = window.setInterval(refreshAndMaybeSync, AUTO_SYNC_INTERVAL_MS)
    window.addEventListener('online', refreshAndMaybeSync)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
      window.removeEventListener('online', refreshAndMaybeSync)
    }
  }, [user])

  const disabled = syncing || pendingCount === 0

  return (
    <section style={panel}>
      <div style={headerRow}>
        <div>
          <div style={eyebrow}>Cola offline</div>
          <div style={title}>
            {pendingCount} pendientes · {statusLabel(syncing ? 'syncing' : syncStatus)}
          </div>
        </div>
        <button
          type="button"
          style={disabled ? syncButtonDisabled : syncButton}
          disabled={disabled}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            void syncNow()
          }}
        >
          {syncing ? 'Enviando…' : pendingCount > 0 ? 'Enviar ahora' : 'Al día'}
        </button>
      </div>
      <div style={body}>
        Las acciones pendientes se intentan enviar automáticamente cada{' '}
        {AUTO_SYNC_INTERVAL_MS / 1000}s cuando hay conexión. {lastSyncLabel}.
      </div>
    </section>
  )
}

const panel: CSSProperties = {
  display: 'grid',
  gap: 10,
  borderRadius: 18,
  border: '1px solid rgba(255,255,255,.12)',
  background: 'rgba(255,255,255,.06)',
  padding: 12,
}

const headerRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
}

const eyebrow: CSSProperties = {
  color: '#bbf7d0',
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
}

const title: CSSProperties = {
  marginTop: 4,
  color: '#ffffff',
  fontSize: 13,
  fontWeight: 900,
}

const body: CSSProperties = {
  color: 'rgba(226,232,240,.78)',
  fontSize: 12,
  lineHeight: 1.4,
}

const syncButton: CSSProperties = {
  minHeight: 38,
  padding: '0 12px',
  borderRadius: 14,
  border: '1px solid rgba(34,197,94,.22)',
  background: 'rgba(34,197,94,.18)',
  color: '#dcfce7',
  fontSize: 11,
  fontWeight: 900,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
}

const syncButtonDisabled: CSSProperties = {
  ...syncButton,
  border: '1px solid rgba(255,255,255,.08)',
  background: 'rgba(255,255,255,.06)',
  color: 'rgba(226,232,240,.62)',
}

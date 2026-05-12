import { useEffect, useState, type CSSProperties } from 'react'
import { fetchPlayerGame, fetchPublicConfig } from '../../shared/api'
import type { PlayerGamePayload } from '../../types/player'
import {
  getOfflineMissionSummary,
  queueOfflineEvent,
  saveLocalProgressSnapshot,
  saveMissionPack,
  syncPendingOfflineEvents,
  type OfflineMissionSummary,
} from '../offline/missionPack'

type MissionPackPanelProps = {
  user: string
  payload: PlayerGamePayload
}

export function MissionPackPanel({ user, payload }: MissionPackPanelProps) {
  const [summary, setSummary] = useState<OfflineMissionSummary | null>(null)
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    getOfflineMissionSummary(user)
      .then((nextSummary) => {
        if (!cancelled) setSummary(nextSummary)
      })
      .catch(() => {
        if (!cancelled) setSummary(null)
      })

    return () => {
      cancelled = true
    }
  }, [user, state])

  async function handleDownloadMission() {
    setState('saving')
    setMessage(null)

    try {
      const [config, offlinePayload] = await Promise.all([
        fetchPublicConfig(),
        fetchPlayerGame(user, { offlinePack: true }),
      ])

      const pack = await saveMissionPack({
        user,
        config,
        payload: offlinePayload,
      })

      setSummary(await getOfflineMissionSummary(user))
      setState('saved')
      setMessage(`Mission saved locally with ${pack.stage_count} nodes.`)
    } catch (error) {
      setState('error')
      setMessage(error instanceof Error ? error.message : 'Could not save mission locally.')
    }
  }

  async function handleSaveProgress() {
    setState('saving')
    setMessage(null)

    try {
      await saveLocalProgressSnapshot(payload)
      await queueOfflineEvent({
        user,
        type: payload.finished ? 'node_completed' : 'node_opened',
        source: 'offline_queue',
        node_id: payload.current_stage?.id,
        payload: {
          level: payload.level || 0,
          finished: Boolean(payload.finished),
          current_stage_id: payload.current_stage?.id,
          current_stage_title: payload.current_stage?.title,
        },
      })

      setSummary(await getOfflineMissionSummary(user))
      setState('saved')
      setMessage('Local progress snapshot saved and queued for sync.')
    } catch (error) {
      setState('error')
      setMessage(error instanceof Error ? error.message : 'Could not save local progress.')
    }
  }

  async function handleSyncPendingEvents() {
    setState('saving')
    setMessage(null)

    try {
      const result = await syncPendingOfflineEvents(user)
      setSummary(await getOfflineMissionSummary(user))

      if (result.status === 'ok') {
        setState('saved')
        setMessage(result.attempted === 0 ? 'No pending offline events.' : `Synced ${result.synced} offline events.`)
        return
      }

      setState('error')
      setMessage(result.message || `Could not sync ${result.failed} offline events.`)
    } catch (error) {
      setState('error')
      setMessage(error instanceof Error ? error.message : 'Could not sync pending events.')
    }
  }

  return (
    <section style={panel} aria-label="Offline mission pack">
      <div style={header}>
        <div>
          <div style={eyebrow}>OFFLINE MISSION</div>
          <div style={title}>Download for field play</div>
        </div>

        <span style={summary?.hasPack ? badgeReady : badgePending}>
          {summary?.hasPack ? 'READY' : 'NOT SAVED'}
        </span>
      </div>

      <div style={summaryGrid}>
        <Stat label="Nodes" value={String(summary?.stageCount || payload.stages?.length || 0)} />
        <Stat label="Level" value={String(summary?.currentLevel ?? payload.level ?? 0)} />
        <Stat label="Pending" value={String(summary?.pendingEvents || 0)} />
      </div>

      <p style={copy}>
        Save this mission to the phone before the route. If coverage drops later,
        SAGA can open the stored mission and keep local progress ready for sync.
      </p>

      {summary?.downloadedAt ? (
        <div style={meta}>
          Last local download: {new Date(summary.downloadedAt).toLocaleString()}
        </div>
      ) : null}

      {summary?.lastProgressAt ? (
        <div style={meta}>
          Last local progress: {new Date(summary.lastProgressAt).toLocaleString()}
        </div>
      ) : null}

      {message ? (
        <div style={state === 'error' ? errorBox : okBox}>{message}</div>
      ) : null}

      <div style={actions}>
        <button
          type="button"
          style={primaryButton}
          disabled={state === 'saving'}
          onClick={handleDownloadMission}
        >
          {state === 'saving' ? 'Saving…' : summary?.hasPack ? 'Update download' : 'Download mission'}
        </button>

        <button
          type="button"
          style={secondaryButton}
          disabled={state === 'saving'}
          onClick={handleSaveProgress}
        >
          Save progress
        </button>

        <button
          type="button"
          style={secondaryButton}
          disabled={state === 'saving' || !summary?.pendingEvents}
          onClick={handleSyncPendingEvents}
        >
          Sync pending
        </button>
      </div>
    </section>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={stat}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  )
}

const panel: CSSProperties = {
  display: 'grid',
  gap: 12,
  padding: 12,
  borderRadius: 20,
  border: '1px solid rgba(255,255,255,.10)',
  background: 'rgba(255,255,255,.055)',
}

const header: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: 12,
}

const eyebrow: CSSProperties = {
  color: '#93c5fd',
  fontSize: 9,
  fontWeight: 900,
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
}

const title: CSSProperties = {
  marginTop: 4,
  color: '#ffffff',
  fontSize: 17,
  fontWeight: 900,
  letterSpacing: '-0.03em',
}

const badgeBase: CSSProperties = {
  minHeight: 24,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 9px',
  borderRadius: 999,
  fontSize: 10,
  fontWeight: 900,
}

const badgeReady: CSSProperties = {
  ...badgeBase,
  background: 'rgba(34,197,94,.16)',
  border: '1px solid rgba(74,222,128,.20)',
  color: '#dcfce7',
}

const badgePending: CSSProperties = {
  ...badgeBase,
  background: 'rgba(245,158,11,.16)',
  border: '1px solid rgba(251,191,36,.22)',
  color: '#fef3c7',
}

const summaryGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  gap: 8,
}

const stat: CSSProperties = {
  display: 'grid',
  gap: 2,
  padding: 9,
  borderRadius: 16,
  border: '1px solid rgba(255,255,255,.08)',
  background: 'rgba(15,23,42,.24)',
  textAlign: 'center',
}

const copy: CSSProperties = {
  margin: 0,
  color: 'rgba(226,232,240,.78)',
  fontSize: 11,
  lineHeight: 1.4,
}

const meta: CSSProperties = {
  color: 'rgba(226,232,240,.72)',
  fontSize: 10,
  lineHeight: 1.3,
}

const actions: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  gap: 8,
}

const buttonBase: CSSProperties = {
  minHeight: 40,
  borderRadius: 16,
  fontSize: 11,
  fontWeight: 900,
  border: '1px solid rgba(255,255,255,.12)',
}

const primaryButton: CSSProperties = {
  ...buttonBase,
  background: 'rgba(59,130,246,.22)',
  color: '#dbeafe',
}

const secondaryButton: CSSProperties = {
  ...buttonBase,
  background: 'rgba(255,255,255,.08)',
  color: '#f8fafc',
}

const okBox: CSSProperties = {
  borderRadius: 14,
  padding: 9,
  background: 'rgba(34,197,94,.12)',
  border: '1px solid rgba(74,222,128,.18)',
  color: '#dcfce7',
  fontSize: 11,
}

const errorBox: CSSProperties = {
  ...okBox,
  background: 'rgba(220,38,38,.16)',
  border: '1px solid rgba(248,113,113,.22)',
  color: '#fee2e2',
}

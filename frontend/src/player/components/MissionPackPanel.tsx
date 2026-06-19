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
import { cachePlayerShell } from '../offline/pwaShell'

type MissionPackPanelProps = {
  user: string
  payload: PlayerGamePayload
}

type ActionKind =
  | 'download'
  | 'save'
  | 'sync'
  | null

type PanelMessage = {
  tone: 'ok' | 'error' | 'info'
  text: string
}

function formatDate(value?: string) {
  if (!value) return 'Nunca'

  const parsed = Date.parse(value)

  if (!Number.isFinite(parsed)) {
    return 'Fecha desconocida'
  }

  return new Date(parsed).toLocaleString()
}

export function MissionPackPanel({
  user,
  payload,
}: MissionPackPanelProps) {
  const [summary, setSummary] =
    useState<OfflineMissionSummary | null>(null)

  const [queueSnapshot, setQueueSnapshot] =
    useState<SagaOfflineSnapshot>(() =>
      loadOfflineSnapshot(user)
    )

  const [busyAction, setBusyAction] =
    useState<ActionKind>(null)

  const [message, setMessage] =
    useState<PanelMessage | null>(null)

  const [online, setOnline] =
    useState(
      typeof navigator === 'undefined'
        ? true
        : navigator.onLine !== false
    )

  const refreshPanelState =
    useCallback(async () => {
      let nextSummary:
        | OfflineMissionSummary
        | null = null

      try {
        nextSummary =
          await getOfflineMissionSummary(user)
      } catch {
        nextSummary = null
      }

      const nextQueue =
        loadOfflineSnapshot(user)

      const nextOnline =
        typeof navigator === 'undefined'
          ? true
          : navigator.onLine !== false

      setSummary(nextSummary)
      setQueueSnapshot(nextQueue)
      setOnline(nextOnline)

      return {
        summary: nextSummary,
        queue: nextQueue,
        online: nextOnline,
      }
    }, [user])

  useEffect(() => {
    let cancelled = false

    async function refresh() {
      if (cancelled) return
      await refreshPanelState()
    }

    const triggerRefresh = () => {
      void refresh()
    }

    void refresh()

    const intervalId =
      window.setInterval(triggerRefresh, 5000)

    window.addEventListener(
      'online',
      triggerRefresh
    )

    window.addEventListener(
      'offline',
      triggerRefresh
    )

    window.addEventListener(
      'storage',
      triggerRefresh
    )

    return () => {
      cancelled = true
      window.clearInterval(intervalId)

      window.removeEventListener(
        'online',
        triggerRefresh
      )

      window.removeEventListener(
        'offline',
        triggerRefresh
      )

      window.removeEventListener(
        'storage',
        triggerRefresh
      )
    }
  }, [refreshPanelState])

  const hasPack =
    Boolean(summary?.hasPack)

  const missionPending =
    summary?.pendingEvents || 0

  const physicalPending =
    queueSnapshot.queued_events.length

  const totalPending =
    missionPending + physicalPending

  const stageCount =
    summary?.stageCount ||
    payload.stages?.length ||
    0

  const currentLevel =
    summary?.currentLevel ??
    payload.level ??
    0

  const working =
    busyAction !== null

  async function handleDownloadMission() {
    if (working) return

    setBusyAction('download')
    setMessage(null)

    try {
      const [config, offlinePayload] =
        await Promise.all([
          fetchPublicConfig(),
          fetchPlayerGame(
            user,
            { offlinePack: true }
          ),
        ])

      const pack =
        await saveMissionPack({
          user,
          config,
          payload: offlinePayload,
        })

      await cachePlayerShell(
        `/player/${encodeURIComponent(user)}`
      ).catch(() => undefined)

      await refreshPanelState()

      setMessage({
        tone: 'ok',
        text:
          `Juego offline actualizado: ` +
          `${pack.stage_count} nodo` +
          `${pack.stage_count === 1 ? '' : 's'} ` +
          `guardado${pack.stage_count === 1 ? '' : 's'} ` +
          `en este teléfono.`,
      })
    } catch (error) {
      setMessage({
        tone: 'error',
        text:
          error instanceof Error
            ? error.message
            : 'No se pudo descargar el juego offline.',
      })
    } finally {
      setBusyAction(null)
    }
  }

  async function handleSaveProgress() {
    if (working) return

    setBusyAction('save')
    setMessage(null)

    try {
      await saveLocalProgressSnapshot(payload)
      await refreshPanelState()

      setMessage({
        tone: 'ok',
        text:
          'Avance actual guardado en este teléfono. ' +
          'Los avances de juego pendientes permanecen en su cola real.',
      })
    } catch (error) {
      setMessage({
        tone: 'error',
        text:
          error instanceof Error
            ? error.message
            : 'No se pudo guardar el avance.',
      })
    } finally {
      setBusyAction(null)
    }
  }

  async function handleSync() {
    if (working) return

    if (
      typeof navigator !== 'undefined' &&
      navigator.onLine === false
    ) {
      setMessage({
        tone: 'error',
        text:
          'No hay conexión. Las acciones siguen guardadas y se enviarán al recuperarla.',
      })
      return
    }

    setBusyAction('sync')
    setMessage(null)

    try {
      const physicalBefore =
        loadOfflineSnapshot(user)
          .queued_events.length

      // Primero progreso de misión; después QR,
      // inventario y códigos físicos.
      const missionResult =
        await syncPendingOfflineEvents(user)

      const physicalAfter =
        await flushOfflineEvents(user)

      const refreshed =
        await refreshPanelState()

      const physicalSynced =
        Math.max(
          0,
          physicalBefore -
            physicalAfter.queued_events.length
        )

      const remaining =
        (refreshed.summary?.pendingEvents || 0) +
        refreshed.queue.queued_events.length

      const failed =
        missionResult.status === 'error' ||
        physicalAfter.sync_status === 'error'

      if (failed || remaining > 0) {
        setMessage({
          tone: 'error',
          text:
            `Sincronización parcial. ` +
            `${remaining} acción` +
            `${remaining === 1 ? '' : 'es'} ` +
            `permanece${remaining === 1 ? '' : 'n'} pendiente` +
            `${remaining === 1 ? '' : 's'}.`,
        })
      } else {
        const sent =
          missionResult.synced +
          physicalSynced

        setMessage({
          tone: 'ok',
          text:
            sent > 0
              ? `Sincronización completada: ${sent} acción${sent === 1 ? '' : 'es'} enviada${sent === 1 ? '' : 's'}.`
              : 'Todo está sincronizado.',
        })
      }
    } catch (error) {
      setMessage({
        tone: 'error',
        text:
          error instanceof Error
            ? error.message
            : 'No se pudo sincronizar.',
      })
    } finally {
      setBusyAction(null)
    }
  }

  return (
    <section
      style={panel}
      aria-label="Control del juego offline"
    >
      <div style={header}>
        <div>
          <div style={eyebrow}>
            CONTROL OFFLINE
          </div>

          <div style={title}>
            Juego offline
          </div>

          <div style={subtitle}>
            Descarga, guarda y sincroniza desde un único lugar.
          </div>
        </div>

        <div style={badgeColumn}>
          <span
            style={
              online
                ? badgeOnline
                : badgeOffline
            }
          >
            {online ? 'ONLINE' : 'SIN RED'}
          </span>

          <span
            style={
              hasPack
                ? badgeReady
                : badgePending
            }
          >
            {hasPack ? 'LISTO' : 'SIN DESCARGAR'}
          </span>
        </div>
      </div>

      <div style={summaryGrid}>
        <Stat
          label="Nodos"
          value={String(stageCount)}
        />

        <Stat
          label="Nivel"
          value={String(currentLevel)}
        />

        <Stat
          label="Pendientes"
          value={String(totalPending)}
          warn={totalPending > 0}
        />
      </div>

      <div style={queueDetail}>
        <span>
          Avance: {missionPending}
        </span>

        <span>
          QR / objetos: {physicalPending}
        </span>
      </div>

      <button
        type="button"
        style={
          working
            ? primaryButtonDisabled
            : primaryButton
        }
        disabled={working}
        onClick={handleDownloadMission}
      >
        {busyAction === 'download'
          ? 'Preparando juego offline…'
          : hasPack
            ? 'Actualizar juego offline'
            : 'Descargar juego offline'}
      </button>

      <div style={secondaryActions}>
        <button
          type="button"
          style={
            working
              ? secondaryButtonDisabled
              : secondaryButton
          }
          disabled={working}
          onClick={handleSaveProgress}
        >
          {busyAction === 'save'
            ? 'Guardando…'
            : 'Guardar avance actual'}
        </button>

        <button
          type="button"
          style={
            working ||
            totalPending === 0 ||
            !online
              ? syncButtonDisabled
              : syncButton
          }
          disabled={
            working ||
            totalPending === 0 ||
            !online
          }
          onClick={handleSync}
        >
          {busyAction === 'sync'
            ? 'Sincronizando…'
            : totalPending > 0
              ? 'Sincronizar ahora'
              : 'Todo sincronizado'}
        </button>
      </div>

      <div style={metadata}>
        <span>
          Última descarga:
          {' '}
          {formatDate(summary?.downloadedAt)}
        </span>

        <span>
          Último avance local:
          {' '}
          {formatDate(summary?.lastProgressAt)}
        </span>

        <span>
          Última sincronización QR:
          {' '}
          {formatDate(
            queueSnapshot
              .last_successful_sync_at
          )}
        </span>
      </div>

      {message ? (
        <div
          style={
            message.tone === 'error'
              ? errorBox
              : message.tone === 'ok'
                ? okBox
                : infoBox
          }
        >
          {message.text}
        </div>
      ) : null}

      <p style={copy}>
        La sincronización automática sigue activa.
        Estos botones permiten preparar o forzar el proceso
        manualmente cuando lo necesites.
      </p>
    </section>
  )
}

function Stat({
  label,
  value,
  warn = false,
}: {
  label: string
  value: string
  warn?: boolean
}) {
  return (
    <div
      style={
        warn
          ? statWarn
          : stat
      }
    >
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  )
}

const panel: CSSProperties = {
  display: 'grid',
  gap: 12,
  padding: 13,
  borderRadius: 22,
  border:
    '1px solid rgba(96,165,250,.20)',
  background:
    'radial-gradient(circle at top left, rgba(59,130,246,.15), transparent 40%), rgba(15,23,42,.34)',
  boxShadow:
    'inset 0 1px 0 rgba(255,255,255,.05)',
}

const header: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 12,
}

const eyebrow: CSSProperties = {
  color: '#93c5fd',
  fontSize: 9,
  fontWeight: 950,
  letterSpacing: '0.16em',
}

const title: CSSProperties = {
  marginTop: 3,
  color: '#ffffff',
  fontSize: 18,
  fontWeight: 950,
  letterSpacing: '-0.03em',
}

const subtitle: CSSProperties = {
  marginTop: 4,
  color: 'rgba(226,232,240,.74)',
  fontSize: 11,
  lineHeight: 1.35,
}

const badgeColumn: CSSProperties = {
  display: 'grid',
  justifyItems: 'end',
  gap: 5,
}

const badgeBase: CSSProperties = {
  minHeight: 22,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 8px',
  borderRadius: 999,
  fontSize: 9,
  fontWeight: 950,
  whiteSpace: 'nowrap',
}

const badgeOnline: CSSProperties = {
  ...badgeBase,
  border:
    '1px solid rgba(74,222,128,.20)',
  background: 'rgba(34,197,94,.15)',
  color: '#dcfce7',
}

const badgeOffline: CSSProperties = {
  ...badgeBase,
  border:
    '1px solid rgba(248,113,113,.22)',
  background: 'rgba(220,38,38,.16)',
  color: '#fee2e2',
}

const badgeReady: CSSProperties = {
  ...badgeBase,
  border:
    '1px solid rgba(96,165,250,.22)',
  background: 'rgba(59,130,246,.17)',
  color: '#dbeafe',
}

const badgePending: CSSProperties = {
  ...badgeBase,
  border:
    '1px solid rgba(251,191,36,.24)',
  background: 'rgba(245,158,11,.15)',
  color: '#fef3c7',
}

const summaryGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns:
    'repeat(3, minmax(0, 1fr))',
  gap: 7,
}

const stat: CSSProperties = {
  display: 'grid',
  gap: 1,
  padding: '9px 6px',
  borderRadius: 15,
  border:
    '1px solid rgba(255,255,255,.08)',
  background: 'rgba(255,255,255,.055)',
  textAlign: 'center',
  color: '#f8fafc',
  fontSize: 11,
}

const statWarn: CSSProperties = {
  ...stat,
  border:
    '1px solid rgba(251,191,36,.20)',
  background: 'rgba(245,158,11,.11)',
  color: '#fef3c7',
}

const queueDetail: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  justifyContent: 'space-between',
  gap: 6,
  color: 'rgba(226,232,240,.74)',
  fontSize: 10,
  fontWeight: 800,
}

const buttonBase: CSSProperties = {
  minHeight: 45,
  borderRadius: 16,
  fontSize: 11,
  fontWeight: 950,
  letterSpacing: '0.035em',
}

const primaryButton: CSSProperties = {
  ...buttonBase,
  width: '100%',
  border:
    '1px solid rgba(96,165,250,.26)',
  background:
    'linear-gradient(180deg, rgba(59,130,246,.92), rgba(37,99,235,.88))',
  color: '#ffffff',
  boxShadow:
    '0 12px 26px rgba(37,99,235,.20)',
}

const primaryButtonDisabled: CSSProperties = {
  ...primaryButton,
  opacity: 0.55,
  cursor: 'not-allowed',
}

const secondaryActions: CSSProperties = {
  display: 'grid',
  gridTemplateColumns:
    'repeat(2, minmax(0, 1fr))',
  gap: 8,
}

const secondaryButton: CSSProperties = {
  ...buttonBase,
  border:
    '1px solid rgba(255,255,255,.12)',
  background: 'rgba(255,255,255,.08)',
  color: '#f8fafc',
}

const secondaryButtonDisabled: CSSProperties = {
  ...secondaryButton,
  opacity: 0.5,
  cursor: 'not-allowed',
}

const syncButton: CSSProperties = {
  ...buttonBase,
  border:
    '1px solid rgba(74,222,128,.22)',
  background: 'rgba(34,197,94,.17)',
  color: '#dcfce7',
}

const syncButtonDisabled: CSSProperties = {
  ...syncButton,
  border:
    '1px solid rgba(255,255,255,.08)',
  background: 'rgba(255,255,255,.055)',
  color: 'rgba(226,232,240,.55)',
  cursor: 'not-allowed',
}

const metadata: CSSProperties = {
  display: 'grid',
  gap: 3,
  color: 'rgba(226,232,240,.64)',
  fontSize: 9,
  lineHeight: 1.35,
}

const copy: CSSProperties = {
  margin: 0,
  color: 'rgba(226,232,240,.66)',
  fontSize: 10,
  lineHeight: 1.4,
}

const messageBase: CSSProperties = {
  padding: 9,
  borderRadius: 13,
  fontSize: 10,
  fontWeight: 800,
  lineHeight: 1.4,
}

const okBox: CSSProperties = {
  ...messageBase,
  border:
    '1px solid rgba(74,222,128,.18)',
  background: 'rgba(34,197,94,.12)',
  color: '#dcfce7',
}

const errorBox: CSSProperties = {
  ...messageBase,
  border:
    '1px solid rgba(248,113,113,.22)',
  background: 'rgba(220,38,38,.15)',
  color: '#fee2e2',
}

const infoBox: CSSProperties = {
  ...messageBase,
  border:
    '1px solid rgba(96,165,250,.20)',
  background: 'rgba(59,130,246,.13)',
  color: '#dbeafe',
}

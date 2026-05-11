import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { t } from '../../i18n'
import { loadInventorySnapshot, type InventorySnapshot } from '../offline/inventory'

interface RequirementPreviewPanelProps {
  user: string
  stage?: unknown
}

type Requirement = {
  itemId: string
  label: string
  quantity: number
  consume: boolean
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function readString(source: Record<string, unknown>, key: string) {
  const value = source[key]
  return typeof value === 'string' ? value.trim() : ''
}

function readBoolean(source: Record<string, unknown>, key: string) {
  const value = source[key]
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') return value.toLowerCase() === 'true'
  return false
}

function readQuantity(source: Record<string, unknown>, key: string) {
  const value = source[key]
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : 1

  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1
}

function readRequirement(stage?: unknown): Requirement | null {
  const stageRecord = asRecord(stage)
  if (!Object.keys(stageRecord).length) return null

  const config = asRecord(stageRecord.config)
  const source = {
    ...stageRecord,
    ...config,
  }

  const itemId = readString(source, 'required_item_id')
  const label = readString(source, 'required_item_label') || itemId
  const quantity = readQuantity(source, 'required_item_quantity')
  const consume = readBoolean(source, 'required_item_consume')

  if (!itemId && !label) return null
  if (!itemId) return null

  return {
    itemId,
    label,
    quantity,
    consume,
  }
}

function countOwned(snapshot: InventorySnapshot, itemId: string) {
  return snapshot.items
    .filter((item) => item.item_id === itemId)
    .reduce((total, item) => total + Math.max(0, item.quantity || 0), 0)
}

export function RequirementPreviewPanel({ user, stage }: RequirementPreviewPanelProps) {
  const [snapshot, setSnapshot] = useState(() => loadInventorySnapshot(user))

  useEffect(() => {
    const refresh = () => setSnapshot(loadInventorySnapshot(user))

    refresh()
    window.addEventListener('storage', refresh)
    window.addEventListener('saga:locale-change', refresh)

    const timer = window.setInterval(refresh, 2500)

    return () => {
      window.removeEventListener('storage', refresh)
      window.removeEventListener('saga:locale-change', refresh)
      window.clearInterval(timer)
    }
  }, [user])

  const requirement = useMemo(() => readRequirement(stage), [stage])

  if (!requirement) return null

  const owned = countOwned(snapshot, requirement.itemId)
  const hasEnough = owned >= requirement.quantity

  return (
    <section style={styles.card} aria-label={t('player.requirements.title')}>
      <div style={styles.header}>
        <span style={styles.kicker}>{t('player.requirements.title')}</span>
        <span style={hasEnough ? styles.okBadge : styles.missingBadge}>
          {hasEnough ? t('player.requirements.youHave') : t('player.requirements.missing')}
        </span>
      </div>

      <div style={styles.row}>
        <strong>{t('player.requirements.needs')}</strong>
        <span>{requirement.label}</span>
      </div>

      <div style={styles.row}>
        <strong>{t('player.requirements.quantity')}</strong>
        <span>{owned}/{requirement.quantity}</span>
      </div>

      {requirement.consume ? (
        <div style={styles.note}>{t('player.requirements.consume')}</div>
      ) : null}

      <div style={styles.preview}>{t('player.requirements.previewOnly')}</div>
    </section>
  )
}

const styles: Record<string, CSSProperties> = {
  card: {
    display: 'grid',
    gap: 8,
    padding: 12,
    borderRadius: 18,
    background: 'rgba(15, 23, 42, 0.72)',
    border: '1px solid rgba(148, 163, 184, 0.24)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  kicker: {
    color: 'rgba(226, 232, 240, 0.82)',
    fontSize: 11,
    fontWeight: 900,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
  },
  okBadge: {
    borderRadius: 999,
    padding: '4px 8px',
    background: 'rgba(34, 197, 94, 0.18)',
    color: '#bbf7d0',
    fontSize: 11,
    fontWeight: 900,
    textTransform: 'uppercase',
  },
  missingBadge: {
    borderRadius: 999,
    padding: '4px 8px',
    background: 'rgba(248, 113, 113, 0.18)',
    color: '#fecaca',
    fontSize: 11,
    fontWeight: 900,
    textTransform: 'uppercase',
  },
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 10,
    color: 'rgba(226, 232, 240, 0.92)',
    fontSize: 13,
  },
  note: {
    color: '#fde68a',
    fontSize: 12,
    fontWeight: 800,
  },
  preview: {
    color: 'rgba(203, 213, 225, 0.72)',
    fontSize: 12,
    lineHeight: 1.35,
  },
}

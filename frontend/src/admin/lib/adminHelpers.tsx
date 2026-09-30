import { familyCards } from './familyConfigs'
import type { AdminReactOverviewProfile, AdminReactOverviewStage } from './adminApi'

/**
 * Funciones puras y tarjetas pequeñas del panel de administración.
 *
 * Vivían al principio y al final de `AdminApp.tsx`, alrededor del componente de
 * 1 400 líneas. Se sacan tal cual: sin cambios de lógica ni de nombres.
 */

export function slugifyMissionItemId(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80)
}

export function buildTemplatePhysicalFields(
  kind: 'collectible' | 'requirement' | 'clue' | 'bonus',
  label: string
) {
  const itemId = slugifyMissionItemId(label) || 'objeto_qr'
  const payload = itemId

  return {
    physical_node_kind: kind,
    physical_item_kind: kind,
    physical_item_id: itemId,
    physical_item_label: label,
    physical_qr: {
      kind,
      item_id: itemId,
      label,
      payload,
    },
    qr_payload: payload,
  }
}

export function preservePhysicalStageFields<T extends Record<string, unknown>>(previous: T, next: T): T {
  const keys = [
    'physical_node_kind',
    'physical_item_kind',
    'physical_item_id',
    'physical_item_label',
    'physical_qr',
    'qr_payload',
  ] as const

  const merged = { ...next } as Record<string, unknown>
  const clearPhysical =
    merged._clear_physical_fields === true ||
    merged._physical_node_mode === 'normal' ||
    merged.physical_node_kind === null ||
    merged.physical_item_kind === null

  if (clearPhysical) {
    for (const key of keys) {
      delete merged[key]
    }
    delete merged._clear_physical_fields
    delete merged._physical_node_mode
    return merged as T
  }

  for (const key of keys) {
    if (!(key in merged) && key in previous) {
      merged[key] = previous[key]
    }
  }

  return merged as T
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function StatCard({
  item,
  compact = false,
}: {
  item: { label: string; value: string; detail: string }
  compact?: boolean
}) {
  return (
    <article className={compact ? 'admin-stat compact' : 'admin-stat'}>
      <span>{item.label}</span>
      <strong>{item.value}</strong>
      <small>{item.detail}</small>
    </article>
  )
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function SectionHeader({ title, count }: { title: string; count: number }) {
  return (
    <div className="admin-section-head">
      <h2>{title}</h2>
      <span className="pill neutral">{count}</span>
    </div>
  )
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function ProfileCard({ profile }: { profile: AdminReactOverviewProfile }) {
  const finished = Boolean(profile.finished)
  const gps = String(profile.gps_status || 'unknown')
  const lastSeen = formatLastSeen(profile.last_seen)

  return (
    <article className="admin-profile-card">
      <div>
        <strong>{profile.display_name || profile.id}</strong>
        <small>
          {profile.mode || 'solo'} · {profile.status || 'active'}
        </small>
      </div>

      <div className="admin-badge-row">
        <span className={finished ? 'pill ok' : 'pill neutral'}>
          {finished ? 'Finished' : `Level ${profile.level ?? 0}`}
        </span>
        <span className={gpsClass(gps)}>GPS {gps}</span>
        <span className="pill neutral">{profile.presence || 'unknown'}</span>
      </div>

      <small>{lastSeen}</small>
    </article>
  )
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function NodeCard({
  stage,
  selected,
  onOpen,
}: {
  stage: AdminReactOverviewStage
  selected: boolean
  onOpen: () => void
}) {
  const radius = stage.radius ?? 50
  const family = familyCards.find((item) => item.id === stage.type)
  const coords = formatCoords(stage.lat, stage.lon)

  return (
    <button
      type="button"
      className={selected ? 'admin-node-card selected' : 'admin-node-card'}
      onClick={onOpen}
    >
      <div className="admin-node-top">
        <span>{stage.index + 1}</span>
        <div>
          <strong>{stage.title || 'Nodo sin título'}</strong>
          <small>
            {family?.icon || '◇'} {stage.label || stage.type}
          </small>
        </div>
      </div>

      <div className="admin-node-meta">
        <span>{stage.entry_mode || 'gps'}</span>
        <span>{radius}m</span>
        <span>{coords}</span>
      </div>
      {stage.type_fallback_reason ? (
        <div className="admin-node-warning" title={stage.type_fallback_reason}>
          ⚠️ Tipo de juego &quot;{stage.raw_type}&quot; no soportado — usando {stage.type} como reserva
        </div>
      ) : null}
    </button>
  )
}

export function formatCoords(lat?: number | null, lon?: number | null) {
  if (typeof lat !== 'number' || typeof lon !== 'number') return '—'
  return `${lat.toFixed(5)}, ${lon.toFixed(5)}`
}

export function formatLastSeen(value?: number | string | null) {
  if (value === undefined || value === null || value === '') return 'No heartbeat yet'

  let ts: number | null = null

  if (typeof value === 'number') {
    ts = value
  } else {
    const asNumber = Number(value)
    if (Number.isFinite(asNumber)) {
      ts = asNumber
    } else {
      const parsed = Date.parse(value)
      if (Number.isFinite(parsed)) ts = Math.floor(parsed / 1000)
    }
  }

  if (!ts) return 'No heartbeat yet'
  if (ts > 1000000000000) ts = Math.floor(ts / 1000)

  const now = Math.floor(Date.now() / 1000)
  const delta = Math.max(0, now - ts)

  if (delta < 60) return 'Seen just now'
  if (delta < 3600) return `Seen ${Math.floor(delta / 60)} min ago`
  if (delta < 86400) return `Seen ${Math.floor(delta / 3600)} h ago`
  return `Seen ${Math.floor(delta / 86400)} d ago`
}

export function gpsClass(gps: string) {
  const normalized = gps.toLowerCase()
  if (normalized === 'ok' || normalized === 'ready') return 'pill ok'
  if (normalized === 'searching' || normalized === 'stale') return 'pill warn'
  return 'pill neutral'
}

/**
 * La fecha de salida se guarda CON zona horaria.
 *
 * El <input type="datetime-local"> da "2026-02-14T09:00", sin zona. Guardado
 * tal cual, el servidor (un contenedor en UTC) y el móvil (hora local) lo
 * leían en husos distintos: la cortina se levantaba a la hora y el servidor
 * seguía rechazando avanzar durante dos horas. Con la zona del navegador del
 * organizador dentro -"2026-02-14T09:00:00+01:00"- no hay nada que asumir.
 */
export function fechaConZona(valor: string): string {
  const texto = String(valor || '').trim()
  if (!texto) return ''
  if (/[zZ]$|[+-]\d{2}:\d{2}$/.test(texto)) return texto
  const ms = Date.parse(texto)
  if (!Number.isFinite(ms)) return texto
  const fecha = new Date(ms)
  const dos = (n: number) => String(n).padStart(2, '0')
  const desfase = -fecha.getTimezoneOffset()
  const signo = desfase >= 0 ? '+' : '-'
  const abs = Math.abs(desfase)
  return (
    `${fecha.getFullYear()}-${dos(fecha.getMonth() + 1)}-${dos(fecha.getDate())}` +
    `T${dos(fecha.getHours())}:${dos(fecha.getMinutes())}:00` +
    `${signo}${dos(Math.floor(abs / 60))}:${dos(abs % 60)}`
  )
}

/** Lo contrario: de la fecha guardada (con zona) a lo que entiende el input, en hora local. */
export function fechaParaElInput(valor: string): string {
  const texto = String(valor || '').trim()
  if (!texto) return ''
  const ms = Date.parse(texto)
  if (!Number.isFinite(ms)) return texto
  const fecha = new Date(ms)
  const dos = (n: number) => String(n).padStart(2, '0')
  return (
    `${fecha.getFullYear()}-${dos(fecha.getMonth() + 1)}-${dos(fecha.getDate())}` +
    `T${dos(fecha.getHours())}:${dos(fecha.getMinutes())}`
  )
}

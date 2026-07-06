export type PhysicalNodeKind = 'collectible' | 'requirement' | 'clue' | 'bonus'

export type PhysicalNodeVisual = {
  kind: PhysicalNodeKind
  icon: string
  label: string
  shortLabel: string
  tone: string
}

const physicalNodeVisuals: Record<PhysicalNodeKind, PhysicalNodeVisual> = {
  collectible: {
    kind: 'collectible',
    icon: '⭐',
    label: 'Coleccionable',
    shortLabel: 'Coleccionable',
    tone: 'collectible',
  },
  requirement: {
    kind: 'requirement',
    icon: '🔑',
    label: 'Llave QR',
    shortLabel: 'Llave',
    tone: 'requirement',
  },
  clue: {
    kind: 'clue',
    icon: '🧩',
    label: 'Pista QR',
    shortLabel: 'Pista',
    tone: 'clue',
  },
  bonus: {
    kind: 'bonus',
    icon: '🎁',
    label: 'Bonus QR',
    shortLabel: 'Bonus',
    tone: 'bonus',
  },
}

export function normalizePhysicalKind(value: unknown): PhysicalNodeKind | null {
  if (value === 'collectible' || value === 'requirement' || value === 'clue' || value === 'bonus') {
    return value
  }

  return null
}

export function getPhysicalNodeKind(stage: unknown): PhysicalNodeKind | null {
  if (!stage || typeof stage !== 'object') return null

  const record = stage as Record<string, unknown>
  const flatKind = normalizePhysicalKind(record.physical_node_kind || record.physical_item_kind)

  if (flatKind) return flatKind

  const physicalQr = record.physical_qr
  if (physicalQr && typeof physicalQr === 'object') {
    const qrKind = normalizePhysicalKind((physicalQr as Record<string, unknown>).kind)
    if (qrKind) return qrKind
  }

  return null
}

export function getPhysicalNodeVisual(stage: unknown): PhysicalNodeVisual | null {
  const kind = getPhysicalNodeKind(stage)
  if (!kind) return null
  const record = stage as Record<string, unknown>
  const customIcon =
    record.physical_icon ||
    record.icon ||
    (record.config &&
      typeof record.config === 'object' &&
      (record.config as Record<string, unknown>).physical_icon)
  const baseVisual = physicalNodeVisuals[kind]
  if (customIcon) {
    return {
      ...baseVisual,
      icon: String(customIcon),
    }
  }
  return baseVisual
}

export function getPhysicalNodeMapLabel(stage: unknown): string {
  const visual = getPhysicalNodeVisual(stage)
  if (!visual) return ''
  const record = stage as Record<string, unknown>
  const isMapCollectible =
    record.config &&
    typeof record.config === 'object' &&
    (record.config as Record<string, unknown>).is_map_collectible
  if (isMapCollectible) {
    return `${visual.icon} Coleccionable`
  }
  return `${visual.icon} ${visual.shortLabel}`
}

export function getPhysicalNodeAccessibleLabel(stage: unknown): string {
  const visual = getPhysicalNodeVisual(stage)
  if (!visual) return 'Nodo normal'
  const record = stage as Record<string, unknown>
  const isMapCollectible =
    record.config &&
    typeof record.config === 'object' &&
    (record.config as Record<string, unknown>).is_map_collectible
  if (isMapCollectible) {
    return `${visual.label} coleccionable en mapa`
  }
  return `${visual.label} físico con QR`
}

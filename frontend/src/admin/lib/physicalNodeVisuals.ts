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
    shortLabel: 'Objeto',
    tone: 'collectible',
  },
  requirement: {
    kind: 'requirement',
    icon: '🔒',
    label: 'Requisito',
    shortLabel: 'Requisito',
    tone: 'requirement',
  },
  clue: {
    kind: 'clue',
    icon: '🧩',
    label: 'Pista',
    shortLabel: 'Pista',
    tone: 'clue',
  },
  bonus: {
    kind: 'bonus',
    icon: '🎁',
    label: 'Bonus',
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
  return kind ? physicalNodeVisuals[kind] : null
}

export function getPhysicalNodeMapLabel(stage: unknown): string {
  const visual = getPhysicalNodeVisual(stage)
  return visual ? `${visual.icon} ${visual.shortLabel}` : ''
}

export function getPhysicalNodeAccessibleLabel(stage: unknown): string {
  const visual = getPhysicalNodeVisual(stage)
  return visual ? `${visual.label} físico con QR` : 'Nodo normal'
}

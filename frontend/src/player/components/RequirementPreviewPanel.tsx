import type { CSSProperties } from 'react'
import type { PlayerStage } from '../../types/player'

interface RequirementPreviewPanelProps {
  user: string
  stage: PlayerStage | null
}

function getValue(stage: PlayerStage | null, keys: string[]): unknown {
  if (!stage) return undefined
  const source = stage as unknown as Record<string, unknown>
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null && source[key] !== '') {
      return source[key]
    }
  }
  return undefined
}

function getString(stage: PlayerStage | null, keys: string[], fallback = ''): string {
  const value = getValue(stage, keys)
  return typeof value === 'string' ? value : fallback
}

function getNumber(stage: PlayerStage | null, keys: string[]): number | null {
  const value = getValue(stage, keys)
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function getBoolean(stage: PlayerStage | null, keys: string[]): boolean {
  const value = getValue(stage, keys)
  return value === true || value === 'true' || value === '1'
}

function getFamily(stage: PlayerStage | null): string {
  return getString(stage, ['family', 'minigame_family', 'game_family', 'type'], 'unknown')
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
}

function getGameTitle(family: string): string {
  if (family.includes('signal')) return 'Busqueda de senal'
  if (family.includes('bearing')) return 'Rumbo / brujula'
  if (family.includes('circuit')) return 'Circuito logico'
  return 'Nodo de mision'
}

function getGameHowTo(stage: PlayerStage | null): string[] {
  const family = getFamily(stage)

  if (family.includes('signal')) {
    return [
      'Activa GPS y acercate al punto del mapa.',
      'Cuando estes dentro del radio, mantente estable hasta capturar la senal.',
      'Si no entra, pulsa Reactivar GPS desde Herramientas y prueba al aire libre.',
    ]
  }

  if (family.includes('bearing')) {
    return [
      'Permite orientacion/brujula si el movil lo solicita.',
      'Gira despacio hasta apuntar al rumbo correcto.',
      'Si el sensor falla, usa las pistas del nodo o el modo manual cuando este disponible.',
    ]
  }

  if (family.includes('circuit')) {
    return [
      'Lee la pista y resuelve el patron del circuito.',
      'Prueba combinaciones con calma: este nodo depende mas de logica que de GPS.',
      'Si hay un objeto fisico asociado, guardalo primero en la mochila.',
    ]
  }

  return [
    'Lee la pista del nodo actual.',
    'Cumple los requisitos indicados antes de intentar abrirlo.',
    'Usa Mochila o Coger si el nodo depende de un objeto fisico.',
  ]
}

export function RequirementPreviewPanel({ user, stage }: RequirementPreviewPanelProps) {
  if (!stage) {
    return (
      <section style={panel}>
        <div style={eyebrow}>REQUISITOS</div>
        <div style={title}>Sin nodo seleccionado</div>
        <p style={copy}>Selecciona un nodo para ver que necesitas y como se juega.</p>
      </section>
    )
  }

  const family = getFamily(stage)
  const gameTitle = getGameTitle(family)
  const radius = getNumber(stage, ['radius', 'capture_radius_m', 'entry_radius_m'])
  const requiredItem = getString(stage, ['required_item_id', 'requiredItemId'])
  const rewardItem = getString(stage, ['reward_item_id', 'rewardItemId'])
  const manualCode = getString(stage, ['manual_code', 'manualCode'])
  const interactionMethod = getString(stage, ['interaction_method', 'interactionMethod'])
  const needsGps = radius !== null || family.includes('signal') || family.includes('bearing')
  const hasQr = interactionMethod.includes('qr') || getBoolean(stage, ['qr_enabled', 'qrEnabled'])
  const hasNfc = interactionMethod.includes('nfc') || getBoolean(stage, ['nfc_enabled', 'nfcEnabled'])
  const hasManual = Boolean(manualCode) || interactionMethod.includes('manual') || rewardItem || requiredItem

  const chips = [
    needsGps ? 'GPS' : null,
    radius !== null ? `Radio ${radius} m` : null,
    requiredItem ? 'Necesita objeto' : null,
    rewardItem ? 'Da objeto' : null,
    hasQr ? 'QR' : null,
    hasNfc ? 'NFC' : null,
    hasManual ? 'Manual' : null,
  ].filter(Boolean) as string[]

  return (
    <section style={panel}>
      <div style={header}>
        <div>
          <div style={eyebrow}>REQUISITOS</div>
          <div style={title}>{stage.title || 'Nodo actual'}</div>
        </div>
        <span style={badge}>{gameTitle}</span>
      </div>

      <div style={chipsRow}>
        {chips.length ? chips.map((chip) => <span key={chip}>{chip}</span>) : <span>Sin requisitos especiales</span>}
      </div>

      <div style={block}>
        <strong>Para entrar</strong>
        <ul style={list}>
          {needsGps ? <li>Activa GPS y acercate al nodo.</li> : <li>No parece requerir GPS especial.</li>}
          {radius !== null ? <li>Debes estar dentro del radio de {radius} m.</li> : null}
          {requiredItem ? <li>Necesitas llevar en mochila: {requiredItem}.</li> : null}
          {!requiredItem ? <li>No hay objeto obligatorio detectado para abrirlo.</li> : null}
        </ul>
      </div>

      <div style={block}>
        <strong>Como se juega</strong>
        <ul style={list}>
          {getGameHowTo(stage).map((item) => <li key={item}>{item}</li>)}
        </ul>
      </div>

      <div style={block}>
        <strong>Prueba fisica</strong>
        <p style={copy}>
          {hasQr || hasNfc
            ? 'Este nodo puede usar QR/NFC cuando el flujo rapido este activo. Si falla, usa Coger como respaldo manual.'
            : hasManual
              ? 'Usa Coger para guardar la palabra, objeto o pista fisica en la mochila local.'
              : 'No hay prueba fisica especial detectada en este nodo.'}
        </p>
      </div>

      <div style={footer}>Perfil local: {user}. Estado calculado en este telefono.</div>
    </section>
  )
}

const panel: CSSProperties = {
  display: 'grid',
  gap: 12,
  borderRadius: 20,
  border: '1px solid rgba(255,255,255,.12)',
  background: 'rgba(255,255,255,.055)',
  padding: 12,
}

const header: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 10,
}

const eyebrow: CSSProperties = {
  color: '#bbf7d0',
  fontSize: 10,
  fontWeight: 950,
  letterSpacing: '0.14em',
}

const title: CSSProperties = {
  marginTop: 4,
  color: '#ffffff',
  fontSize: 15,
  lineHeight: 1.1,
  fontWeight: 950,
}

const badge: CSSProperties = {
  padding: '6px 9px',
  borderRadius: 999,
  border: '1px solid rgba(125,211,252,.20)',
  background: 'rgba(14,165,233,.14)',
  color: '#dbeafe',
  fontSize: 9,
  fontWeight: 950,
  whiteSpace: 'nowrap',
}

const chipsRow: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
}

const block: CSSProperties = {
  display: 'grid',
  gap: 6,
  borderRadius: 16,
  border: '1px solid rgba(255,255,255,.08)',
  background: 'rgba(15,23,42,.20)',
  padding: 10,
}

const list: CSSProperties = {
  display: 'grid',
  gap: 5,
  margin: 0,
  paddingLeft: 18,
  color: 'rgba(226,232,240,.76)',
  fontSize: 12,
  lineHeight: 1.35,
  fontWeight: 750,
}

const copy: CSSProperties = {
  margin: 0,
  color: 'rgba(226,232,240,.76)',
  fontSize: 12,
  lineHeight: 1.4,
  fontWeight: 750,
}

const footer: CSSProperties = {
  color: 'rgba(226,232,240,.46)',
  fontSize: 10,
  fontWeight: 800,
}


import type { CSSProperties } from 'react'
import type { PlayerStage } from '../../types/player'

interface RequirementPreviewPanelProps {
  user: string
  stage: PlayerStage | null
}

function read(stage: PlayerStage | null, keys: string[]): unknown {
  if (!stage) return undefined
  const source = stage as unknown as Record<string, unknown>
  for (const key of keys) {
    const value = source[key]
    if (value !== undefined && value !== null && value !== '') return value
  }
  return undefined
}

function readString(stage: PlayerStage | null, keys: string[]): string {
  const value = read(stage, keys)
  return typeof value === 'string' ? value : ''
}

function readNumber(stage: PlayerStage | null, keys: string[]): number | null {
  const value = read(stage, keys)
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function familyId(stage: PlayerStage | null): string {
  return readString(stage, ['family', 'minigame_family', 'game_family', 'type'])
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
}

function gameName(family: string): string {
  if (family.includes('signal')) return 'SENAL'
  if (family.includes('bearing')) return 'RUMBO'
  if (family.includes('circuit')) return 'CIRCUITO'
  return 'NODO'
}

function howToPlay(stage: PlayerStage | null): string[] {
  const family = familyId(stage)

  if (family.includes('signal')) {
    return [
      'Acercate al punto marcado en el mapa.',
      'Entra dentro del radio del nodo.',
      'Mantente estable hasta capturar la senal.',
    ]
  }

  if (family.includes('bearing')) {
    return [
      'Permite la brujula si el movil lo pide.',
      'Gira despacio hasta encontrar el rumbo correcto.',
      'Si el sensor falla, reintenta al aire libre o usa la prueba manual.',
    ]
  }

  if (family.includes('circuit')) {
    return [
      'Lee la pista y resuelve el patron.',
      'Prueba la combinacion correcta.',
      'Si el circuito pide un objeto, primero debe estar en Objetos.',
    ]
  }

  return [
    'Lee la pista del nodo actual.',
    'Comprueba distancia, objetos y prueba fisica.',
    'Cuando cumplas todo, podras avanzar.',
  ]
}

export function RequirementPreviewPanel({ user, stage }: RequirementPreviewPanelProps) {
  if (!stage) {
    return (
      <section style={panel}>
        <div style={eyebrow}>GUIA</div>
        <div style={title}>Sin nodo seleccionado</div>
        <p style={copy}>Selecciona un nodo para ver como se juega y que necesitas.</p>
      </section>
    )
  }

  const family = familyId(stage)
  const radius = readNumber(stage, ['radius', 'capture_radius_m', 'entry_radius_m'])
  const requiredItem = readString(stage, ['required_item_id', 'requiredItemId'])
  const rewardItem = readString(stage, ['reward_item_id', 'rewardItemId'])
  const manualCode = readString(stage, ['manual_code', 'manualCode'])
  const interaction = readString(stage, ['interaction_method', 'interactionMethod']).toLowerCase()

  const needsGps = radius !== null || family.includes('signal') || family.includes('bearing')
  const needsItem = Boolean(requiredItem)
  const givesItem = Boolean(rewardItem)
  const physical = Boolean(manualCode || rewardItem || requiredItem || interaction)

  return (
    <section style={panel}>
      <div style={header}>
        <div>
          <div style={eyebrow}>GUIA DEL NODO</div>
          <div style={title}>{stage.title || 'Nodo actual'}</div>
        </div>
        <span style={badge}>{gameName(family)}</span>
      </div>

      <div style={statusGrid}>
        <Mini label="Distancia" value={needsGps ? 'GPS' : 'Libre'} />
        <Mini label="Radio" value={radius !== null ? `${radius} m` : '-'} />
        <Mini label="Objeto" value={needsItem ? 'Necesario' : 'No'} />
      </div>

      <div style={block}>
        <strong>Que necesitas</strong>
        <ul style={list}>
          {needsGps ? <li>Activa GPS y acercate al punto del mapa.</li> : <li>Este nodo no depende de posicion especial.</li>}
          {radius !== null ? <li>Debes estar dentro del radio de {radius} m.</li> : null}
          {needsItem ? <li>Necesitas tener este objeto en Objetos: {requiredItem}.</li> : <li>No hay objeto obligatorio detectado.</li>}
        </ul>
      </div>

      <div style={block}>
        <strong>Como se juega</strong>
        <ul style={list}>
          {howToPlay(stage).map((text) => <li key={text}>{text}</li>)}
        </ul>
      </div>

      <div style={block}>
        <strong>Objetos y pruebas</strong>
        <p style={copy}>
          Los objetos que guardas en Objetos pueden servir para abrir otros nodos. Si encuentras una tarjeta, palabra, QR, NFC, sobre o prop, registralo desde Prueba.
        </p>
        {needsItem ? <p style={copy}>Este nodo comprueba si llevas el objeto requerido antes de avanzar.</p> : null}
        {givesItem ? <p style={copy}>Este nodo puede darte una recompensa: {rewardItem}.</p> : null}
        {!physical ? <p style={copy}>No hay prueba fisica especial detectada en este nodo.</p> : null}
      </div>

      <div style={footer}>Jugador local: {user}</div>
    </section>
  )
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div style={mini}>
      <b>{value}</b>
      <span>{label}</span>
    </div>
  )
}

const panel: CSSProperties = {
  display: 'grid',
  gap: 10,
  borderRadius: 20,
  border: '1px solid rgba(255,255,255,.12)',
  background: 'rgba(15,23,42,.18)',
  padding: 12,
}

const header: CSSProperties = {
  display: 'flex',
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
  alignSelf: 'flex-start',
  borderRadius: 999,
  border: '1px solid rgba(125,211,252,.22)',
  background: 'rgba(14,165,233,.14)',
  color: '#dbeafe',
  padding: '7px 9px',
  fontSize: 9,
  fontWeight: 950,
}

const statusGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  gap: 8,
}

const mini: CSSProperties = {
  display: 'grid',
  gap: 2,
  borderRadius: 15,
  background: 'rgba(255,255,255,.075)',
  padding: 9,
  textAlign: 'center',
}

const block: CSSProperties = {
  display: 'grid',
  gap: 6,
  borderRadius: 16,
  border: '1px solid rgba(255,255,255,.08)',
  background: 'rgba(255,255,255,.055)',
  padding: 10,
}

const list: CSSProperties = {
  display: 'grid',
  gap: 5,
  margin: 0,
  paddingLeft: 18,
  color: 'rgba(226,232,240,.78)',
  fontSize: 12,
  lineHeight: 1.35,
  fontWeight: 750,
}

const copy: CSSProperties = {
  margin: 0,
  color: 'rgba(226,232,240,.78)',
  fontSize: 12,
  lineHeight: 1.4,
  fontWeight: 750,
}

const footer: CSSProperties = {
  color: 'rgba(226,232,240,.46)',
  fontSize: 10,
  fontWeight: 800,
}

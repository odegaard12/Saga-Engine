import { type CSSProperties } from 'react'
import type { PlayerStage } from '../../types/player'
import ItemIconSvg from './ItemIconSvg'
import { countOwnedItems, readStageItemRequirement } from '../rewards/stageItemRequirement'
import { useI18n } from '../../i18n/useI18n'

/**
 * Textos en los tres idiomas. Antes estaban en castellano y el gallego llegaba
 * por el puente de textos (`legacySpanishBridge.ts`), que sólo traduce frases
 * EXACTAS: la del radio lleva el número dentro y salía en castellano, y en
 * inglés no se traducía nada. Además el paso del punto de control describía el
 * antiguo «Signal Hunt» (mantener la posición hasta llenar una barra), que ya
 * no existe: ahora basta con llegar.
 */
const TEXTOS = {
  es: {
    guiaDelNodo: 'GUÍA DEL NODO',
    sinNodo: 'Sin nodo seleccionado',
    eligeNodo: 'Selecciona un nodo en el mapa para ver sus detalles.',
    pasoAPaso: 'GUÍA PASO A PASO',
    misionActiva: 'Misión activa',
    irAlPunto: 'Ve al punto en el mapa',
    acercate: (m: number) => `Acércate a la ubicación marcada: el nodo se abre a menos de ${m} metros.`,
    equipa: 'Lleva el objeto necesario',
    yaLoLlevas: 'Ya lo llevas encima. El nodo se abrirá sin problema.',
    noLoLlevas: 'Este nodo no se abre sin esto. Si no lo tienes, fabrícalo en la Mesa de trabajo.',
    llegaTitulo: 'Llega al punto de control',
    llegaTexto: 'En cuanto estés dentro del radio podrás marcarlo como alcanzado y seguir.',
    brujulaTitulo: 'Orienta la brújula',
    brujulaTexto: 'Usa la brújula del móvil. Gira despacio sobre ti hasta apuntar en la dirección correcta.',
    logicaTitulo: 'Resuelve el reto',
    logicaTexto: 'Observa lo que te rodea y las pistas que tienes: tendrás que dar con la clave, el patrón o la secuencia.',
    recogeTitulo: 'Recoge el objeto',
    recogeTexto: 'Este nodo guarda un objeto. Dentro del radio podrás recogerlo y irá a tu mochila.',
    qrTitulo: 'Escanea la pegatina',
    qrTexto: 'Busca la pegatina QR escondida en el sitio y escanéala con la cámara.',
    otroTitulo: 'Sigue las instrucciones',
    otroTexto: 'Lee la descripción del nodo para saber qué hacer.',
  },
  gl: {
    guiaDelNodo: 'GUÍA DO NODO',
    sinNodo: 'Sen nodo seleccionado',
    eligeNodo: 'Selecciona un nodo no mapa para ver os seus detalles.',
    pasoAPaso: 'GUÍA PASO A PASO',
    misionActiva: 'Misión activa',
    irAlPunto: 'Vai ao punto no mapa',
    acercate: (m: number) => `Achégate á localización marcada: o nodo ábrese a menos de ${m} metros.`,
    equipa: 'Leva o obxecto necesario',
    yaLoLlevas: 'Xa o levas enriba. O nodo abrirase sen problema.',
    noLoLlevas: 'Este nodo non se abre sen isto. Se non o tes, fabrícao na Mesa de traballo.',
    llegaTitulo: 'Chega ao punto de control',
    llegaTexto: 'En canto esteas dentro do radio poderás marcalo como alcanzado e seguir.',
    brujulaTitulo: 'Orienta o compás',
    brujulaTexto: 'Usa o compás do móbil. Xira amodo sobre ti ata apuntar na dirección correcta.',
    logicaTitulo: 'Resolve o reto',
    logicaTexto: 'Observa o que tes arredor e as pistas: terás que dar coa clave, o patrón ou a secuencia.',
    recogeTitulo: 'Recolle o obxecto',
    recogeTexto: 'Este nodo garda un obxecto. Dentro do radio poderás recollelo e irá á túa mochila.',
    qrTitulo: 'Escanea a pegatina',
    qrTexto: 'Busca a pegatina QR agochada no sitio e escanéaa coa cámara.',
    otroTitulo: 'Segue as instrucións',
    otroTexto: 'Le a descrición do nodo para saber que facer.',
  },
  en: {
    guiaDelNodo: 'NODE GUIDE',
    sinNodo: 'No node selected',
    eligeNodo: 'Select a node on the map to see its details.',
    pasoAPaso: 'STEP BY STEP',
    misionActiva: 'Active mission',
    irAlPunto: 'Go to the point on the map',
    acercate: (m: number) => `Walk to the marked spot: the node opens within ${m} metres.`,
    equipa: 'Carry the required item',
    yaLoLlevas: 'You already carry it. The node will open.',
    noLoLlevas: 'This node will not open without it. If you do not have it, craft it at the Workbench.',
    llegaTitulo: 'Reach the checkpoint',
    llegaTexto: 'Once you are inside the radius you can mark it as reached and move on.',
    brujulaTitulo: 'Aim the compass',
    brujulaTexto: 'Use the phone compass. Turn slowly until you point in the right direction.',
    logicaTitulo: 'Solve the challenge',
    logicaTexto: 'Look around and use your clues: you will need the right code, pattern or sequence.',
    recogeTitulo: 'Pick up the item',
    recogeTexto: 'This node holds an item. Inside the radius you can pick it up and it goes to your backpack.',
    qrTitulo: 'Scan the sticker',
    qrTexto: 'Find the QR sticker hidden on site and scan it with the camera.',
    otroTitulo: 'Follow the instructions',
    otroTexto: 'Read the node description to know what to do.',
  },
}

type Textos = (typeof TEXTOS)['es']

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

export function RequirementPreviewPanel({ user, stage }: RequirementPreviewPanelProps) {
  const { locale } = useI18n()
  const t: Textos = TEXTOS[(locale as keyof typeof TEXTOS) in TEXTOS ? (locale as keyof typeof TEXTOS) : 'es']
  if (!stage) {
    return (
      <section style={panel}>
        <div style={eyebrow}>{t.guiaDelNodo}</div>
        <div style={title}>{t.sinNodo}</div>
        <p style={copy}>{t.eligeNodo}</p>
      </section>
    )
  }

  const family = familyId(stage)
  const radius = readNumber(stage, ['radius', 'capture_radius_m', 'entry_radius_m', 'proximity_radius_m'])
  // El nodo normalizado NO trae required_item_id arriba del todo: el motor lo
  // mueve a requirements.items. Leyendo sólo las claves de primer nivel esto
  // salía siempre vacío y el paso "equipa el objeto necesario" no aparecía
  // nunca, justo en la pestaña donde el jugador va a buscarlo.
  const requirement = readStageItemRequirement(stage)
  const requiredItem = requirement?.itemId || ''
  const requiredLabel = requirement?.label || requiredItem.replace(/_/g, ' ')
  const requiredQuantity = requirement?.quantity || 1
  const ownedQuantity = requiredItem ? countOwnedItems(user, requiredItem) : 0
  const requirementMet = !requiredItem || ownedQuantity >= requiredQuantity
  
  const isSignal = family.includes('signal')
  const isCompass = family.includes('bearing')
  const isPuzzle = family.includes('circuit') || family.includes('sequence') || family.includes('puzzle')
  const isPhysical = family.includes('qr') || family.includes('physical') || family.includes('scan')
  const isCollectible = family.includes('collect') || family.includes('item') || family.includes('inventory')
  
  const needsGps = radius !== null || isSignal || isCompass || isCollectible

  const accion: [string, string] = isCollectible
    ? [t.recogeTitulo, t.recogeTexto]
    : isPhysical
      ? [t.qrTitulo, t.qrTexto]
      : isCompass
        ? [t.brujulaTitulo, t.brujulaTexto]
        : isPuzzle
          ? [t.logicaTitulo, t.logicaTexto]
          : isSignal
            ? [t.llegaTitulo, t.llegaTexto]
            : [t.otroTitulo, t.otroTexto]
  
  return (
    <section style={panel}>
      <div style={header}>
        <div style={eyebrow}>{t.pasoAPaso}</div>
        <div style={title}>{stage.title || t.misionActiva}</div>
      </div>

      <div style={stepsContainer}>
        {/* Paso 1: el sitio */}
        {needsGps && (
          <div style={stepRow}>
            <div style={stepNumber}>1</div>
            <div style={stepContent}>
              <div style={stepTitle}>{t.irAlPunto}</div>
              <div style={stepDesc}>{t.acercate(Math.round(radius || 50))}</div>
            </div>
          </div>
        )}

        {/* Paso 2: el objeto que pide, si pide alguno */}
        {requiredItem && (
          <div style={stepRow}>
            <div style={stepNumber}>{needsGps ? '2' : '1'}</div>
            <div style={stepContent}>
              <div style={stepTitle}>{t.equipa}</div>
              <div style={stepDesc}>{requirementMet ? t.yaLoLlevas : t.noLoLlevas}</div>
              <div
                style={{
                  ...requiredItemCard,
                  borderColor: requirementMet ? 'rgba(var(--theme-done-soft), .45)' : 'rgba(251,191,36,.45)',
                  background: requirementMet ? 'rgba(var(--theme-done-soft), .12)' : 'rgba(251,191,36,.10)',
                }}
              >
                <ItemIconSvg itemId={requiredItem} size={20} />
                <span>{requiredLabel}</span>
                <span style={{ opacity: 0.75, fontWeight: 800 }}>
                  {requirementMet ? '✓' : `${ownedQuantity}/${requiredQuantity}`}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Paso 3: lo que hay que hacer allí */}
        <div style={stepRow}>
          <div style={stepNumber}>{requiredItem ? (needsGps ? '3' : '2') : needsGps ? '2' : '1'}</div>
          <div style={stepContent}>
            <div style={stepTitle}>{accion[0]}</div>
            <div style={stepDesc}>{accion[1]}</div>
          </div>
        </div>
      </div>
    </section>
  )
}

// ─── Estilos Modernos ────────────────────────────────────────────────────────
const panel: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
  padding: '20px',
  background: 'linear-gradient(to bottom, rgba(var(--theme-ink), 0.8), rgba(var(--theme-ink), 0.95))',
  borderRadius: '16px',
  border: '1px solid rgba(255,255,255,0.05)',
  boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
}

const header: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
}

const eyebrow: CSSProperties = {
  color: 'rgb(var(--theme-info))',
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: '0.15em',
  textTransform: 'uppercase',
}

const title: CSSProperties = {
  color: '#ffffff',
  fontSize: 18,
  lineHeight: 1.2,
  fontWeight: 900,
}

const copy: CSSProperties = {
  color: 'rgb(var(--theme-line))',
  fontSize: 13,
  lineHeight: 1.5,
  margin: 0,
}

const stepsContainer: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
  position: 'relative',
}

const stepRow: CSSProperties = {
  display: 'flex',
  gap: 12,
  position: 'relative',
}

const stepNumber: CSSProperties = {
  flexShrink: 0,
  width: 24,
  height: 24,
  borderRadius: '12px',
  background: 'rgba(var(--theme-info), 0.15)',
  color: 'rgb(var(--theme-info))',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 13,
  fontWeight: 800,
  border: '1px solid rgba(var(--theme-info), 0.3)',
  zIndex: 2,
}

const stepContent: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  paddingTop: 2,
}

const stepTitle: CSSProperties = {
  color: '#f8fafc',
  fontSize: 14,
  fontWeight: 700,
}

const stepDesc: CSSProperties = {
  color: 'rgb(var(--theme-line))',
  fontSize: 13,
  lineHeight: 1.4,
}

const requiredItemCard: CSSProperties = {
  marginTop: 8,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.1)',
  padding: '6px 12px',
  borderRadius: '8px',
  color: '#e2e8f0',
  fontSize: 13,
  fontWeight: 600,
  textTransform: 'capitalize',
}

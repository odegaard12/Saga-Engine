import React, { type CSSProperties } from 'react'
import type { PlayerStage } from '../../types/player'
import ItemIconSvg from './ItemIconSvg'

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
  if (!stage) {
    return (
      <section style={panel}>
        <div style={eyebrow}>GUÍA DEL NODO</div>
        <div style={title}>Sin nodo seleccionado</div>
        <p style={copy}>Selecciona un nodo en el mapa para ver sus detalles.</p>
      </section>
    )
  }

  const family = familyId(stage)
  const radius = readNumber(stage, ['radius', 'capture_radius_m', 'entry_radius_m', 'proximity_radius_m'])
  const requiredItem = readString(stage, ['required_item_id', 'requiredItemId'])
  
  const isSignal = family.includes('signal')
  const isCompass = family.includes('bearing')
  const isPuzzle = family.includes('circuit') || family.includes('sequence')
  const isPhysical = family.includes('qr') || family.includes('inventory')
  
  const needsGps = radius !== null || isSignal || isCompass
  
  return (
    <section style={panel}>
      <div style={header}>
        <div style={eyebrow}>GUÍA PASO A PASO</div>
        <div style={title}>{stage.title || 'Misión Activa'}</div>
      </div>

      <div style={stepsContainer}>
        {/* Step 1: Ubicación */}
        {needsGps && (
          <div style={stepRow}>
            <div style={stepNumber}>1</div>
            <div style={stepContent}>
              <div style={stepTitle}>Ve al punto en el mapa</div>
              <div style={stepDesc}>
                Acércate físicamente a la ubicación marcada. Necesitas estar a menos de {radius || 50} metros para que tu escáner detecte el nodo.
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Objeto Requerido (Optional) */}
        {requiredItem && (
          <div style={stepRow}>
            <div style={stepNumber}>{needsGps ? '2' : '1'}</div>
            <div style={stepContent}>
              <div style={stepTitle}>Equipa el objeto necesario</div>
              <div style={stepDesc}>
                Para poder interactuar con este nodo, necesitas tener esto en tu mochila:
              </div>
              <div style={requiredItemCard}>
                <ItemIconSvg itemId={requiredItem} size={20} />
                <span>{requiredItem.replace(/_/g, ' ')}</span>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Acción del Juego */}
        <div style={stepRow}>
          <div style={stepNumber}>{requiredItem ? (needsGps ? '3' : '2') : (needsGps ? '2' : '1')}</div>
          <div style={stepContent}>
            <div style={stepTitle}>
              {isSignal && 'Captura la señal estable'}
              {isCompass && 'Calibra la brújula y gira'}
              {isPuzzle && 'Resuelve el código'}
              {isPhysical && 'Escanea el elemento'}
              {!isSignal && !isCompass && !isPuzzle && !isPhysical && 'Sigue las instrucciones'}
            </div>
            <div style={stepDesc}>
              {isSignal && 'Una vez en la zona, mantén tu posición sin salir del círculo hasta que la barra se llene por completo al 100%.'}
              {isCompass && 'Gira lentamente sobre ti mismo hasta que tu teléfono apunte en la dirección correcta para decodificar.'}
              {isPuzzle && 'Observa tu entorno físico y la información que tienes. Introduce el patrón o código correcto para acceder.'}
              {isPhysical && 'Busca un código QR, etiqueta NFC o pista física en la vida real. Usa el botón inferior para escanearlo.'}
              {!isSignal && !isCompass && !isPuzzle && !isPhysical && 'Lee cuidadosamente la descripción de la misión para saber qué hacer a continuación.'}
            </div>
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
  background: 'linear-gradient(to bottom, rgba(15,23,42,0.8), rgba(15,23,42,0.95))',
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
  color: '#38bdf8',
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
  color: '#94a3b8',
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
  background: 'rgba(56,189,248,0.15)',
  color: '#38bdf8',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 13,
  fontWeight: 800,
  border: '1px solid rgba(56,189,248,0.3)',
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
  color: '#94a3b8',
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

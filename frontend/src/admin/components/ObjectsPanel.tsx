import type { CSSProperties } from 'react'

export type AdminItem = {
  id: string
  label: string
  icon: string
  description: string
  recipeUsedIn?: string
}

export type AdminRecipe = {
  id: string
  label: string
  inputs: Array<{ label: string; quantity: number }>
  outputs: Array<{ label: string; quantity: number }>
}

const ITEMS: AdminItem[] = [
  {
    id: 'llave_rota',
    label: 'Llave Rota',
    icon: '🔑',
    description: 'Parte de una llave maestra. Necesita cinta para ser reparada.',
    recipeUsedIn: 'Reparar Llave',
  },
  {
    id: 'cinta_aislante',
    label: 'Cinta Aislante',
    icon: '🩹',
    description: 'Cinta adhesiva fuerte. Se usa para reparaciones rápidas.',
    recipeUsedIn: 'Reparar Llave',
  },
  {
    id: 'bateria_litio',
    label: 'Batería de Litio',
    icon: '🔋',
    description: 'Fuente de energía de alta capacidad para dispositivos EMP.',
    recipeUsedIn: 'Construir Dispositivo EMP',
  },
  {
    id: 'cables_cobre',
    label: 'Cables de Cobre',
    icon: '🔌',
    description: 'Cables conductores para electrónica avanzada.',
    recipeUsedIn: 'Construir Dispositivo EMP',
  },
  {
    id: 'placa_base',
    label: 'Placa Base',
    icon: '💾',
    description: 'Tarjeta electrónica base para integrar componentes.',
    recipeUsedIn: 'Construir Dispositivo EMP',
  },
  {
    id: 'llave_maestra',
    label: 'Llave Maestra',
    icon: '🔑',
    description: 'Llave reparada capaz de abrir compartimentos cerrados.',
  },
  {
    id: 'emp_device',
    label: 'Carga EMP',
    icon: '⚡',
    description: 'Dispositivo electromagnético capaz de hackear nodos.',
  },
]

const RECIPES: AdminRecipe[] = [
  {
    id: 'fix_broken_key',
    label: 'Reparar Llave',
    inputs: [
      { label: 'Llave Rota', quantity: 1 },
      { label: 'Cinta Aislante', quantity: 1 },
    ],
    outputs: [{ label: 'Llave Maestra', quantity: 1 }],
  },
  {
    id: 'craft_emp_device',
    label: 'Construir Dispositivo EMP',
    inputs: [
      { label: 'Batería de Litio', quantity: 2 },
      { label: 'Cables de Cobre', quantity: 3 },
      { label: 'Placa Base', quantity: 1 },
    ],
    outputs: [{ label: 'Carga EMP', quantity: 1 }],
  },
]

export default function ObjectsPanel() {
  return (
    <div style={container}>
      <section style={section}>
        <h3 style={sectionTitle}>🎒 Objetos del Juego</h3>
        <p style={subtitle}>
          Elementos coleccionables que los jugadores pueden encontrar en el mapa o fabricar.
        </p>
        <div style={list}>
          {ITEMS.map((item) => (
            <div key={item.id} style={itemCard}>
              <div style={itemHeader}>
                <span style={itemIcon}>{item.icon}</span>
                <div>
                  <strong style={itemLabel}>{item.label}</strong>
                  <code style={itemCode}>ID: {item.id}</code>
                </div>
              </div>
              <p style={itemDesc}>{item.description}</p>
              {item.recipeUsedIn ? (
                <div style={recipeBadge}>
                  Usado en: <b>{item.recipeUsedIn}</b>
                </div>
              ) : (
                <div style={outputBadge}>Objeto final de Crafteo</div>
              )}
            </div>
          ))}
        </div>
      </section>

      <section style={section}>
        <h3 style={sectionTitle}>⚒️ Recetas de la Mesa</h3>
        <p style={subtitle}>
          Fórmulas de combinación disponibles para los jugadores en su mesa de trabajo.
        </p>
        <div style={list}>
          {RECIPES.map((recipe) => (
            <div key={recipe.id} style={recipeCard}>
              <h4 style={recipeTitle}>{recipe.label}</h4>
              <div style={formula}>
                <div style={formulaSection}>
                  <span style={formulaLabel}>INGREDIENTES</span>
                  {recipe.inputs.map((input, idx) => (
                    <div key={idx} style={formulaRow}>
                      <span>{input.label}</span>
                      <b>×{input.quantity}</b>
                    </div>
                  ))}
                </div>
                <div style={arrow}>➔</div>
                <div style={formulaSection}>
                  <span style={formulaLabel}>RESULTADO</span>
                  {recipe.outputs.map((output, idx) => (
                    <div key={idx} style={formulaRow}>
                      <span style={outputName}>{output.label}</span>
                      <b>×{output.quantity}</b>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

const container: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 20,
  color: '#f8fafc',
}

const section: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
}

const sectionTitle: CSSProperties = {
  margin: 0,
  fontSize: '15px',
  fontWeight: 900,
  color: '#60a5fa',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
}

const subtitle: CSSProperties = {
  margin: 0,
  fontSize: '11px',
  color: 'rgba(203, 213, 225, 0.74)',
  lineHeight: 1.35,
}

const list: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
}

const itemCard: CSSProperties = {
  padding: 12,
  borderRadius: 16,
  border: '1px solid rgba(148, 163, 184, 0.14)',
  background: 'rgba(15, 23, 42, 0.36)',
}

const itemHeader: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
}

const itemIcon: CSSProperties = {
  fontSize: '20px',
  display: 'grid',
  placeItems: 'center',
  width: 36,
  height: 36,
  borderRadius: 10,
  background: 'rgba(255, 255, 255, 0.05)',
}

const itemLabel: CSSProperties = {
  display: 'block',
  fontSize: '13px',
  fontWeight: 800,
}

const itemCode: CSSProperties = {
  display: 'block',
  fontSize: '9px',
  color: '#93c5fd',
}

const itemDesc: CSSProperties = {
  margin: '8px 0 0',
  fontSize: '11px',
  color: 'rgba(226, 232, 240, 0.84)',
  lineHeight: 1.3,
}

const recipeBadge: CSSProperties = {
  marginTop: 8,
  display: 'inline-flex',
  padding: '3px 8px',
  borderRadius: 6,
  background: 'rgba(14, 165, 233, 0.12)',
  border: '1px solid rgba(14, 165, 233, 0.22)',
  fontSize: '9px',
  color: '#7dd3fc',
}

const outputBadge: CSSProperties = {
  ...recipeBadge,
  background: 'rgba(34, 197, 94, 0.12)',
  border: '1px solid rgba(34, 197, 94, 0.22)',
  color: '#86efac',
}

const recipeCard: CSSProperties = {
  padding: 14,
  borderRadius: 16,
  border: '1px solid rgba(148, 163, 184, 0.14)',
  background: 'rgba(15, 23, 42, 0.36)',
}

const recipeTitle: CSSProperties = {
  margin: '0 0 10px',
  fontSize: '13px',
  fontWeight: 800,
}

const formula: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
}

const formulaSection: CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
}

const formulaLabel: CSSProperties = {
  fontSize: '8px',
  fontWeight: 900,
  color: 'rgba(203, 213, 225, 0.5)',
  letterSpacing: '0.08em',
}

const formulaRow: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  fontSize: '11px',
}

const outputName: CSSProperties = {
  color: '#86efac',
  fontWeight: 800,
}

const arrow: CSSProperties = {
  fontSize: '16px',
  color: 'rgba(203, 213, 225, 0.3)',
}

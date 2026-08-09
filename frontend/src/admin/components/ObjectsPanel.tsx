import type { CSSProperties } from 'react'
import ItemIconSvg from '../../player/components/ItemIconSvg'
import type { AdminReactOverviewStage } from '../lib/adminApi'

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
  inputs: Array<{ id: string; label: string; quantity: number }>
  outputs: Array<{ id: string; label: string; quantity: number }>
}

const ITEMS: AdminItem[] = [
  // ⚡ Tecnología
  { id: 'llave_rota', label: 'Llave Rota', icon: '🔑', description: 'Parte de una llave maestra. Necesita cinta para ser reparada.', recipeUsedIn: 'Reparar Llave' },
  { id: 'cinta_aislante', label: 'Cinta Aislante', icon: '🩹', description: 'Cinta adhesiva fuerte. Se usa para reparaciones rápidas.', recipeUsedIn: 'Reparar Llave' },
  { id: 'bateria_litio', label: 'Batería de Litio', icon: '🔋', description: 'Fuente de energía de alta capacidad para dispositivos EMP.', recipeUsedIn: 'EMP / Decodificador' },
  { id: 'cables_cobre', label: 'Cables de Cobre', icon: '🔌', description: 'Cables conductores para electrónica avanzada.', recipeUsedIn: 'Dispositivo EMP' },
  { id: 'placa_base', label: 'Placa Base', icon: '💾', description: 'Tarjeta electrónica base para integrar componentes.', recipeUsedIn: 'EMP / Escáner Biométrico' },
  { id: 'chip_encriptado', label: 'Chip Encriptado', icon: '💻', description: 'Circuito con datos cifrados de alta seguridad.', recipeUsedIn: 'Decodificador Cuántico' },
  { id: 'antena_frecuencia', label: 'Antena de Frecuencia', icon: '📡', description: 'Antena para captar ondas de comunicación lejanas.', recipeUsedIn: 'Decodificador Cuántico' },
  { id: 'sensor_optico', label: 'Sensor Óptico', icon: '👁️', description: 'Lente electrónica para escaneo biométrico.', recipeUsedIn: 'Escáner Biométrico' },
  { id: 'cristal_enfoque', label: 'Cristal de Enfoque', icon: '🔍', description: 'Prisma de precisión para escaneo biométrico.', recipeUsedIn: 'Escáner Biométrico' },

  // 🛡️ Medieval / Fantasía
  { id: 'gemas_antiguas', label: 'Gemas Antiguas', icon: '💎', description: 'Piedras preciosas grabadas con símbolos ancestrales.', recipeUsedIn: 'Amuleto del Guardián' },
  { id: 'fragmento_escudo', label: 'Fragmento de Escudo', icon: '🛡️', description: 'Trozo de metal reforzado de un antiguo guerrero.', recipeUsedIn: 'Amuleto del Guardián' },
  { id: 'hilo_plata', label: 'Hilo de Plata', icon: '🧵', description: 'Fibra metálica brillante para forja y tejido místico.', recipeUsedIn: 'Amuleto / Escudo Rúnico' },
  { id: 'hierbas_curativas', label: 'Hierbas Curativas', icon: '🌿', description: 'Plantas medicinales recolectadas en el bosque.', recipeUsedIn: 'Elixir de Alquimia' },
  { id: 'frasco_cristal', label: 'Frasco de Cristal', icon: '🧪', description: 'Recipiente transparente para pócimas y elixires.', recipeUsedIn: 'Elixir de Alquimia' },
  { id: 'agua_purificada', label: 'Agua Purificada', icon: '💧', description: 'Agua pura de manantial para mezclas de alquimia.', recipeUsedIn: 'Elixir de Alquimia' },
  { id: 'placa_hierro', label: 'Placa de Hierro', icon: '⚙️', description: 'Lámina de hierro resistente para forjar escudos.', recipeUsedIn: 'Escudo Rúnico' },
  { id: 'runa_proteccion', label: 'Runa de Protección', icon: '📜', description: 'Símbolo grabado en piedra que repele energías.', recipeUsedIn: 'Escudo Rúnico' },

  // 🔮 Místico / Arcano
  { id: 'esfera_cristal', label: 'Esfera de Cristal', icon: '🔮', description: 'Orbe de vidrio místico capaz de canalizar energías.', recipeUsedIn: 'Orbe de Fuego Arcano' },
  { id: 'esencia_ignea', label: 'Esencia Ígnea', icon: '🔥', description: 'Extracto de fuego concentrado de las profundidades.', recipeUsedIn: 'Orbe de Fuego Arcano' },
  { id: 'polvo_estelar', label: 'Polvo Estelar', icon: '✨', description: 'Residuo cósmico brillante que imbuye poder místico.', recipeUsedIn: 'Orbe de Fuego / Amuleto Visión' },
  { id: 'fragmento_reliquia', label: 'Fragmento de Reliquia', icon: '🏛️', description: 'Pieza de un artefacto sagrado olvidado.', recipeUsedIn: 'Reliquia Sagrada' },
  { id: 'esencia_sagrada', label: 'Esencia Sagrada', icon: '✨', description: 'Gota de bendición divina.', recipeUsedIn: 'Reliquia Sagrada' },
  { id: 'pergamino_antiguo', label: 'Pergamino Antiguo', icon: '📜', description: 'Papel antiguo con encantamientos inscritos.', recipeUsedIn: 'Reliquia Sagrada' },
  { id: 'ojo_mistico', label: 'Ojo Místico', icon: '👁️', description: 'Talismán en forma de ojo que ve lo oculto.', recipeUsedIn: 'Amuleto de Visión' },

  // 🏆 Resultados Ensamblados
  { id: 'llave_maestra', label: 'Llave Maestra', icon: '🔑', description: 'Llave reparada capaz de abrir compartimentos cerrados.' },
  { id: 'emp_device', label: 'Carga EMP', icon: '⚡', description: 'Dispositivo electromagnético capaz de hackear nodos.' },
  { id: 'decodificador_cuantico', label: 'Decodificador Cuántico', icon: '💻', description: 'Dispositivo cibernético para descifrar señales.' },
  { id: 'escaner_biometrico', label: 'Escáner Biométrico', icon: '🔬', description: 'Lector biométrico para autorizar acceso.' },
  { id: 'amuleto_guardian', label: 'Amuleto del Guardián', icon: '🛡️', description: 'Protector que otorga paso seguro a zonas prohibidas.' },
  { id: 'elixir_alquimia', label: 'Elixir de Alquimia', icon: '🧪', description: 'Pócima revitalizante que permite superar pruebas físicas.' },
  { id: 'escudo_runico', label: 'Escudo Rúnico', icon: '🛡️', description: 'Barrera mágica forjada con runas antiguas.' },
  { id: 'orbe_fuego', label: 'Orbe de Fuego Arcano', icon: '🔮', description: 'Esfera mística que disipa nieblas y desbloquea el mapa.' },
  { id: 'reliquia_sagrada', label: 'Reliquia Sagrada', icon: '🏛️', description: 'Artefacto divino que completa grandes hazañas.' },
  { id: 'amuleto_vision', label: 'Amuleto de Visión Suprema', icon: '👁️', description: 'Talismán que revela pistas ocultas.' },
]

const RECIPES: AdminRecipe[] = [
  {
    id: 'fix_broken_key',
    label: 'Reparar Llave Maestra',
    inputs: [
      { id: 'llave_rota', label: 'Llave Rota', quantity: 1 },
      { id: 'cinta_aislante', label: 'Cinta Aislante', quantity: 1 },
    ],
    outputs: [{ id: 'llave_maestra', label: 'Llave Maestra', quantity: 1 }],
  },
  {
    id: 'craft_emp_device',
    label: 'Construir Dispositivo EMP',
    inputs: [
      { id: 'bateria_litio', label: 'Batería de Litio', quantity: 2 },
      { id: 'cables_cobre', label: 'Cables de Cobre', quantity: 3 },
      { id: 'placa_base', label: 'Placa Base', quantity: 1 },
    ],
    outputs: [{ id: 'emp_device', label: 'Carga EMP', quantity: 1 }],
  },
  {
    id: 'quantum_decoder',
    label: 'Decodificador Cuántico',
    inputs: [
      { id: 'chip_encriptado', label: 'Chip Encriptado', quantity: 1 },
      { id: 'antena_frecuencia', label: 'Antena Frecuencia', quantity: 1 },
      { id: 'bateria_litio', label: 'Batería Litio', quantity: 1 },
    ],
    outputs: [{ id: 'decodificador_cuantico', label: 'Decodificador Cuántico', quantity: 1 }],
  },
  {
    id: 'biometric_scanner',
    label: 'Escáner Biométrico',
    inputs: [
      { id: 'sensor_optico', label: 'Sensor Óptico', quantity: 1 },
      { id: 'placa_base', label: 'Placa Base', quantity: 1 },
      { id: 'cristal_enfoque', label: 'Cristal Enfoque', quantity: 1 },
    ],
    outputs: [{ id: 'escaner_biometrico', label: 'Escáner Biométrico', quantity: 1 }],
  },
  {
    id: 'guardian_amulet',
    label: 'Amuleto del Guardián',
    inputs: [
      { id: 'gemas_antiguas', label: 'Gemas Antiguas', quantity: 2 },
      { id: 'fragmento_escudo', label: 'Fragmento Escudo', quantity: 1 },
      { id: 'hilo_plata', label: 'Hilo de Plata', quantity: 1 },
    ],
    outputs: [{ id: 'amuleto_guardian', label: 'Amuleto del Guardián', quantity: 1 }],
  },
  {
    id: 'alchemy_elixir',
    label: 'Elixir de Alquimia',
    inputs: [
      { id: 'hierbas_curativas', label: 'Hierbas Curativas', quantity: 2 },
      { id: 'frasco_cristal', label: 'Frasco Cristal', quantity: 1 },
      { id: 'agua_purificada', label: 'Agua Purificada', quantity: 1 },
    ],
    outputs: [{ id: 'elixir_alquimia', label: 'Elixir de Alquimia', quantity: 1 }],
  },
  {
    id: 'runic_shield',
    label: 'Escudo Rúnico',
    inputs: [
      { id: 'placa_hierro', label: 'Placa de Hierro', quantity: 2 },
      { id: 'runa_proteccion', label: 'Runa Protección', quantity: 1 },
      { id: 'hilo_plata', label: 'Hilo de Plata', quantity: 1 },
    ],
    outputs: [{ id: 'escudo_runico', label: 'Escudo Rúnico', quantity: 1 }],
  },
  {
    id: 'fire_orb',
    label: 'Orbe de Fuego Arcano',
    inputs: [
      { id: 'esfera_cristal', label: 'Esfera Cristal', quantity: 1 },
      { id: 'esencia_ignea', label: 'Esencia Ígnea', quantity: 2 },
      { id: 'polvo_estelar', label: 'Polvo Estelar', quantity: 1 },
    ],
    outputs: [{ id: 'orbe_fuego', label: 'Orbe de Fuego Arcano', quantity: 1 }],
  },
  {
    id: 'sacred_relic',
    label: 'Reliquia Sagrada',
    inputs: [
      { id: 'fragmento_reliquia', label: 'Fragmento Reliquia', quantity: 2 },
      { id: 'esencia_sagrada', label: 'Esencia Sagrada', quantity: 1 },
      { id: 'pergamino_antiguo', label: 'Pergamino Antiguo', quantity: 1 },
    ],
    outputs: [{ id: 'reliquia_sagrada', label: 'Reliquia Sagrada', quantity: 1 }],
  },
  {
    id: 'vision_amulet',
    label: 'Amuleto de Visión Suprema',
    inputs: [
      { id: 'ojo_mistico', label: 'Ojo Místico', quantity: 1 },
      { id: 'gemas_antiguas', label: 'Gemas Antiguas', quantity: 1 },
      { id: 'polvo_estelar', label: 'Polvo Estelar', quantity: 1 },
    ],
    outputs: [{ id: 'amuleto_vision', label: 'Amuleto Visión', quantity: 1 }],
  },
]

interface ObjectsPanelProps {
  stages?: AdminReactOverviewStage[]
  onCreateNodesWithItems?: (items: Array<{ id: string; label: string }>) => void
  onSelectStage?: (stage: AdminReactOverviewStage) => void
}

export default function ObjectsPanel({
  stages = [],
  onCreateNodesWithItems,
  onSelectStage,
}: ObjectsPanelProps) {

  function findNodeForItem(itemId: string) {
    return stages.find((s) => {
      if (s.physical_item_id === itemId) return true
      const config =
        typeof (s as any).config === 'object' && (s as any).config
          ? ((s as any).config as Record<string, unknown>)
          : {}
      if (config.reward_item_id === itemId) return true
      return false
    })
  }

  function findNodesRequiringItem(itemId: string) {
    return stages.filter((s) => {
      const reqId = (s as any).required_item_id || ''
      return reqId === itemId
    })
  }

  return (
    <div style={container}>
      {/* 1. Mesa de Trabajo y Recetas PRIMERO */}
      <section style={section}>
        <h3 style={sectionTitle}>⚒️ Mesa de Trabajo y Recetas</h3>
        <p style={subtitle}>
          Combina ingredientes en la mesa de trabajo. Pulsa <strong>⚡ Generar nodos</strong> para colocar automáticamente las chinchetas de los ingredientes faltantes en el mapa.
        </p>
        <div style={list}>
          {RECIPES.map((recipe) => {
            const missingInputs = recipe.inputs.filter((inp) => !findNodeForItem(inp.id))

            return (
              <div key={recipe.id} style={recipeCard}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <h4 style={recipeTitle}>{recipe.label}</h4>
                  {missingInputs.length > 0 && onCreateNodesWithItems ? (
                    <button
                      type="button"
                      style={createMissingBtn}
                      onClick={() => {
                        onCreateNodesWithItems(missingInputs.map((inp) => ({ id: inp.id, label: inp.label })))
                      }}
                    >
                      ⚡ Generar {missingInputs.length} chincheta(s) en mapa
                    </button>
                  ) : missingInputs.length === 0 ? (
                    <span style={statusBadgeSuccess}>🟢 Todos los ingredientes en mapa</span>
                  ) : null}
                </div>

                <div style={formula}>
                  <div style={formulaSection}>
                    <span style={formulaLabel}>INGREDIENTES</span>
                    {recipe.inputs.map((input, idx) => {
                      const hasNode = Boolean(findNodeForItem(input.id))
                      return (
                        <div key={idx} style={formulaRow}>
                          <span style={{ color: hasNode ? '#86efac' : '#fca5a5' }}>
                            {hasNode ? '✓' : '⚠️'} {input.label}
                          </span>
                          <b>×{input.quantity}</b>
                        </div>
                      )
                    })}
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
            )
          })}
        </div>
      </section>

      {/* 2. Objetos y Coleccionables SEGUNDO */}
      <section style={section}>
        <h3 style={sectionTitle}>🎒 Objetos y Coleccionables</h3>
        <p style={subtitle}>
          Lista de piezas y objetos. Haz clic en <strong>&quot;📍 Crear chincheta&quot;</strong> para colocar una chincheta en el mapa y arrastrarla directamente.
        </p>
        <div style={list}>
          {ITEMS.map((item) => {
            const providerNode = findNodeForItem(item.id)
            const requiringNodes = findNodesRequiringItem(item.id)

            return (
              <div key={item.id} style={itemCard}>
                <div style={itemHeader}>
                  <ItemIconSvg itemId={item.id} size={28} className="admin-obj-icon" />
                  <div style={{ marginLeft: '10px', flex: 1 }}>
                    <strong style={itemLabel}>{item.label}</strong>
                    <code style={itemCode}>ID: {item.id}</code>
                  </div>

                  {onCreateNodesWithItems ? (
                    <button
                      type="button"
                      style={createNodeBtn}
                      onClick={() => onCreateNodesWithItems([{ id: item.id, label: item.label }])}
                      title={`Colocar chincheta en el mapa para ${item.label}`}
                    >
                      📍 Crear chincheta
                    </button>
                  ) : null}
                </div>

                <p style={itemDesc}>{item.description}</p>

                {/* Node status info */}
                <div style={nodeStatusRow}>
                  {providerNode ? (
                    <span
                      style={statusBadgeSuccess}
                      onClick={() => onSelectStage?.(providerNode)}
                      title="Pulsa para seleccionar en el editor"
                    >
                      🟢 Entregado en: <b>{providerNode.title || `Nodo #${providerNode.index + 1}`}</b>
                    </span>
                  ) : (
                    <span style={statusBadgeWarning}>
                      ⚠️ Sin nodo en mapa (nadie lo entrega)
                    </span>
                  )}

                  {requiringNodes.length > 0 ? (
                    <span style={statusBadgeInfo}>
                      🔒 Requerido en {requiringNodes.length} nodo(s)
                    </span>
                  ) : null}
                </div>
              </div>
            )
          })}
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

const createNodeBtn: CSSProperties = {
  padding: '5px 10px',
  borderRadius: 8,
  border: '1px solid rgba(56, 189, 248, 0.4)',
  background: 'rgba(14, 165, 233, 0.18)',
  color: '#38bdf8',
  fontSize: 11,
  fontWeight: 800,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
}

const createMissingBtn: CSSProperties = {
  padding: '4px 9px',
  borderRadius: 8,
  border: '1px solid rgba(251, 191, 36, 0.4)',
  background: 'rgba(245, 158, 11, 0.18)',
  color: '#fbbf24',
  fontSize: 10,
  fontWeight: 800,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
}

const nodeStatusRow: CSSProperties = {
  marginTop: 8,
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
  alignItems: 'center',
}

const statusBadgeSuccess: CSSProperties = {
  fontSize: 10,
  fontWeight: 800,
  color: '#4ade80',
  background: 'rgba(34, 197, 94, 0.12)',
  border: '1px solid rgba(34, 197, 94, 0.25)',
  borderRadius: 6,
  padding: '3px 8px',
  cursor: 'pointer',
}

const statusBadgeWarning: CSSProperties = {
  fontSize: 10,
  fontWeight: 800,
  color: '#fca5a5',
  background: 'rgba(239, 68, 68, 0.12)',
  border: '1px solid rgba(239, 68, 68, 0.25)',
  borderRadius: 6,
  padding: '3px 8px',
}

const statusBadgeInfo: CSSProperties = {
  fontSize: 10,
  fontWeight: 800,
  color: '#93c5fd',
  background: 'rgba(59, 130, 246, 0.12)',
  border: '1px solid rgba(59, 130, 246, 0.25)',
  borderRadius: 6,
  padding: '3px 8px',
}

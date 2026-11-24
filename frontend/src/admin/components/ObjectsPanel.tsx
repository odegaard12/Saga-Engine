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

  // 23/11: misma piel que el resto de paneles (tarjetas de Ajustes, botones `r7-btn`, píldoras de estado); los estilos,
  // en admin-r7-paneles.css. Antes llevaba los suyos en línea, con letra de 10-11 px y botones dorados.
  return (
    <div className="r7-objetos">
      {/* 1. Mesa de Trabajo y Recetas PRIMERO */}
      <section className="admin-settings-section-modern">
        <div className="admin-settings-section-head">
          <strong>Mesa de trabajo y recetas</strong>
          <span>
            Cada receta combina ingredientes para dar un objeto. «Generar chinchetas» coloca en el mapa los ingredientes
            que todavía no entrega ningún nodo.
          </span>
        </div>
        <div className="r7-objetos-lista">
          {RECIPES.map((recipe) => {
            const missingInputs = recipe.inputs.filter((inp) => !findNodeForItem(inp.id))

            return (
              <article key={recipe.id} className="r7-objeto">
                <div className="r7-objeto-cabeza">
                  <h4>{recipe.label}</h4>
                  {missingInputs.length > 0 && onCreateNodesWithItems ? (
                    <button
                      type="button"
                      className="r7-btn"
                      onClick={() => {
                        onCreateNodesWithItems(missingInputs.map((inp) => ({ id: inp.id, label: inp.label })))
                      }}
                    >
                      Generar {missingInputs.length} {missingInputs.length === 1 ? 'chincheta' : 'chinchetas'} en el mapa
                    </button>
                  ) : missingInputs.length === 0 ? (
                    <span className="r7-pildora ok">Todos los ingredientes en el mapa</span>
                  ) : null}
                </div>

                <div className="r7-receta">
                  <div className="r7-receta-lado">
                    <span className="r7-receta-rotulo">Ingredientes</span>
                    {recipe.inputs.map((input, idx) => {
                      const hasNode = Boolean(findNodeForItem(input.id))
                      return (
                        <div key={idx} className="r7-receta-fila">
                          <ItemIconSvg itemId={input.id} size={24} className="admin-obj-icon" />
                          <span>{input.label}</span>
                          <b>×{input.quantity}</b>
                          <span className={hasNode ? 'r7-pildora ok' : 'r7-pildora incompleto'}>
                            {hasNode ? 'En el mapa' : 'Falta'}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                  <div className="r7-receta-flecha" aria-hidden="true">
                    ➔
                  </div>
                  <div className="r7-receta-lado">
                    <span className="r7-receta-rotulo">Resultado</span>
                    {recipe.outputs.map((output, idx) => (
                      <div key={idx} className="r7-receta-fila">
                        <ItemIconSvg itemId={output.id} size={24} className="admin-obj-icon" />
                        <strong>{output.label}</strong>
                        <b>×{output.quantity}</b>
                      </div>
                    ))}
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      </section>

      {/* 2. Objetos y Coleccionables SEGUNDO */}
      <section className="admin-settings-section-modern">
        <div className="admin-settings-section-head">
          <strong>Objetos y coleccionables</strong>
          <span>
            Las piezas que se pueden entregar o pedir en un nodo. «Crear chincheta» coloca una en el mapa para
            arrastrarla a su sitio.
          </span>
        </div>
        <div className="r7-objetos-lista">
          {ITEMS.map((item) => {
            const providerNode = findNodeForItem(item.id)
            const requiringNodes = findNodesRequiringItem(item.id)

            return (
              <article key={item.id} className="r7-objeto">
                <div className="r7-objeto-cabeza">
                  <ItemIconSvg itemId={item.id} size={32} className="admin-obj-icon" />
                  <div className="r7-objeto-nombre">
                    <h4>{item.label}</h4>
                    <code>{item.id}</code>
                  </div>

                  {onCreateNodesWithItems ? (
                    <button
                      type="button"
                      className="r7-btn"
                      onClick={() => onCreateNodesWithItems([{ id: item.id, label: item.label }])}
                      title={`Colocar chincheta en el mapa para ${item.label}`}
                    >
                      Crear chincheta
                    </button>
                  ) : null}
                </div>

                <p>{item.description}</p>

                {/* Node status info */}
                <div className="r7-objeto-estado">
                  {providerNode ? (
                    <button
                      type="button"
                      className="r7-pildora ok"
                      onClick={() => onSelectStage?.(providerNode)}
                      title="Pulsa para seleccionar en el editor"
                    >
                      Lo entrega: {providerNode.title || `Nodo #${providerNode.index + 1}`}
                    </button>
                  ) : (
                    <span className="r7-pildora aviso">Sin nodo en el mapa (nadie lo entrega)</span>
                  )}

                  {requiringNodes.length > 0 ? (
                    <span className="r7-pildora">
                      Lo piden {requiringNodes.length} {requiringNodes.length === 1 ? 'nodo' : 'nodos'}
                    </span>
                  ) : null}
                </div>
              </article>
            )
          })}
        </div>
      </section>
    </div>
  )
}

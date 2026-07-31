import { useMemo } from 'react'
import type { StageLike } from './guided-editor/guidedEditorUtils'
import { configOf } from './guided-editor/guidedEditorUtils'

export interface AdminCollectibleEditorProps {
  stage: StageLike
  onPatch: (updates: Record<string, any>) => void
  onClose: () => void
  onDelete: () => void
  onRequestChangeType?: () => void
  stages?: StageLike[]
}

export default function AdminCollectibleEditor({
  stage,
  onPatch,
  onClose,
  onDelete,
  onRequestChangeType,
  stages = [],
}: AdminCollectibleEditorProps) {
  const config = configOf(stage)

  const collectibleItems = useMemo(() => {
    return stages
      .filter((s) => {
        if (s.id === stage.id) return false
        const sId = s.physical_item_id || s.physical_qr?.item_id || s.config?.physical_item_id || ''
        return Boolean(sId)
      })
      .map((s) => {
        const sId = s.physical_item_id || s.physical_qr?.item_id || s.config?.physical_item_id || ''
        const sLabel = s.physical_item_label || s.physical_qr?.label || s.title || `Nodo ${s.index + 1}`
        const icon = (s.physical_node_kind === 'collectible' || s.is_map_collectible || s.config?.is_map_collectible) ? '🎁' : '🔑'
        return {
          id: sId,
          label: `${icon} ${sLabel} (del Nodo ${s.index + 1})`,
        }
      })
  }, [stages, stage.id])

  const targetNodeOptions = useMemo(() => {
    return stages
      .filter(s => s.id !== stage.id)
      .map(s => ({
        id: s.id,
        label: `Nodo ${s.index + 1}: ${s.title || 'Sin título'}`,
      }))
  }, [stages, stage.id])

  const isLockedByItem = Boolean(stage.required_item_id && stage.requires_item !== false)
  const isCustomItem = isLockedByItem && 
    !['llave_maestra', 'emp_device'].includes(stage.required_item_id) && 
    !collectibleItems.some(i => i.id === stage.required_item_id)

  const hasTargetNode = Boolean(stage.target_node_id)
  const hasReward = Boolean(stage.reward_item_id)

  function updateConfig(key: string, value: any) {
    onPatch({
      config: {
        ...config,
        [key]: value
      }
    })
  }

  return (
    <div className="saga-guided-v4-scroll-view">
      <header className="saga-guided-v4-header">
        <div className="saga-guided-v4-titleblock">
          <span>COLECCIONABLE DE MAPA</span>
          <input
            value={stage.title || stage.physical_item_label || ''}
            onChange={(e) => onPatch({ title: e.target.value, physical_item_label: e.target.value })}
            placeholder="Objeto Coleccionable"
            style={{
              background: 'transparent',
              border: 'none',
              borderBottom: '2px dashed rgba(255,255,255,0.2)',
              color: '#fff',
              fontSize: '22px',
              fontWeight: 800,
              padding: '2px 0',
              margin: '4px 0',
              outline: 'none',
              width: '100%',
              fontFamily: 'inherit'
            }}
          />
          <div className="saga-guided-v4-chips">
            <b>⭐ Coleccionable</b>
            <b>Jugable</b>
            <b>Offline listo</b>
            {stage.lat != null && stage.lon != null ? (
              <b>
                {Number(stage.lat).toFixed(5)}, {Number(stage.lon).toFixed(5)}
              </b>
            ) : null}
          </div>
        </div>

        <div className="saga-guided-v4-actions">
          <button
            type="button"
            className="primary-soft"
            onClick={() => {
              if (onRequestChangeType) {
                onRequestChangeType()
              } else {
                onPatch({ _type_choice_done: false })
              }
            }}
          >
            Cambiar tipo
          </button>
          <button type="button" className="danger" onClick={onDelete}>
            Eliminar
          </button>
          <button type="button" onClick={onClose}>
            Cerrar ×
          </button>
        </div>
      </header>

      <div className="saga-guided-v4-page" style={{ paddingTop: 20 }}>
        <div className="saga-guided-v4-pagehead">
          <span>Coleccionable de Mapa</span>
          <h3>Configura tu objeto coleccionable</h3>
          <p>
            Los jugadores recogerán este objeto automáticamente al acercarse con su GPS. 
            A diferencia de los nodos normales, no requiere jugar a un minijuego, solo estar en la ubicación.
          </p>
        </div>

        <div className="saga-guided-v4-formgrid">
          
          <div className="saga-guided-v4-dep-box wide">
            <div className="saga-guided-v4-dep-box__title">
              📋 Datos del objeto
            </div>
            <p className="saga-guided-v4-dep-box__desc">
              Cómo se verá este coleccionable en la mochila del jugador.
            </p>
            <label>
              <span>ID interno (para lógica)</span>
              <input 
                type="text" 
                value={stage.physical_item_id || ''} 
                onChange={(e) => onPatch({ physical_item_id: e.target.value })}
                placeholder="Ej. bateria_1, reliquia"
              />
              <small>Usa minúsculas sin espacios. Este ID servirá si otro nodo requiere este objeto.</small>
            </label>
            <label className="wide" style={{ marginTop: 12 }}>
              <span>Historia / Introducción (Opcional)</span>
              <input 
                type="text" 
                value={stage.intro_title || ''} 
                onChange={(e) => onPatch({ intro_title: e.target.value })}
                placeholder="Título de la historia"
                style={{ marginBottom: 8 }}
              />
              <textarea 
                value={stage.intro_body || ''} 
                onChange={(e) => onPatch({ intro_body: e.target.value })}
                placeholder="Escribe la narrativa que leerá el jugador ANTES de recoger el objeto. Soporta Markdown para imágenes: ![alt](url)."
                rows={3}
              />
            </label>
            <label className="wide" style={{ marginTop: 12 }}>
              <span>Mensaje al recoger</span>
              <textarea 
                value={stage.content || ''} 
                onChange={(e) => onPatch({ content: e.target.value, description: e.target.value })}
                placeholder="¡Has encontrado una reliquia!"
                rows={3}
              />
            </label>
          </div>

          <div className="saga-guided-v4-dep-box wide">
            <div className="saga-guided-v4-dep-box__title">
              🔒 ¿Requiere un objeto previo?
            </div>
            <p className="saga-guided-v4-dep-box__desc">
              El jugador no podrá recoger este objeto si no tiene antes otro específico en la mochila.
            </p>
            <select
              value={!isLockedByItem ? 'none' : isCustomItem ? 'custom' : stage.required_item_id}
              onChange={(e) => {
                const val = e.target.value
                if (val === 'none') {
                  onPatch({ required_item_id: '', requires_item: false })
                } else if (val === 'custom') {
                  onPatch({ required_item_id: 'item_requerido', requires_item: true })
                } else {
                  onPatch({ required_item_id: val, requires_item: true })
                }
              }}
            >
              <option value="none">🟢 Libre: cualquier jugador puede acceder</option>
              <option value="llave_maestra">🔑 Requiere Llave Maestra</option>
              <option value="emp_device">⚡ Requiere Dispositivo EMP</option>
              <option value="decodificador_cuantico">💻 Requiere Decodificador Cuántico</option>
              <option value="escaner_biometrico">🔬 Requiere Escáner Biométrico</option>
              <option value="amuleto_guardian">🛡️ Requiere Amuleto del Guardián</option>
              <option value="elixir_alquimia">🧪 Requiere Elixir de Alquimia</option>
              <option value="escudo_runico">🛡️ Requiere Escudo Rúnico</option>
              <option value="orbe_fuego">🔮 Requiere Orbe de Fuego Arcano</option>
              <option value="reliquia_sagrada">🏛️ Requiere Reliquia Sagrada</option>
              <option value="amuleto_vision">👁️ Requiere Amuleto de Visión</option>
              {collectibleItems.map(item => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
              <option value="custom">✏️ Otro ID personalizado...</option>
            </select>
            {isCustomItem && (
              <label>
                <span>ID del objeto requerido</span>
                <input
                  type="text"
                  value={stage.required_item_id}
                  onChange={(e) => onPatch({ required_item_id: e.target.value })}
                  placeholder="Ej. tarjeta_roja"
                />
              </label>
            )}
          </div>

          <div className="saga-guided-v4-dep-box wide">
            <div className="saga-guided-v4-dep-box__title">
              📍 Conectar con otro nodo
            </div>
            <p className="saga-guided-v4-dep-box__desc">
              Si recoges este objeto, el mapa trazará una línea conectando con el nodo destino. Útil para indicar dónde se debe usar el objeto.
            </p>
            <label className="saga-guided-v4-check-field">
              <input
                type="checkbox"
                checked={hasTargetNode}
                onChange={(e) => {
                  if (e.target.checked) {
                    onPatch({ target_node_id: targetNodeOptions[0]?.id || '' })
                  } else {
                    onPatch({ target_node_id: null })
                  }
                }}
              />
              <span>Mostrar línea hacia otro nodo</span>
            </label>
            {hasTargetNode && (
              <select
                value={stage.target_node_id || ''}
                onChange={(e) => onPatch({ target_node_id: e.target.value })}
              >
                <option value="">Selecciona un nodo destino</option>
                {targetNodeOptions.map(opt => (
                  <option key={opt.id} value={opt.id}>{opt.label}</option>
                ))}
              </select>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}

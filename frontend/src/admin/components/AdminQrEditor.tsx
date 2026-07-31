import type { StageLike } from './guided-editor/guidedEditorUtils'
import { configOf } from './guided-editor/guidedEditorUtils'
import PhysicalQrCardsPanel, { type PhysicalQrKind, type SavedPhysicalQrCard } from './PhysicalQrCardsPanel'

export interface AdminQrEditorProps {
  stage: StageLike
  onPatch: (updates: Record<string, unknown>) => void
  onClose: () => void
  onDelete: () => void
  onRequestChangeType?: () => void
  stages?: StageLike[]
}

export default function AdminQrEditor({
  stage,
  onPatch,
  onClose,
  onDelete,
  onRequestChangeType,
  stages: _stages = [],
}: AdminQrEditorProps) {
  const config = configOf(stage)
  const mode = (stage.physical_node_kind || 'collectible') as PhysicalQrKind

  function handleSaveQr(card: SavedPhysicalQrCard) {
    onPatch({
      physical_node_kind: card.kind,
      physical_qr: card,
      qr_payload: card.payload,
      physical_item_id: card.item_id,
      physical_item_label: card.label,
      physical_item_kind: card.kind,
      title: card.label,
      config: {
        ...config,
        success_code: String(config.success_code || config.fallback_code || `SAGA-${String(stage.index + 1).padStart(2, '0')}`)
      }
    })
  }

  return (
    <div className="saga-guided-v4-scroll-view">
      <header className="saga-guided-v4-header">
        <div className="saga-guided-v4-titleblock">
          <span>QR FÍSICO</span>
          <h2>{stage.title || 'Objeto Escaneable'}</h2>
          <div className="saga-guided-v4-chips">
            <b>▣ QR Físico</b>
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
          <span>QR Físico</span>
          <h3>Configura tu objeto escaneable</h3>
          <p>
            Esta tarjeta se debe imprimir y esconder en el mundo real. 
            El jugador usará la cámara SAGA para escanearla.
          </p>
        </div>

        <div className="saga-guided-v4-formgrid">
          
          <div className="saga-guided-v4-dep-box wide">
            <div className="saga-guided-v4-dep-box__title">
              🖼️ Diseño y Datos del QR
            </div>
            <p className="saga-guided-v4-dep-box__desc">
              Personaliza el nombre de este objeto y genera el QR para imprimir.
            </p>
            <div style={{ padding: '0 12px' }}>
              <label>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>Nombre visible del objeto</span>
                <input 
                  type="text" 
                  value={stage.title || stage.physical_item_label || ''} 
                  onChange={(e) => onPatch({ title: e.target.value, physical_item_label: e.target.value })}
                  placeholder="Ej. Batería agotada, Reliquia..."
                  style={{ width: '100%', padding: '8px 12px', background: 'rgba(15,23,42,0.5)', border: '1px solid rgba(148,163,184,0.2)', borderRadius: 6, color: '#f8fafc', marginBottom: 12, marginTop: 4 }}
                />
              </label>
              
              <PhysicalQrCardsPanel
                initialLabel={stage.physical_item_label || stage.title || 'Buscar a tu enemigo'}
                initialKind={mode}
                compact
                hideInputs
                onSaveToNode={handleSaveQr}
              />
            </div>
          </div>

          <div className="saga-guided-v4-dep-box wide">
            <div className="saga-guided-v4-dep-box__title">
              📖 Historia / Introducción (Opcional)
            </div>
            <p className="saga-guided-v4-dep-box__desc">
              Texto que se mostrará al jugador ANTES de indicarle que escanee el QR.
            </p>
            <div style={{ padding: '0 12px 12px' }}>
              <label className="wide">
                <span>Título de la historia</span>
                <input 
                  type="text" 
                  value={stage.intro_title || ''} 
                  onChange={(e) => onPatch({ intro_title: e.target.value })}
                  placeholder="Ej: El cofre secreto"
                  style={{ marginBottom: 8 }}
                />
              </label>
              <label className="wide">
                <span>Narrativa previa</span>
                <textarea 
                  value={stage.intro_body || ''} 
                  onChange={(e) => onPatch({ intro_body: e.target.value })}
                  placeholder="Soporta Markdown para imágenes: ![alt](url)."
                  rows={3}
                />
              </label>
            </div>
          </div>

          <div className="saga-guided-v4-dep-box wide">
            <div className="saga-guided-v4-dep-box__title">
              🆘 Código de Emergencia (Fallback)
            </div>
            <p className="saga-guided-v4-dep-box__desc">
              Si la cámara del jugador falla o el QR se rompe, el jugador puede escribir este código manualmente.
            </p>
            <label>
              <span>Código Alfanumérico Corto</span>
              <input 
                type="text" 
                value={String(config.success_code || config.fallback_code || `SAGA-${String(stage.index + 1).padStart(2, '0')}`)} 
                onChange={(e) => {
                  const val = e.target.value.trim().toUpperCase()
                  onPatch({
                    fallback_code: val,
                    physical_fallback_code: val,
                    config: {
                      ...config,
                      success_code: val
                    }
                  })
                }}
                placeholder="Ej. SAGA-12"
              />
            </label>
          </div>

        </div>
      </div>
    </div>
  )
}

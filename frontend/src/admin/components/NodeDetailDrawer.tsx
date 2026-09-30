import { useEffect, useRef, useState } from 'react'
import type { AdminReactOverviewStage } from '../lib/adminApi'
import GuidedNodeEditorFlow from './GuidedNodeEditorFlow'
import { familyCards } from '../lib/familyConfigs'
import { applyDraftPatch, sameGeometry, withMapGeometry } from '../lib/adminStageDraft'

type NodeDetailDrawerProps = {
  stage: AdminReactOverviewStage
  stages?: AdminReactOverviewStage[]
  onClose: () => void
  onApplyLocal: (stage: AdminReactOverviewStage) => void
  onDeleteLocal: (stage: AdminReactOverviewStage) => void
  onRequestChangeType?: () => void
}

function formatCoords(lat: unknown, lon: unknown) {
  if (typeof lat !== 'number' || typeof lon !== 'number') return 'No coordinates'
  return `${lat.toFixed(5)}, ${lon.toFixed(5)}`
}

export default function NodeDetailDrawer({
  stage,
  stages = [],
  onClose,
  onApplyLocal,
  onDeleteLocal,
  onRequestChangeType,
}: NodeDetailDrawerProps) {
  const [draft, setDraft] = useState<AdminReactOverviewStage>(stage)

  // El borrador vive TAMBIÉN en un ref: dos cambios seguidos (antes de que React
  // vuelva a pintar) tienen que partir del último, no de lo que se pintó. Antes
  // cada cambio partía del `draft` capturado al pintar y el segundo pisaba al
  // primero. `liveRef` es el nodo tal y como está AHORA en la vista general, con
  // lo que el mapa haya movido mientras el cajón estaba abierto.
  const draftRef = useRef<AdminReactOverviewStage>(stage)
  const liveRef = useRef<AdminReactOverviewStage>(stage)
  liveRef.current = stage

  function commitDraft(next: AdminReactOverviewStage) {
    draftRef.current = next
    setDraft(next)
  }

  function patchGuidedV3Stage(patch: Record<string, unknown>) {
    // La geometría (lat/lon, moldeado) se toma de la vista viva: si se arrastró
    // el nodo con el cajón abierto, el cambio NO devuelve las coordenadas viejas.
    const next = applyDraftPatch(
      draftRef.current as unknown as Record<string, unknown>,
      liveRef.current as unknown as Record<string, unknown>,
      patch
    ) as unknown as AdminReactOverviewStage

    commitDraft(next)
    onApplyLocal(next)
  }

  // Otro nodo (o el mismo con otro id: al guardar, `local-...` pasa a su id
  // numérico): el borrador empieza de cero desde la vista viva.
  useEffect(() => {
    commitDraft(stage)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage.id, stage.index])

  // El mapa movió el nodo o le moldeó el tramo con el cajón abierto: se resincroniza.
  useEffect(() => {
    const actual = draftRef.current as unknown as Record<string, unknown>
    const viva = stage as unknown as Record<string, unknown>
    if (sameGeometry(actual, viva)) return
    commitDraft(withMapGeometry(actual, viva) as unknown as AdminReactOverviewStage)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage.lat, stage.lon, stage.route_via, stage.route_track])

  const family = familyCards.find((item) => item.id === draft.type) || familyCards[0]

  const isLocalNew = typeof draft.id === 'string' && draft.id.startsWith('local-')

  return (
    <div className="admin-drawer-overlay admin-drawer-overlay--nonblocking" role="region">
      <aside
        className="admin-drawer admin-drawer-editable admin-node-editor-redesign admin-node-editor-large-modal admin-guided-v4-shell"
        role="dialog"

        aria-label={`Node editor: ${draft.title}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="admin-drawer-head admin-drawer-head--modern admin-node-editor-topbar">
          <div className="admin-node-editor-kicker-row">
            <span className="admin-kicker">
              {isLocalNew ? 'Añadir nodo' : 'Editor guiado de nodo'}
            </span>

            <button type="button" className="admin-node-editor-close" onClick={onClose}>
              Cerrar ×
            </button>
          </div>

          <div className="admin-node-editor-title-row">
            <div className="admin-node-editor-title-copy">
              <h2>
                <span style={{ opacity: 0.65, marginRight: 8 }}>#{draft.index + 1}</span>
                {draft.title ? draft.title.replace(/^\d+\.\s*/, '') : 'Nodo sin título'}
              </h2>

              <div className="admin-drawer-meta admin-node-editor-meta">
                <span>
                  {family?.icon || '◇'} {draft.label || draft.type}
                </span>
                <span>{formatCoords(draft.lat, draft.lon)}</span>
                <span>{typeof draft.radius === 'number' ? `${draft.radius} m` : 'Sin radio'}</span>
              </div>
            </div>

            <div className="admin-node-editor-actions">
              <button type="button" onClick={onRequestChangeType}>
                Cambiar tipo
              </button>
              <button
                type="button"
                className="admin-node-delete-visible"
                onClick={() => {
                  if (
                    window.confirm(
                      `Eliminar nodo "${draft.title || 'Sin título'}"? Guarda después para persistir.`
                    )
                  ) {
                    onDeleteLocal(draft)
                  }
                }}
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
        <div className="admin-drawer-body admin-drawer-body--modern admin-guided-v4-body-host">
          <GuidedNodeEditorFlow
            stage={draft}
            onPatch={patchGuidedV3Stage}
            onClose={onClose}
            stages={stages}
            onRequestChangeType={onRequestChangeType}
            onDelete={() => {
              if (
                window.confirm(
                  `Eliminar nodo "${draft.title || 'Sin título'}"? Pulsa Guardar después para persistir.`
                )
              ) {
                onDeleteLocal(draft)
              }
            }}
          />
        </div>
      </aside>
    </div>
  )
}

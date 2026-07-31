import { useEffect, useState } from 'react'
import type { StageLike } from './guided-editor/guidedEditorUtils'
import { isMapCollectibleStage, isQrStage } from './guided-editor/guidedEditorUtils'
import AdminGameEditor from './AdminGameEditor'
import AdminCollectibleEditor from './AdminCollectibleEditor'
import AdminQrEditor from './AdminQrEditor'

export interface GuidedNodeEditorFlowProps {
  stage: StageLike
  onPatch: (updates: Record<string, any>) => void
  onClose: () => void
  onDelete: () => void
  onRequestChangeType?: () => void
  stages?: StageLike[]
}

export default function GuidedNodeEditorFlow({
  stage,
  onPatch,
  onClose,
  onDelete,
  onRequestChangeType,
  stages = [],
}: GuidedNodeEditorFlowProps) {
  const [editorMode, setEditorMode] = useState<'map_collectible' | 'qr' | 'game'>(() =>
    isMapCollectibleStage(stage) ? 'map_collectible' : isQrStage(stage) ? 'qr' : 'game'
  )

  useEffect(() => {
    setEditorMode(
      isMapCollectibleStage(stage) ? 'map_collectible' : isQrStage(stage) ? 'qr' : 'game'
    )
  }, [stage.id, stage.index, (stage as any).config?.is_map_collectible, stage.physical_node_kind, stage.entry_mode])

  return (
    <div className="saga-guided-v4-flow-container">
      {editorMode === 'map_collectible' ? (
        <AdminCollectibleEditor
          stage={stage}
          onPatch={onPatch}
          stages={stages}
          onClose={onClose}
          onDelete={onDelete}
          onRequestChangeType={onRequestChangeType}
        />
      ) : editorMode === 'qr' ? (
        <AdminQrEditor
          stage={stage}
          onPatch={onPatch}
          stages={stages}
          onClose={onClose}
          onDelete={onDelete}
          onRequestChangeType={onRequestChangeType}
        />
      ) : (
        <AdminGameEditor
          stage={stage}
          onPatch={onPatch}
          onClose={onClose}
          onDelete={onDelete}
          onRequestChangeType={onRequestChangeType}
          stages={stages}
        />
      )}
    </div>
  )
}


import type { StageLike } from './guided-editor/guidedEditorUtils'
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { isMapCollectibleStage as _isMapCollectibleStage, isQrStage as _isQrStage } from './guided-editor/guidedEditorUtils'
import AdminGameEditor from './AdminGameEditor'

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
  return (
    <div className="saga-guided-v4-flow-container">
      <AdminGameEditor
        stage={stage}
        onPatch={onPatch}
        onClose={onClose}
        onDelete={onDelete}
        onRequestChangeType={onRequestChangeType}
        stages={stages}
      />
    </div>
  )
}


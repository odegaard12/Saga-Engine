import { missionTemplates, type MissionTemplateId } from '../lib/gameCatalog'
import type { AdminReactOverviewStage } from '../lib/adminApi'

type MissionBuilderPanelProps = {
  stages: AdminReactOverviewStage[]
  onCreateNode: () => void
  onApplyTemplate: (templateId: MissionTemplateId) => void
}

export default function MissionBuilderPanel({
  stages,
  onCreateNode,
  onApplyTemplate,
}: MissionBuilderPanelProps) {
  return (
    <div className="admin-cms-local-panel saga-mission-builder-panel">
      <strong>Crear contenido</strong>
      <span>
        Crea un nodo suelto para editarlo a mano, o arranca una plantilla completa de misión.
        Nada se guarda hasta pulsar Guardar.
      </span>

      <button type="button" className="saga-builder-single-node" onClick={onCreateNode}>
        <span>＋</span>
        <div>
          <strong>Crear nodo suelto</strong>
          <small>Empieza con un nodo normal y elige después si será QR, pista, bonus o minijuego.</small>
        </div>
      </button>

      {stages.length > 0 ? (
        <div className="saga-builder-warning">
          Las plantillas reemplazan la ruta local visible. No se persiste nada hasta pulsar Guardar.
        </div>
      ) : null}

      <div className="saga-template-grid">
        {missionTemplates.map((template) => (
          <article key={template.id} className="saga-template-card">
            <div className="saga-template-card-head">
              <span>{template.icon}</span>
              <div>
                <strong>{template.title}</strong>
                <small>{template.goodFor}</small>
              </div>
            </div>

            <p>{template.summary}</p>

            <ol>
              {template.stages.map((stage) => (
                <li key={`${template.id}-${stage.title}`}>{stage.title}</li>
              ))}
            </ol>

            <button type="button" onClick={() => onApplyTemplate(template.id)}>
              Usar plantilla
            </button>
          </article>
        ))}
      </div>
    </div>
  )
}

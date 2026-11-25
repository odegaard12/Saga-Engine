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
      <strong>Plantillas de misión</strong>
      <span>
        Arranca una ruta entera desde un modelo. Nada se guarda hasta pulsar Guardar. Para un nodo
        suelto,{' '}
        {/* 25/11: crear nodos tiene un solo nombre, «＋ Añadir nodo»; este enlace hace lo mismo que el del menú. */}
        <button type="button" className="admin-inline-soft" onClick={onCreateNode}>
          ＋ Añadir nodo
        </button>
        .
      </span>

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

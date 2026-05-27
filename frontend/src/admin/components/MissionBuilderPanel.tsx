import { missionTemplates, type MissionTemplateId } from '../lib/gameCatalog'
import type { AdminReactOverviewStage } from '../lib/adminApi'

type MissionBuilderPanelProps = {
  stages: AdminReactOverviewStage[]
  onApplyTemplate: (templateId: MissionTemplateId) => void
}

export default function MissionBuilderPanel({
  stages,
  onApplyTemplate,
}: MissionBuilderPanelProps) {
  return (
    <div className="admin-cms-local-panel saga-mission-builder-panel">
      <strong>Mission Builder</strong>
      <span>Elige una plantilla clara. Se crea una ruta editable en local; después revisa nodos y pulsa Guardar.</span>

      {stages.length > 0 ? (
        <div className="saga-builder-warning">
          Esta acción reemplaza la ruta local actual. No toca datos persistidos hasta que pulses Guardar.
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
                <li key={`${template.id}-${stage.title}`}>
                  {stage.title}
                </li>
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

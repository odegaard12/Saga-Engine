import { familyCards } from '../lib/familyConfigs'
import { adminGameCatalog } from '../lib/gameCatalog'

export default function FamiliesPanel() {
  return (
    <div className="admin-cms-local-panel">
      <strong>Juegos disponibles</strong>
      <span>13 plantillas editables. Internamente usan 3 motores estables: GPS, brújula y lógica.</span>

      <div className="admin-local-list">
        {adminGameCatalog.map((game) => (
          <div key={game.id} className="admin-local-row static admin-game-list-row">
            <span>{game.icon} {game.title}</span>
            <small>{game.difficulty} · {game.duration} · {game.summary}</small>
          </div>
        ))}
      </div>

      <strong>Motores internos</strong>
      <span>Estos son los runtimes que ejecuta el player actualmente.</span>

      <div className="admin-local-list">
        {familyCards.map((family) => (
          <div key={family.id} className="admin-local-row static">
            <span>{family.icon} {family.title}</span>
            <small>{family.id} · {family.detail}</small>
          </div>
        ))}
      </div>
    </div>
  )
}

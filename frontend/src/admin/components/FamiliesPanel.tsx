import { familyCards } from '../lib/familyConfigs'
import { adminGameCatalog, sortedByCategoryForDisplay } from '../lib/gameCatalog'
import { displayFamilyCards, getDisplayFamily } from '../lib/displayFamilies'

const juegosOrdenados = sortedByCategoryForDisplay(adminGameCatalog)

export default function FamiliesPanel() {
  return (
    <div className="admin-cms-local-panel">
      <strong>Familias de juegos</strong>
      <span>
        {adminGameCatalog.length} plantillas editables, organizadas en 5 familias claras para el
        editor. Es solo agrupación de presentación: no cambia ningún id de juego guardado en la
        misión.
      </span>

      <div className="admin-local-list">
        {displayFamilyCards.map((familyCard) => {
          const games = juegosOrdenados.filter(
            (game) => getDisplayFamily(game.id) === familyCard.id
          )
          return (
            <div key={familyCard.id} className="admin-local-row static">
              <span>
                {familyCard.icon} {familyCard.title} ({games.length})
              </span>
              <small>{familyCard.description}</small>
            </div>
          )
        })}
      </div>

      <strong>Juegos disponibles</strong>
      <span>
        Motores actuales: movimiento, QR/físico y lógica. GPS/brújula quedan solo como motores
        internos legacy si una misión antigua los usa.
      </span>

      <div className="admin-local-list">
        {juegosOrdenados.map((game) => (
          <div key={game.id} className="admin-local-row static admin-game-list-row">
            <span>
              {game.icon} {game.title}
            </span>
            <small>
              {game.difficulty} · {game.duration} · {game.summary}
            </small>
          </div>
        ))}
      </div>

      <strong>Motores internos</strong>
      <span>Estos son los runtimes que ejecuta el player actualmente.</span>

      <div className="admin-local-list">
        {familyCards.map((family) => (
          <div key={family.id} className="admin-local-row static">
            <span>
              {family.icon} {family.title}
            </span>
            <small>
              {family.id} · {family.detail}
            </small>
          </div>
        ))}
      </div>
    </div>
  )
}

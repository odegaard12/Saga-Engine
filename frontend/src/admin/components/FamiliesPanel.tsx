import { familyCards } from '../lib/familyConfigs'
import { adminGameCatalog, sortedByCategoryForDisplay } from '../lib/gameCatalog'
import { displayFamilyCards, getDisplayFamily } from '../lib/displayFamilies'

const juegosOrdenados = sortedByCategoryForDisplay(adminGameCatalog)

/**
 * Catálogo de minijuegos por familia (ronda 7): cada familia es una sección con
 * su icono y su descripción corta, y cada juego una tarjeta con dificultad,
 * duración y resumen. Es sólo consulta: no cambia ningún id guardado en la misión.
 */
export default function FamiliesPanel() {
  return (
    <div className="admin-cms-local-panel r7-panel">
      <div className="r7-panel-cabeza">
        <div>
          <h2>Minijuegos</h2>
          <p>
            {adminGameCatalog.length} plantillas editables, agrupadas en {displayFamilyCards.length}{' '}
            familias. Para usar una, elige el tipo del nodo en su editor. Esta vista es sólo de
            consulta: no cambia ningún juego guardado en la misión.
          </p>
        </div>
        <div className="r7-contador">
          <strong>{adminGameCatalog.length}</strong>
          <span>juegos</span>
        </div>
      </div>

      {displayFamilyCards.map((familyCard) => {
        const games = juegosOrdenados.filter((game) => getDisplayFamily(game.id) === familyCard.id)
        return (
          <section key={familyCard.id} className="r7-familia" aria-label={familyCard.title}>
            <header className="r7-familia-cabeza">
              <span className="r7-familia-icono" aria-hidden="true">
                {familyCard.icon}
              </span>
              <div>
                <h3>
                  {familyCard.title} <small>({games.length})</small>
                </h3>
                <p>{familyCard.description}</p>
              </div>
            </header>
            <ul className="r7-rejilla-juegos">
              {games.map((game) => (
                <li key={game.id} className="r7-tarjeta-juego">
                  <span className="r7-tarjeta-juego-icono" aria-hidden="true">
                    {game.icon}
                  </span>
                  <div>
                    <strong>{game.title}</strong>
                    <p>{game.summary}</p>
                    <span className="r7-etiquetas">
                      {game.difficulty ? <span className="r7-chip">{game.difficulty}</span> : null}
                      {game.duration ? (
                        <span className="r7-chip suave">{game.duration}</span>
                      ) : null}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )
      })}

      <details className="r7-detalle">
        <summary>Motores internos (lo que ejecuta el móvil)</summary>
        <ul className="r7-rejilla-juegos">
          {familyCards.map((family) => (
            <li key={family.id} className="r7-tarjeta-juego">
              <span className="r7-tarjeta-juego-icono" aria-hidden="true">
                {family.icon}
              </span>
              <div>
                <strong>{family.title}</strong>
                <p>
                  {family.id} · {family.detail}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </details>
    </div>
  )
}

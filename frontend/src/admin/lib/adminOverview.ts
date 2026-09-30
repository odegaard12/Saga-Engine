/**
 * Cómo se mezcla una relectura del servidor con lo que el organizador tiene
 * a medio editar.
 *
 * Tras cambiar el progreso de un jugador, guardar los jugadores o guardar los
 * ajustes, el panel volvía a pedir la vista general y la ponía ENTERA en su
 * sitio: con ella se iban los nodos movidos o editados que todavía no se habían
 * guardado (el botón seguía diciendo «Sin guardar», pero los cambios ya no
 * estaban; informe A16). Aquí solo se toma del servidor lo que ese paso ha
 * cambiado: jugadores, sus fichas y los ajustes. Los nodos, y la huella con la
 * que se cargaron (`stages_revision`), se quedan como estaban.
 */
import type { AdminReactOverviewResponse } from './adminApi'

export function mergeServerPeople(
  actual: AdminReactOverviewResponse | null,
  servidor: AdminReactOverviewResponse
): AdminReactOverviewResponse | null {
  if (!actual) return actual

  return {
    ...actual,
    config: servidor.config ?? actual.config,
    profiles: servidor.profiles ?? actual.profiles,
    player_profiles: servidor.player_profiles ?? actual.player_profiles,
    counts: actual.counts
      ? {
          ...actual.counts,
          ...(servidor.counts
            ? {
                players: servidor.counts.players,
                profiles: servidor.counts.profiles,
                finished_profiles: servidor.counts.finished_profiles,
              }
            : {}),
        }
      : actual.counts,
  }
}

/**
 * El borrador de ajustes sin la contraseña de misión: esa clave escrita nunca se
 * guarda en el navegador ni en un fichero descargado.
 */
export function withoutMissionPass(draft: Record<string, string>): Record<string, string> {
  const copia = { ...draft }
  delete copia.mission_pass
  return copia
}

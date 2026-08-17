import type { PlayerStage } from '../types/player'

/**
 * La configuración de un nodo. UNA función, para todos.
 *
 * Un nodo trae la configuración en dos sitios: `config`, que es la del editor,
 * y `minigame.config`, que es la que el motor arma para el jugador. Y no
 * llevan lo mismo. Manda la del minijuego.
 *
 * Eso ya ha costado caro: subir la dificultad de un juego tocando `config` no
 * llegaba nunca al móvil y el juego seguía igual de fácil, sin dar ningún
 * error. Y cada sitio del código lo leía a su manera —uno mezclaba las dos, y
 * el que decide si un nodo exige un objeto miraba sólo `config`—, así que dos
 * partes de la aplicación podían creer cosas distintas del mismo nodo.
 *
 * Mientras existan los dos campos, esta función es el único sitio donde se
 * decide cuál gana. Quitar uno de los dos es trabajo del servidor y es otra
 * conversación; lo que no puede seguir pasando es que cada uno elija por su
 * cuenta.
 */

function comoObjeto(valor: unknown): Record<string, unknown> {
  return valor && typeof valor === 'object' && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : {}
}

export function configDelNodo(stage: PlayerStage | null | undefined): Record<string, unknown> {
  const raw = comoObjeto(stage)

  return {
    ...comoObjeto(raw.config),
    // La del minijuego pisa a la del editor: es la que se le entrega al
    // jugador y la que de verdad se juega.
    ...comoObjeto(comoObjeto(raw.minigame).config),
  }
}

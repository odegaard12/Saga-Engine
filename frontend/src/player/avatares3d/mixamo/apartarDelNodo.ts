/**
 * 24/10 (variante avA, elegida por Óscar): si el cuerpo 3D cae sobre un nodo, se pinta al lado del poste, hacia la
 * cámara y a la derecha, para que el poste no le atraviese ni la moneda le quede encima de la cabeza. Es un salto
 * puntual al entrar o salir de la zona (sin animación) y sólo mueve el DIBUJO: la posición del jugador, su velocidad,
 * el radio del nodo y el saludo de llegada siguen con su punto real.
 *
 * Distancias en px del mapa a su zoom (Mercator × 512·2^zoom: x al este, y al sur), que en el suelo valen lo que un
 * píxel de pantalla sin inclinar. Módulo puro: lo prueba tests/js/apartar_del_nodo.cjs.
 */
export type Punto = { x: number; y: number }

/** A menos de esto del poste, el cuerpo se aparta. */
export const APARTA_PX = 40
/** Para volver a su sitio hay que alejarse un poco más: con el GPS temblando en el borde no salta de un lado a otro. */
export const VUELVE_PX = 48
/** A la derecha del poste (en pantalla) y hacia la cámara. */
export const LADO_PX = 34
export const DELANTE_PX = 30

/** Postes de los nodos que se ven (lat/lon). Lo llena MapSurfaceGL; vacío = nadie se aparta. */
export const postesDeNodos: { lat: number; lon: number }[] = []

/**
 * Dónde pintar el cuerpo: en `avatar` si no está sobre ningún poste, o al lado del más cercano. `rumbo` es el del
 * mapa en radianes; `apartado`, si en el fotograma anterior ya estaba apartado (umbral de salida mayor).
 */
export function apartarDelPoste(
  avatar: Punto,
  postes: readonly Punto[],
  rumbo: number,
  apartado = false
): { punto: Punto; apartado: boolean } {
  const umbral = apartado ? VUELVE_PX : APARTA_PX
  let mejor: Punto | null = null
  let dMejor = umbral
  for (const p of postes) {
    const d = Math.hypot(avatar.x - p.x, avatar.y - p.y)
    if (d <= dMejor) {
      dMejor = d
      mejor = p
    }
  }
  if (!mejor) return { punto: avatar, apartado: false }
  // Derecha de la pantalla = (cos, sin); hacia la cámara (abajo en pantalla) = (-sin, cos).
  const s = Math.sin(rumbo)
  const c = Math.cos(rumbo)
  return {
    punto: { x: mejor.x + LADO_PX * c - DELANTE_PX * s, y: mejor.y + LADO_PX * s + DELANTE_PX * c },
    apartado: true,
  }
}

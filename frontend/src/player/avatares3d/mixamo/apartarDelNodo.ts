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
 * 20/11 (QA: «girado 170°, quedan detrás del poste y del cubo»): el lado de la cámara se mide por CUADRANTES (0, 90,
 * 180 o 270°), no con el rumbo exacto: girar un poco no mueve a nadie (antes, con el rumbo exacto, los cuerpos «daban
 * vueltas» al nodo) y, al pasar la cámara a otro cuadrante, cambian de lado UNA vez y quedan delante del poste.
 * Lo fija MapSurfaceGL con el mismo rumbo con el que reparte a los jugadores (`planDeJugadores`).
 */
export const rumboDelReparto = { grados: 0 }
/** Margen para cambiar de cuadrante: con el giro temblando en el borde (45°) no va y viene. */
export const HISTERESIS_CUADRANTE_GRADOS = 10

/** El cuadrante de la cámara (0, 90, 180 o 270) para el rumbo del mapa `grados`, sin soltar `previo` hasta pasar el margen. */
export function cuadranteDeLaCamara(grados: number, previo = 0): number {
  const norma = (g: number) => ((g % 360) + 360) % 360
  const lejos = Math.abs(((norma(grados) - previo + 540) % 360) - 180)
  if (lejos <= 45 + HISTERESIS_CUADRANTE_GRADOS) return previo
  return norma(Math.round(norma(grados) / 90) * 90)
}

/**
 * Dónde pintar el cuerpo: en `avatar` si no está sobre ningún poste, o al lado del más cercano. `rumbo` es el del
 * mapa en radianes; `apartado`, si en el fotograma anterior ya estaba apartado (umbral de salida mayor).
 *
 * 20/11 (QA: «acaban pisándose sobre la base del nodo»): antes todos los que caían cerca del poste iban al MISMO punto.
 * Ahora cada uno se traslada lo mismo (al lado del poste) conservando su separación con los demás; lo que tuviera
 * hacia el poste se refleja hacia fuera, así nadie vuelve a caer encima de él.
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
  const lado = { x: LADO_PX * c - DELANTE_PX * s, y: LADO_PX * s + DELANTE_PX * c }
  const largo = Math.hypot(lado.x, lado.y)
  const d = { x: avatar.x - mejor.x, y: avatar.y - mejor.y }
  const haciaElPoste = Math.min(0, (d.x * lado.x + d.y * lado.y) / largo)
  return {
    punto: {
      x: mejor.x + lado.x + d.x - (2 * haciaElPoste * lado.x) / largo,
      y: mejor.y + lado.y + d.y - (2 * haciaElPoste * lado.y) / largo,
    },
    apartado: true,
  }
}

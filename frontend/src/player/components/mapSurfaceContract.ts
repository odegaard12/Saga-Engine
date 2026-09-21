import type {
  FieldProof,
  PlayerGpsStatus,
  PlayerProfile,
  PlayerStage,
  TeamProfileLiveStatus,
} from '../../types/player'

/**
 * El contrato que comparten los DOS motores de mapa.
 *
 * Mientras dure la migración a WebGL hay dos componentes dibujando el
 * mismo mapa -`MapSurface.tsx` (Leaflet, el que juega la gente) y
 * `MapSurfaceGL.tsx` (MapLibre, el nuevo)-. Sin un contrato común, en
 * cuanto uno de los dos gane una prop el otro se queda atrás en silencio
 * y la comparación deja de ser justa: parecería que al nuevo le faltan
 * cosas cuando lo que pasa es que ni siquiera se las están pasando.
 *
 * Con esto, añadir una prop obliga a mirarlos a los dos.
 *
 * `MapSurfaceProps` (Leaflet) queda declarado en su propio fichero por
 * ahora; este de aquí es el subconjunto que el motor nuevo ya acepta, y
 * va creciendo a medida que se portan capas. Cuando estén igualados, los
 * dos leerán este mismo tipo.
 */

export type FocusRequestTargetGL = 'player' | 'node' | 'route'

export interface FocusRequestGL {
  target: FocusRequestTargetGL
  token: number
}

/** Lo que el motor WebGL ya sabe pintar. Crece por capas. */
export type MapSurfacePropsGL = {
  currentStage: PlayerStage | null
  missionStages?: PlayerStage[]
  /** Nodos por debajo de este índice están hechos. Decide el color del alfiler. */
  currentLevel?: number
  className?: string
  playerPosition?: { lat: number; lon: number } | null
  initialCenter?: { lat: number; lon: number }
  /**
   * Cámara inclinada (relieve) o plana.
   *
   * Lo decide quien dibuja el HUD, no el mapa: el botón vive en la fila de
   * iconos con los demás. Un botón suelto flotando sobre el mapa por su
   * cuenta era exactamente lo que se veía descolgado del diseño.
   */
  tresD?: boolean
  /** Fotos de campo sobre el mapa. */
  fieldProofs?: FieldProof[]
  /** Se abre el visor al tocar una foto. */
  onOpenFieldProofs?: (proofs: FieldProof[]) => void
  /**
   * Tu ficha: foto, color e iniciales.
   *
   * Sin esto tu posición sale como la chincheta por defecto de la
   * librería, indistinguible de un nodo. En una app donde lo que buscas en
   * el mapa es "dónde estoy yo", eso es un fallo de lectura, no un detalle
   * estético.
   */
  selfProfile?: Partial<PlayerProfile & TeamProfileLiveStatus> & {
    user?: string
    display_name?: string
  }
  /**
   * Se llama UNA vez, cuando el mapa ha terminado de pintar la primera
   * vista: estilo montado, teselas e imágenes cargadas, relieve construido.
   *
   * Es lo que permite que la pantalla de carga no se retire hasta que el
   * mapa esté de verdad: sin esto, el velo se iba y el trabajo de
   * decodificar y levantar el terreno caía encima del jugador mientras se
   * movía.
   */
  onListo?: () => void
}

/**
 * Lo que TODAVÍA no pinta el motor nuevo, escrito para que no se olvide.
 *
 * Cada línea es una capa por portar; se va borrando conforme caen. Cuando
 * esta lista quede vacía, el motor nuevo puede pasar a ser el de por
 * defecto -y no antes-.
 */
export type CapasPendentesGL = {
  /** Avatares del resto del grupo, con agrupación cuando se juntan. */
  grupo: TeamProfileLiveStatus[]
  /** Estado del GPS y el aura de precisión. */
  gps: PlayerGpsStatus
  /** Cono de orientación (brújula). */
  conoDeOrientacion: true
  /** Los tres encuadres: seguirme, ver el nodo, ver toda la ruta. */
  encuadres: FocusRequestGL
  /** Modo depuración: tocar el mapa para moverse. */
  depuracion: true
  /** Aviso de teselas servidas desde la caché sin cobertura. */
  avisoSenCobertura: true
}

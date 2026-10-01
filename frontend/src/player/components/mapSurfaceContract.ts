import type {
  FieldProof,
  PlayerGpsStatus,
  PlayerProfile,
  PlayerStage,
  TeamProfileLiveStatus,
} from '../../types/player'

/**
 * Las props del mapa del jugador (`MapSurfaceGL.tsx`, MapLibre).
 *
 * Es el ÚNICO mapa del jugador: el de Leaflet se retiró, sea cual sea el
 * `map_engine` de la misión (la clave se sigue leyendo sin efecto, por las
 * configuraciones antiguas). Leaflet queda sólo en el mapa de administración.
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
  /** Precisión del GPS en metros: el rumbo del muñeco ignora el ruido por debajo de ella. */
  gpsAccuracy?: number | null
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
  /** Los tres encuadres: seguirme, ver el nodo, ver toda la ruta. Siempre con el norte arriba. */
  focusRequest?: FocusRequestGL | null
  /** La cámara sigue al jugador mientras nadie toque el mapa. */
  followPlayer?: boolean
  /** El jugador ha movido el mapa con la mano: quien siga, que deje de seguir. */
  onUserMapMove?: () => void
  /** Rumbo del mapa en grados (0 = norte arriba). Para girar la aguja de la barra. */
  onRumbo?: (rumbo: number) => void
  /** Estado del GPS: con `ready`/`stale` se dibuja el aura de precisión alrededor de ti. */
  gpsState?: PlayerGpsStatus
  /** Modo prueba: tocar el mapa coloca al jugador ahí (`onDebugSetPosition`). */
  debugSimulation?: boolean
  onDebugSetPosition?: (position: { lat: number; lon: number }) => void
  /** Toque sobre el nodo actual (o su radio de entrada). */
  onNodeTap?: () => void
  /** El resto del grupo, con agrupación cuando se juntan. */
  otherPlayers?: TeamProfileLiveStatus[]
}

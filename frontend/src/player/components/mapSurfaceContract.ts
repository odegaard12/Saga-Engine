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
}

/**
 * Lo que TODAVÍA no pinta el motor nuevo, escrito para que no se olvide.
 *
 * Cada línea es una capa por portar; se va borrando conforme caen. Cuando
 * esta lista quede vacía, el motor nuevo puede pasar a ser el de por
 * defecto -y no antes-.
 */
export type CapasPendentesGL = {
  /**
   * Trazado por CAMINOS reales.
   *
   * Probado en el móvil con línea recta de nodo a nodo y descartado: no
   * es "el trazado a medias", es información falsa -cruza el monte por
   * donde no se puede andar, y quien la mire caminando se fía-. Hasta que
   * siga caminos, el motor nuevo no pinta ninguna ruta.
   */
  trazadoPorCamiños: true
  /** Avatares del resto del grupo, con agrupación cuando se juntan. */
  grupo: TeamProfileLiveStatus[]
  /** Fotos de campo sobre el mapa. */
  fotos: FieldProof[]
  /** Estado del GPS y el aura de precisión. */
  gps: PlayerGpsStatus
  /** Cono de orientación (brújula). */
  conoDeOrientacion: true
  /** Perfil propio: foto, color, iniciales. */
  perfilPropio: Partial<PlayerProfile & TeamProfileLiveStatus>
  /** Los tres encuadres: seguirme, ver el nodo, ver toda la ruta. */
  encuadres: FocusRequestGL
  /** Modo depuración: tocar el mapa para moverse. */
  depuracion: true
  /** Aviso de teselas servidas desde la caché sin cobertura. */
  avisoSenCobertura: true
}

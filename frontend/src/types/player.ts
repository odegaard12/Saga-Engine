export type PlayerMode = 'solo' | 'team'
export type PlayerGpsStatus = 'ready' | 'unavailable' | 'stale' | 'searching' | 'error' | string

export interface PlayerProfile {
  id: string
  display_name: string
  mode: PlayerMode
  members?: string[]
  status?: string
  color?: string
  avatar_url?: string
  avatar_ref?: string
  avatar_initials?: string
  /** Personaje del mapa (ver player/avatares/personajes.ts). */
  character?: string
  /** `true` si lo eligió el jugador; `false` = es el que le toca por defecto. */
  character_chosen?: boolean
  /** La configuración entera del avatar (`{ character, parts }`); ver player/avatares/avatarConfig.ts. */
  avatar?: unknown
}

export interface StageLocation {
  lat: number
  lon: number
  radius: number
}

export interface StageEntryRules {
  mode?: 'gps' | 'free'
  require_proximity?: boolean
  allow_debug_bypass?: boolean
  allow_manual_fallback_without_gps?: boolean
}

export interface StageMessages {
  hint?: string
  gps_unavailable?: string
  locked?: string
  [key: string]: string | undefined
}

export interface StageConfig {
  [key: string]: unknown
}
export interface StageMinigameRuntime {
  type: string
  label?: string
  version?: string
  config?: StageConfig
}

export interface PlayerStage {
  id?: number | string
  title: string
  lat: number
  lon: number
  radius: number
  type?: string
  content?: string
  intro_title?: string
  intro_body?: string
  /**
   * Forma del nodo en el mapa 3D: 'checkpoint' | 'mapa_mudo' | 'qr' |
   * 'coleccionable' | 'minijuego' (ver `kind_del_nodo` en el backend).
   * Un nodo "mapa mudo" activo es el único kind cuyo lat/lon/radius NO son
   * el punto real -ver `project_stage_for_player`-, así que el mapa y el HUD
   * lo miran para decidir qué ocultar y qué pista mostrar.
   */
  kind?: string
  config?: StageConfig
  minigame?: StageMinigameRuntime
  entry?: StageEntryRules
  messages?: StageMessages
  /**
   * El objeto de regalo al superar el minijuego (`reward_item_*` del editor),
   * ya normalizado por el servidor. Ver `read_stage_reward` en core_engine.py.
   */
  reward?: StageReward
}

export interface StageReward {
  item_id: string
  label?: string
  quantity?: number
  message?: string
}

export interface PlayerLiveStatus {
  user?: string
  display_name?: string
  session_mode?: PlayerMode | string
  members?: string[]
  status?: string
  presence?: string
  last_seen?: number
  gps_status?: PlayerGpsStatus
  lat?: number | null
  lon?: number | null
  source?: string
  debug_enabled?: boolean
  color?: string
  avatar_url?: string
  avatar_ref?: string
  avatar_initials?: string
  character?: string
  character_chosen?: boolean
  /** La configuración entera del avatar (`{ character, parts }`). */
  avatar?: unknown
  level?: number
  finished?: boolean
  total_nodes?: number
  total_time_ms?: number
  /**
   * Hora en que terminó (ms desde la época; null mientras juega). La pone el
   * servidor y no cambia: desempata la clasificación a igual tiempo.
   */
  finished_at?: number | string | null
  is_playing?: boolean
}

/** Una regla del vestuario: «cuando pase esto → recibes estas piezas». */
export interface ReglaDeDesbloqueo {
  id: string
  cuando: { tipo: string; nodo?: string; n?: number; km?: number }
  /** Claves de catálogo: `item:casco`, `ropa:15`, `hair:7`, `gesto:ge__clapping`, `mx:Ch01`. */
  da: string[]
  /** La regla en castellano llano («Completa 3 nodos»). */
  texto: string
}

/** `GET /api/desbloqueos/{user}` (y `desbloqueos` dentro de `/api/game`). */
export interface DesbloqueosDelJugador {
  status: 'ok'
  /** Interruptor global de la misión. Apagado: todo libre. */
  activos: boolean
  revision: number
  libres: string[]
  bloqueados: string[]
  /** Lo ganado y vigente (para siempre, por jugador). */
  mios: string[]
  /** Ganado y aún sin ver (punto rojo). Se marca con `POST /api/desbloqueos/visto`. */
  nuevos: string[]
  reglas: ReglaDeDesbloqueo[]
  progreso: Record<string, { actual: number; meta: number }>
  /** «Se consigue: …» de cada pieza bloqueada. */
  pistas: Record<string, string>
  /** Avisos pendientes (p. ej. una pieza que llevabas pasó a bloqueada y se cambió sola). */
  avisos: { id: number; tipo: string; texto: string; claves: string[]; creado_ms: number }[]
}

export interface TeamProfileLiveStatus extends PlayerLiveStatus {
  user: string
  display_name: string
  is_self?: boolean
  /** Hacia dónde mira su muñeco (grados, 0 = norte) según SU móvil; sólo si lo mandó hace poco. */
  heading?: number | null
}

export interface TeamStatusPayload {
  status: 'ok'
  user: string
  profiles: TeamProfileLiveStatus[]
  /** Cuántos nodos tiene la misión. */
  total_nodes?: number
}

export interface PlayerGamePayload {
  user: string
  display_name?: string
  mode?: PlayerMode
  session_mode?: PlayerMode
  members?: string[]
  profile?: PlayerProfile
  live_status?: PlayerLiveStatus
  level: number
  finished: boolean
  stages: PlayerStage[]
  /**
   * Huella del contenido de la misión.
   *
   * Mientras no cambie, los nodos que ya tiene el móvil siguen valiendo y no
   * hace falta volver a bajarlos. Ver `pedirPartida` en offline/missionSync.ts.
   */
  stages_rev?: string
  /**
   * Revisión de la misión (contrato 5): cambia con los nodos, con lo que el
   * servidor proyecta a ESTE jugador y con la configuración. La pantalla de carga
   * la compara con la del paquete guardado para saber si hay que volver a bajar
   * la misión. Ver `offline/revisiones.ts`.
   */
  mission_revision?: string
  /** La respuesta trae los nodos enteros, no sólo el título y las coordenadas. */
  offline_pack?: boolean
  /**
   * Vestuario desbloqueable (contrato en backend/app/runtime/desbloqueos.py).
   * Viaja en el paquete de la misión, así la tienda lo tiene sin cobertura.
   */
  desbloqueos?: DesbloqueosDelJugador
  current_stage: PlayerStage | null
  inventory_snapshot?: any
}

export interface PublicConfig {
  site_name?: string
  admin_title?: string
  admin_subtitle?: string
  ui_lang?: string
  player_theme?: string
  /**
   * Obsoleto: el mapa del jugador es siempre el 3D (MapLibre). Se sigue
   * recibiendo por las configuraciones antiguas, pero ya no elige nada.
   */
  map_engine?: string
  story_title?: string
  story_text?: string
  prologue_title?: string
  prologue_subtitle?: string
  prologue_body?: string
  map_center?: [number, number]
  map_zoom?: number
  mapbox_token?: string
  mapbox_style?: string
  players?: string[]
  player_profiles?: PlayerProfile[]
  /** La misión pide contraseña de grupo. Si es true y no llega `player_profiles`,
   *  hay que desbloquear con `unlockMission` antes de mostrar la lista. */
  mission_pass_required?: boolean
  /** false = hay clave y este móvil aún no la ha tecleado (sin lista de jugadores). */
  mission_unlocked?: boolean
  /** Fecha (ISO) desde la que se puede completar un nodo. Vacío = sin bloqueo. */
  mission_launch_at?: string
  /** Reloj del SERVIDOR, en ms — para la cuenta atrás no vale fiarse del móvil. */
  server_time_ms?: number
  /** Revisión de la misión (contrato 5). Mismo valor que en `/api/game/{user}`. */
  /** Huella de la red de caminos del servidor ("" si no hay). */
  road_graph_version?: string
  /** Huella del relieve y los edificios preparados en el panel (`?v=` de /dem-tiles y /api/edificios). */
  mapa3d_version?: string
  mission_revision?: string
}

export interface FieldProof {
  id: string
  user: string
  display_name?: string
  stage_id?: string
  stage_title?: string
  lat: number
  lon: number
  note?: string
  image_url: string
  thumbnail_url?: string
  media_type?: string
  created_at: number
  visibility?: string
  status?: string
}

export interface FieldProofsPayload {
  status: 'ok'
  proofs: FieldProof[]
}

export interface FieldProofUploadResponse {
  status: 'ok'
  proof: FieldProof
}

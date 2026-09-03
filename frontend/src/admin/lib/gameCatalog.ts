// eslint-disable-next-line @typescript-eslint/no-unused-vars
import {
  getAdminFamilyIcon,
  getAdminFamilyLabel,
  getDefaultAdminConfigForFamily,
  type FamilyId,
} from './familyConfigs'

export type AdminGameId =
  | 'simple_checkpoint'
  // El game_id real de motion_challenge. Antes era 'shake_antenna_charge' -
  // colisionaba con la migración legacy de abajo, así que un nodo
  // motion_challenge acababa mostrando un puzle de circuitos-. Renombrado,
  // ver motionChallenge/definition.ts.
  | 'shake_charge'
  | 'bearing_hunt'
  // Marca legacy: misiones de antes de que existiera circuit_matrix. NO es
  // el game_id de ningún juego actual -runtime-bridge.ts (jugador) y
  // getAdminGameForStage (aquí abajo) la redirigen las dos a logic_circuit-.
  // Se mantiene el tipo por si alguna misión vieja de verdad la sigue
  // usando; no tiene entrada propia en adminGameCatalog a propósito.
  | 'shake_antenna_charge'
  | 'logic_circuit'
  | 'sequence_code'
  | 'place_mosaic'
  | 'tilt_maze'
  | 'spark_radar'
  | 'qr_collectible'
  | 'qr_key_gate'
  | 'clue_card'
  | 'photo_scout'
  | 'team_relay'
  | 'manual_password'
  | 'bonus_cache'
  | 'audio_challenge'

export type AdminGameRuntimeStatus = 'runtime_ready' | 'runtime_partial' | 'preset_only' | 'planned'
export type AdminGameOfflineStatus = 'offline_ready' | 'offline_partial' | 'offline_planned'
export type AdminGameCompletionMethod =
  | 'proximity'
  | 'hold'
  | 'bearing'
  | 'puzzle'
  | 'manual_code'
  | 'sequence'
  | 'qr_complete'
  | 'photo'
  | 'inventory_only'
  | 'team'
  | 'motion'

export type MissionTemplateId = 'qr_route' | 'clue_hunt' | 'urban_escape' | 'family_gymkhana'

export type AdminGameCatalogItem = {
  id: AdminGameId
  title: string
  icon: string
  family: FamilyId
  category: 'gps' | 'compass' | 'logic' | 'physical' | 'photo' | 'team' | 'motion'
  difficulty: 'Fácil' | 'Media' | 'Alta'
  duration: string
  runtimeStatus: AdminGameRuntimeStatus
  offlineStatus: AdminGameOfflineStatus
  completionMethod: AdminGameCompletionMethod
  offlineNote: string
  summary: string
  playerGoal: string
  editorHint: string
  config: Record<string, unknown>
  content: string
  messages: {
    hint: string
    gps_unavailable: string
    locked: string
  }
}

export type MissionTemplateStage = {
  gameId: AdminGameId
  title: string
  content: string
  radius?: number
  offsetLat: number
  offsetLon: number
  physicalKind?: 'collectible' | 'requirement' | 'clue' | 'bonus'
  itemLabel?: string
  requiresPreviousItem?: boolean
}

export type MissionTemplate = {
  id: MissionTemplateId
  title: string
  icon: string
  summary: string
  goodFor: string
  stages: MissionTemplateStage[]
}

export const adminGameCatalog: AdminGameCatalogItem[] = [
  {
    id: 'simple_checkpoint',
    title: 'Checkpoint / Texto Rápido',
    icon: '📍',
    family: 'signal_hunt',
    category: 'gps',
    difficulty: 'Fácil',
    duration: '1 min',
    runtimeStatus: 'runtime_ready',
    offlineStatus: 'offline_ready',
    completionMethod: 'proximity',
    offlineNote: 'Solo requiere llegar a las coordenadas GPS.',
    summary: 'Nodo básico de control. El jugador llega al punto y lee el texto o pista.',
    playerGoal: 'Llega al punto de control para avanzar en la ruta.',
    editorHint: 'Ideal para inicio de ruta, puntos intermedios y revelación de historia.',
    config: {
      game_id: 'simple_checkpoint',
      objective: 'checkpoint',
      completion_method: 'proximity',
    },
    content: 'Punto de control alcanzado. Lee la información antes de continuar.',
    messages: {
      hint: 'Revisa las coordenadas en el mapa.',
      gps_unavailable: 'Sin cobertura GPS.',
      locked: 'Acércate al punto para continuar.',
    },
  },
  {
    id: 'logic_circuit',
    title: 'Matriz de circuitos',
    icon: '🧩',
    family: 'circuit_matrix',
    category: 'logic',
    difficulty: 'Media',
    duration: '4-7 min',
    runtimeStatus: 'runtime_ready',
    offlineStatus: 'offline_ready',
    completionMethod: 'puzzle',
    offlineNote: 'Funciona completamente en local y sincroniza el resultado después.',
    summary: 'Juego táctil de reparar una ruta de energía en una matriz.',
    playerGoal: 'Memorizar una ruta y repetirla en el orden exacto.',
    editorHint: 'Úsalo cuando quieras un descanso mental entre puntos GPS.',
    config: {
      objective: 'path_restore',
      completion_method: 'puzzle',
      grid_cols: 5,
      grid_rows: 5,
      difficulty: 'normal',
      max_errors: 3,
      preview_cell_ms: 460,
      path_length: 11,
      seed: '',
      pattern_mode: 'random_each_game',
      path_cells: [],
      game_id: 'logic_circuit',
    },
    content: 'Memoriza la ruta de energía y repítela en el mismo orden.',
    messages: {
      hint: 'Memoriza la secuencia. Después repítela sin guía.',
      gps_unavailable: 'Este reto puede jugarse sin GPS si el nodo ya está abierto.',
      locked: 'Completa el circuito para continuar.',
    },
  },
  {
    id: 'sequence_code',
    title: 'Simón Dice',
    icon: '🎨',
    family: 'circuit_matrix',
    category: 'logic',
    difficulty: 'Media',
    duration: '2-5 min',
    runtimeStatus: 'runtime_ready',
    offlineStatus: 'offline_ready',
    completionMethod: 'sequence',
    offlineNote: 'Funciona completamente en local y sincroniza el resultado al recuperar conexión.',
    summary:
      'Memoriza y repite la secuencia de cuadrados de colores.',
    playerGoal: 'Memorizar la secuencia de colores y repetirla sin fallar.',
    editorHint:
      'Ajusta niveles, número de colores y velocidad. La vista previa enseña el patrón real.',
    config: {
      objective: 'sequence_order',
      game_id: 'sequence_code',
      completion_method: 'sequence',
      levels: 5,
      pad_count: 4,
      step_ms: 620,
      sound_enabled: true,
      seed: 'saga-simon',
    },
    content: 'Memoriza la secuencia de colores y repítela. Cada nivel añade un color más.',
    messages: {
      hint: 'Si fallas vuelves al nivel 1, pero la secuencia es siempre la misma.',
      gps_unavailable: 'Este reto funciona sin GPS cuando el nodo está abierto.',
      locked: 'Completa la secuencia para continuar.',
    },
  },
  {
    id: 'place_mosaic',
    title: 'Mosaico del lugar',
    icon: '🖼️',
    family: 'circuit_matrix',
    category: 'photo',
    difficulty: 'Media',
    duration: '3-8 min',
    runtimeStatus: 'runtime_ready',
    offlineStatus: 'offline_ready',
    completionMethod: 'puzzle',
    offlineNote:
      'La fotografía viaja dentro de la misión y el puzle funciona completamente sin conexión.',
    summary: 'Reconstruir una fotografía del lugar real intercambiando sus piezas.',
    playerGoal: 'Observar el entorno, ordenar el mosaico y reconocer un detalle del punto real.',
    editorHint:
      'Sube una fotografía clara del molino, estatua, edificio, piedra o detalle que el jugador tendrá delante.',
    config: {
      objective: 'image_mosaic',
      game_id: 'place_mosaic',
      completion_method: 'puzzle',
      image_data_url: '',
      image_alt: '',
      grid_size: 3,
      grid_cols: 3,
      grid_rows: 3,
      preview_ms: 2500,
      max_moves: 0,
      require_final_question: false,
      final_question: '¿Qué detalle aparece en el lugar real?',
      final_choices: ['Puerta', 'Escudo', 'Campana'],
      final_correct_index: 0,
    },
    content: 'Reconstruye la fotografía observando el lugar real.',
    messages: {
      hint: 'Compara formas, colores y detalles con el elemento que tienes delante.',
      gps_unavailable: 'Este reto puede jugarse sin GPS cuando el nodo ya está abierto.',
      locked: 'Completa el mosaico para continuar.',
    },
  },
  {
    id: 'tilt_maze',
    title: 'Laberinto de equilibrio',
    icon: '🎱',
    family: 'circuit_matrix',
    category: 'motion',
    difficulty: 'Media',
    duration: '2-6 min',
    runtimeStatus: 'runtime_ready',
    offlineStatus: 'offline_ready',
    completionMethod: 'motion',
    offlineNote:
      'El laberinto, los controles táctiles y el sensor funcionan completamente sin conexión.',
    summary: 'Guiar una bola por un laberinto generado automáticamente inclinando el móvil.',
    playerGoal: 'Recoger los objetos, evitar los agujeros y alcanzar la salida.',
    editorHint:
      'Elige tamaño y dificultad. Puedes fijar un laberinto o generar uno nuevo en cada partida.',
    config: {
      objective: 'balance_maze',
      game_id: 'tilt_maze',
      completion_method: 'motion',
      difficulty: 'normal',
      grid_rows: 9,
      grid_cols: 9,
      pattern_mode: 'fixed',
      maze_seed: 'saga-maze',
      time_limit_s: 75,
      lives: 3,
      hole_count: 4,
      collectible_count: 2,
      sensor_enabled: true,
      tilt_threshold: 12,
      step_cooldown_ms: 360,
    },
    content: 'Inclina el móvil o usa los botones para guiar la bola hasta la salida.',
    messages: {
      hint: 'Muévete despacio, recoge los objetos y evita los agujeros.',
      gps_unavailable: 'Este reto funciona sin GPS cuando el nodo está abierto.',
      locked: 'Supera el laberinto para continuar.',
    },
  },
  {
    id: 'spark_radar',
    title: 'Caza-Señales',
    icon: '📡',
    family: 'circuit_matrix',
    category: 'motion',
    difficulty: 'Fácil',
    duration: '1-2 min',
    runtimeStatus: 'runtime_ready',
    offlineStatus: 'offline_ready',
    completionMethod: 'motion',
    offlineNote:
      'Todo ocurre en el móvil: no necesita conexión, ni GPS, ni sensores.',
    summary: 'Radar de reflejos: toca las señales verdes y esquiva los ecos rojos.',
    playerGoal: 'Alcanzar el número de señales antes de que acabe el tiempo.',
    editorHint:
      'Sube el objetivo o baja el tiempo para hacerlo más difícil. Los ecos rojos restan segundos.',
    config: {
      objective: 'spark_radar',
      game_id: 'spark_radar',
      completion_method: 'motion',
      target_hits: 12,
      time_limit_s: 45,
      spawn_interval_ms: 700,
      spark_life_ms: 1600,
      echo_ratio: 0.28,
      echo_penalty_s: 2,
    },
    content: 'Sintoniza el radar y captura las señales buenas antes de que se apaguen.',
    messages: {
      hint: 'Toca sólo las chispas verdes. Las rojas te quitan tiempo.',
      gps_unavailable: 'Este reto funciona sin GPS cuando el nodo está abierto.',
      locked: 'Recupera las señales para continuar.',
    },
  },
  {
    id: 'qr_collectible',
    title: 'Objeto QR',
    icon: '⭐',
    family: 'signal_hunt',
    category: 'physical',
    difficulty: 'Fácil',
    duration: '1-2 min',
    runtimeStatus: 'runtime_ready',
    offlineStatus: 'offline_ready',
    completionMethod: 'inventory_only',
    offlineNote:
      'Crea tarjeta QR en admin, se exporta, el player la lee offline y guarda el objeto en mochila local.',
    summary: 'Tarjeta física opcional que se guarda en la mochila.',
    playerGoal: 'Escanear una tarjeta QR y conservar el objeto.',
    editorHint: 'Úsalo para coleccionables, logros o pistas secundarias.',
    config: {
      objective: 'physical_collectible',
      completion_method: 'inventory_only',
      game_id: 'qr_collectible',
    },
    content: 'Encuentra y escanea la tarjeta QR física.',
    messages: {
      hint: 'Busca una tarjeta o símbolo físico cerca.',
      gps_unavailable: 'Acércate al punto para escanear el QR.',
      locked: 'Necesitas estar en la zona del QR.',
    },
  },
  {
    id: 'qr_key_gate',
    title: 'Llave QR',
    icon: '🔑',
    family: 'signal_hunt',
    category: 'physical',
    difficulty: 'Fácil',
    duration: '1-3 min',
    runtimeStatus: 'runtime_ready',
    offlineStatus: 'offline_ready',
    completionMethod: 'inventory_only',
    offlineNote:
      'Crea llave QR en admin, se exporta, el player la lee offline y guarda la llave para requisitos.',
    summary: 'Objeto QR pensado para abrir otro nodo posterior.',
    playerGoal: 'Conseguir una llave física para desbloquear una prueba.',
    editorHint: 'Úsalo junto con Requisito de entrada en un nodo posterior.',
    config: {
      objective: 'physical_key',
      completion_method: 'inventory_only',
      game_id: 'qr_key_gate',
    },
    content: 'Escanea la llave QR. Podría hacer falta más adelante.',
    messages: {
      hint: 'Busca la llave física.',
      gps_unavailable: 'Activa GPS o usa el modo permitido para abrir el QR.',
      locked: 'Acércate para registrar la llave.',
    },
  },
  {
    id: 'clue_card',
    title: 'Pista QR',
    icon: '🧩',
    family: 'signal_hunt',
    category: 'physical',
    difficulty: 'Fácil',
    duration: '1-2 min',
    runtimeStatus: 'runtime_ready',
    offlineStatus: 'offline_ready',
    completionMethod: 'inventory_only',
    offlineNote:
      'Crea pista QR en admin, se exporta, el player la lee offline y guarda la pista consultable en mochila.',
    summary: 'Tarjeta que entrega información para resolver otro reto.',
    playerGoal: 'Escanear una pista y leer la información.',
    editorHint: 'Ideal para rutas de misterio o escape.',
    config: {
      objective: 'physical_clue',
      completion_method: 'inventory_only',
      game_id: 'clue_card',
    },
    content: 'Escanea la pista y úsala en un nodo posterior.',
    messages: {
      hint: 'La pista no está lejos del punto.',
      gps_unavailable: 'Necesitas abrir el nodo para escanear la pista.',
      locked: 'Acércate para consultar la pista.',
    },
  },
  {
    id: 'photo_scout',
    title: 'Foto de exploración',
    icon: '📷',
    family: 'signal_hunt',
    category: 'photo',
    difficulty: 'Fácil',
    duration: '2-4 min',
    runtimeStatus: 'planned',
    offlineStatus: 'offline_planned',
    completionMethod: 'photo',
    offlineNote:
      'No se ofrece en plantillas jugables todavía: falta completar el flujo de cierre por foto.',
    summary: 'El equipo debe hacer una foto de campo en la zona.',
    playerGoal: 'Capturar una foto compartida en el mapa.',
    editorHint: 'Funciona muy bien con el sistema de fotos de campo.',
    config: { objective: 'photo_proof', completion_method: 'photo', game_id: 'photo_scout' },
    content: 'Haz una foto de campo que demuestre que encontraste la zona.',
    messages: {
      hint: 'Busca un elemento reconocible del entorno.',
      gps_unavailable: 'Necesitas ubicación para anclar la foto al mapa.',
      locked: 'Acércate antes de hacer la foto.',
    },
  },
  {
    id: 'team_relay',
    title: 'Relevo de equipo',
    icon: '👥',
    family: 'signal_hunt',
    category: 'team',
    difficulty: 'Media',
    duration: '5-8 min',
    runtimeStatus: 'runtime_ready',
    // No 'offline_ready': el mecanismo de proximidad depende del latido del
    // servidor (ver 4.9.51 en plan-de-mejora.md), así que necesita cobertura
    // de los dos jugadores a la vez, no solo de uno.
    offlineStatus: 'offline_partial',
    completionMethod: 'team',
    offlineNote:
      'Necesita cobertura de AMBOS jugadores a la vez: cada uno ve al resto por el latido del servidor (cada pocos segundos), no hay nada que funcione sin señal. Si uno de los dos está sin cobertura en el punto de encuentro, el otro no lo detecta como "aquí" aunque esté al lado.',
    summary: 'Prueba pensada para varios jugadores o roles.',
    playerGoal: 'Coordinarse para llegar, registrar prueba o compartir pista.',
    editorHint:
      'Úsalo si quieres que varios jugadores participen. Sube "Compañeros necesarios" si es un grupo grande y quieres que se junten de verdad, no solo dos sueltos.',
    config: {
      objective: 'team_relay',
      source_radius_m: 80,
      lock_threshold: 60,
      hold_ms: 1500,
      required_members: 2,
      game_id: 'team_relay',
    },
    content: 'El equipo debe coordinarse para completar esta parada.',
    messages: {
      hint: 'Reparte roles: mapa, pista y foto.',
      gps_unavailable: 'Al menos un jugador debe tener posición.',
      locked: 'El equipo aún no está listo.',
    },
  },
  {
    id: 'manual_password',
    title: 'Palabra clave',
    icon: '🔐',
    family: 'circuit_matrix',
    category: 'logic',
    difficulty: 'Media',
    duration: '2-5 min',
    runtimeStatus: 'planned',
    offlineStatus: 'offline_planned',
    completionMethod: 'manual_code',
    offlineNote: 'No se ofrece en plantillas jugables todavía: falta validación local de código.',
    summary: 'Resolver una palabra o código a partir de pistas.',
    playerGoal: 'Descubrir una contraseña narrativa.',
    editorHint: 'Bueno para carteles, acertijos y escape urbano.',
    config: {
      objective: 'manual_code',
      completion_method: 'manual_code',
      expected_code: 'SAGA',
      difficulty: 1,
      game_id: 'manual_password',
    },
    content: 'Encuentra la palabra clave y úsala para continuar.',
    messages: {
      hint: 'La palabra está escondida en la escena.',
      gps_unavailable: 'Este reto puede jugarse sin GPS si está desbloqueado.',
      locked: 'La palabra clave no es correcta todavía.',
    },
  },
  {
    id: 'bonus_cache',
    title: 'Bonus oculto',
    icon: '🎁',
    family: 'signal_hunt',
    category: 'physical',
    difficulty: 'Fácil',
    duration: '1-3 min',
    runtimeStatus: 'runtime_ready',
    offlineStatus: 'offline_ready',
    completionMethod: 'inventory_only',
    offlineNote:
      'Crea bonus QR en admin, se exporta, el player lo lee offline y guarda la recompensa en mochila.',
    summary: 'Extra opcional para recompensas, bromas o contenido secreto.',
    playerGoal: 'Encontrar un extra no obligatorio.',
    editorHint: 'Úsalo para dar vida al mapa sin bloquear la ruta.',
    config: {
      objective: 'bonus_cache',
      completion_method: 'inventory_only',
      game_id: 'bonus_cache',
    },
    content: 'Has encontrado un bonus oculto.',
    messages: {
      hint: 'Hay algo extra cerca.',
      gps_unavailable: 'Acércate para registrar el bonus.',
      locked: 'El bonus aún no está a tu alcance.',
    },
  },
  {
    id: 'audio_challenge',
    title: 'Desafío de audio',
    icon: '🎤',
    family: 'audio_challenge',
    category: 'motion',
    difficulty: 'Fácil',
    duration: '2-4 min',
    runtimeStatus: 'runtime_ready',
    offlineStatus: 'offline_ready',
    completionMethod: 'motion',
    offlineNote: 'El micrófono y la validación funcionan offline en local.',
    summary: 'Hacer ruido o soplar en el micrófono para cargar una barra.',
    playerGoal: 'Mantener un nivel de ruido o soplar para cargar la barra.',
    editorHint: 'Asegúrate de que los jugadores puedan usar el micrófono en su dispositivo.',
    config: {
      objective: 'blow_charge',
      game_id: 'audio_challenge',
    },
    content: 'Sopla o haz ruido cerca del micrófono para cargar la energía.',
    messages: {
      hint: 'Sopla suavemente de forma continua para llenar la barra.',
      gps_unavailable: 'Este reto puede jugarse sin GPS si está desbloqueado.',
      locked: 'Carga la barra completamente para continuar.',
    },
  },
  {
    // Familia motion_challenge: existía el motor, la pantalla y hasta el
    // editor sabía construir su config -pero sin entrada en este catálogo
    // nadie podía crear el nodo desde el admin-. Añadido tras auditar
    // shake_antenna_charge (ver el comentario de AdminGameId más arriba).
    id: 'shake_charge',
    title: 'Cargar antena',
    icon: '📳',
    family: 'motion_challenge',
    category: 'motion',
    difficulty: 'Media',
    duration: '1-2 min',
    runtimeStatus: 'runtime_ready',
    offlineStatus: 'offline_ready',
    completionMethod: 'motion',
    offlineNote:
      'El acelerómetro y la validación funcionan offline en local, con reserva táctil si el sensor falla o no existe.',
    summary: 'Sacudir el móvil en pulsos cortos y separados para cargar una antena, sin sobrecalentarla.',
    playerGoal: 'Cargar la antena con pulsos de movimiento cortos, sin pasarse de fuerte.',
    editorHint:
      'Dificultad y tiempo límite se aplican de verdad. El resto de números (energía objetivo, calor, ritmo de carga...) todavía los decide el propio motor del juego, no el editor -pendiente de conectar, no se muestran para no prometer un control que no hay-.',
    config: {
      objective: 'shake_charge',
      game_id: 'shake_charge',
      difficulty: 'normal',
      duration_mode: 'normal',
      penalty_mode: 'normal',
      allow_touch_fallback: true,
      energy_target: 100,
      time_limit_ms: 35000,
      calibration_ms: 1000,
      good_min: 1.2,
      good_max: 3.8,
      overcharge_threshold: 5.4,
      idle_decay: 0.15,
      charge_rate: 2.4,
      stability_min: 35,
      use_vibration: true,
    },
    content: 'Sacude el móvil para cargar la antena. Pulsos cortos, no aporrees.',
    messages: {
      hint: 'Golpes breves y separados. Quieto no carga, muy fuerte sobrecalienta.',
      gps_unavailable: 'Este reto puede jugarse sin GPS si el nodo ya está abierto.',
      locked: 'Carga la antena para continuar.',
    },
  },
  {
    // Familia bearing_hunt: mismo caso que motion_challenge, sin entrada en
    // el catálogo. Auditado antes de añadirla: target_bearing_deg y
    // tolerance_deg NUNCA llegaban al runtime -RuntimeScreen.tsx buscaba
    // 'target_bearing'/'tolerance', no los nombres reales del campo-,
    // arreglado en el mismo commit que esta entrada.
    id: 'bearing_hunt',
    title: 'Caza de rumbo',
    icon: '🧭',
    family: 'bearing_hunt',
    category: 'compass',
    difficulty: 'Media',
    duration: '1-3 min',
    runtimeStatus: 'runtime_ready',
    offlineStatus: 'offline_ready',
    completionMethod: 'bearing',
    offlineNote: 'La brújula del móvil funciona sin conexión; solo hace falta el sensor de orientación.',
    summary: 'Girar el móvil hasta apuntar al rumbo objetivo y mantenerlo unos segundos.',
    playerGoal: 'Girar hasta que la aguja entre en la ventana del rumbo objetivo y aguantar quieto.',
    editorHint:
      'Ajusta el rumbo objetivo (0-359°) y el margen de tolerancia. En iPhone pide permiso de orientación con un toque; si el sensor no responde, hay una prueba manual con deslizador.',
    config: {
      objective: 'single_lock',
      game_id: 'bearing_hunt',
      target_bearing_deg: 270,
      tolerance_deg: 12,
      hold_ms: 1200,
    },
    content: 'Gira el móvil hasta apuntar en la dirección correcta y mantente quieto unos segundos.',
    messages: {
      hint: 'Observa los grados que se muestran: gira hacia el lado que indique.',
      gps_unavailable: 'Este reto no necesita GPS, solo la brújula del móvil.',
      locked: 'Bloquea el rumbo para continuar.',
    },
  },
]

export const missionTemplates: MissionTemplate[] = [
  {
    id: 'qr_route',
    title: 'Ruta QR con llave',
    icon: '🔑',
    summary: 'Juego base listo: ruta GPS, llave QR, nodo bloqueado y bonus opcional.',
    goodFor: 'Primer juego real, rutas cortas, grupos pequeños, pruebas con tarjetas físicas.',
    stages: [
      {
        gameId: 'logic_circuit',
        title: 'Inicio de ruta',
        content: 'Llega al punto inicial y activa la misión.',
        offsetLat: 0,
        offsetLon: 0,
        radius: 55,
      },
      {
        gameId: 'qr_key_gate',
        title: 'Llave del camino',
        content: 'Escanea la llave QR física.',
        offsetLat: 0.00045,
        offsetLon: 0.00028,
        radius: 45,
        physicalKind: 'requirement',
        itemLabel: 'Llave del camino',
      },
      {
        gameId: 'logic_circuit',
        title: 'Puerta bloqueada',
        content: 'Este nodo pide la llave anterior.',
        offsetLat: 0.00088,
        offsetLon: 0.00062,
        radius: 55,
        requiresPreviousItem: true,
      },
      {
        gameId: 'bonus_cache',
        title: 'Bonus final',
        content: 'Extra opcional al terminar la ruta.',
        offsetLat: 0.00118,
        offsetLon: 0.00092,
        radius: 45,
        physicalKind: 'bonus',
        itemLabel: 'Bonus final',
      },
    ],
  },
  {
    id: 'clue_hunt',
    title: 'Ruta de pistas QR',
    icon: '🧩',
    summary: 'Cadena jugable de pistas físicas y búsqueda GPS, sin puzzles pendientes.',
    goodFor: 'Misterio sencillo, historia local, juego familiar, rutas con tarjetas.',
    stages: [
      {
        gameId: 'logic_circuit',
        title: 'Punto de inicio',
        content: 'Llega al punto de salida y abre la primera pista.',
        offsetLat: 0,
        offsetLon: 0,
        radius: 55,
      },
      {
        gameId: 'clue_card',
        title: 'Pista 1',
        content: 'Escanea la primera pista QR.',
        offsetLat: 0.00042,
        offsetLon: -0.0003,
        radius: 45,
        physicalKind: 'clue',
        itemLabel: 'Pista 1',
      },
      {
        gameId: 'logic_circuit',
        title: 'Busca la señal',
        content: 'La señal se hace más fuerte al acercarte.',
        offsetLat: 0.0008,
        offsetLon: -0.00058,
        radius: 55,
      },
      {
        gameId: 'bonus_cache',
        title: 'Recompensa oculta',
        content: 'Encuentra el bonus final.',
        offsetLat: 0.00108,
        offsetLon: -0.00088,
        radius: 45,
        physicalKind: 'bonus',
        itemLabel: 'Recompensa oculta',
      },
    ],
  },
  {
    id: 'urban_escape',
    title: 'Escape QR corto',
    icon: '🔐',
    summary: 'Escape urbano simple con llave física y cierre GPS; evita pruebas aún planificadas.',
    goodFor: 'Cidade, instituto, evento corto, juego con historia sin depender de conexión.',
    stages: [
      {
        gameId: 'logic_circuit',
        title: 'Entrada',
        content: 'Activa el punto de entrada del escape.',
        offsetLat: 0,
        offsetLon: 0,
        radius: 50,
      },
      {
        gameId: 'qr_key_gate',
        title: 'Llave QR',
        content: 'Escanea la llave física para abrir la salida.',
        offsetLat: -0.0004,
        offsetLon: 0.00036,
        radius: 45,
        physicalKind: 'requirement',
        itemLabel: 'Llave QR',
      },
      {
        gameId: 'logic_circuit',
        title: 'Salida bloqueada',
        content: 'Usa la llave anterior y llega al punto de salida.',
        offsetLat: -0.00075,
        offsetLon: 0.00068,
        radius: 55,
        requiresPreviousItem: true,
      },
      {
        gameId: 'clue_card',
        title: 'Epílogo',
        content: 'Escanea la tarjeta final de historia.',
        offsetLat: -0.00105,
        offsetLon: 0.00095,
        radius: 45,
        physicalKind: 'clue',
        itemLabel: 'Epílogo',
      },
    ],
  },
  {
    id: 'family_gymkhana',
    title: 'Gymkhana familiar',
    icon: '🎁',
    summary: 'Ritmo variado con mosaico, lógica, objeto QR y bonus, todo jugable offline.',
    goodFor: 'Niños, familias, grupos pequeños, parques y rutas sencillas.',
    stages: [
      {
        gameId: 'logic_circuit',
        title: 'Punto de salida',
        content: 'Empieza la gymkhana.',
        offsetLat: 0,
        offsetLon: 0,
        radius: 60,
      },
      {
        gameId: 'place_mosaic',
        title: 'Observa el lugar',
        content: 'Reconstruye la imagen usando el elemento real como referencia.',
        offsetLat: 0.00035,
        offsetLon: 0.00035,
        radius: 55,
      },
      {
        gameId: 'qr_collectible',
        title: 'Objeto del equipo',
        content: 'Escanea el objeto QR del equipo.',
        offsetLat: 0.00065,
        offsetLon: 0.0007,
        radius: 45,
        physicalKind: 'collectible',
        itemLabel: 'Objeto del equipo',
      },
      {
        gameId: 'bonus_cache',
        title: 'Regalo oculto',
        content: 'Busca el bonus final.',
        offsetLat: 0.00095,
        offsetLon: 0.00105,
        radius: 45,
        physicalKind: 'bonus',
        itemLabel: 'Regalo oculto',
      },
    ],
  },
]

// Orden con sentido para quien navega la lista -no el orden en que se fue
// añadiendo al catálogo, que es el que usan las funciones de abajo para su
// fallback por familia (getAdminGameForStage) y no debe tocarse: cambiar el
// ORDEN DEL ARRAY podría cambiar A QUÉ JUEGO cae una misión vieja sin
// game_id. Este es solo para mostrar, nunca para resolver identidad.
const ORDEN_DE_CATEGORIA: Record<AdminGameCatalogItem['category'], number> = {
  gps: 0,
  compass: 1,
  logic: 2,
  motion: 3,
  photo: 4,
  physical: 5,
  team: 6,
}

export function sortedByCategoryForDisplay(
  games: AdminGameCatalogItem[]
): AdminGameCatalogItem[] {
  return games
    .slice()
    .sort((a, b) => ORDEN_DE_CATEGORIA[a.category] - ORDEN_DE_CATEGORIA[b.category])
}

export function getAdminGame(gameId?: string | null): AdminGameCatalogItem {
  return adminGameCatalog.find((game) => game.id === gameId) || adminGameCatalog[0]
}

export function getAdminGameForStage(
  type?: string | null,
  config?: Record<string, unknown> | null
): AdminGameCatalogItem {
  const gameId = typeof config?.game_id === 'string' ? config.game_id : ''
  let explicit = adminGameCatalog.find((game) => game.id === gameId)
  if (explicit) return explicit

  explicit = adminGameCatalog.find((game) => game.id === type)
  if (explicit) return explicit

  // Legacy: signal_hunt sin game_id ya no debe caer en QR físico. La misma
  // migración que runtime-bridge.ts hace en el jugador: al puzle de
  // circuitos, no a un catálogo con la etiqueta 'shake_antenna_charge' que
  // nunca existió como preset propio.
  if (type === 'signal_hunt') {
    return adminGameCatalog.find((game) => game.id === 'logic_circuit') || adminGameCatalog[0]
  }

  return (
    adminGameCatalog.find((game) => game.family === type && game.category !== 'physical') ||
    adminGameCatalog.find((game) => game.family === type) ||
    adminGameCatalog[0]
  )
}

export function getMissionTemplateById(templateId: MissionTemplateId): MissionTemplate {
  return missionTemplates.find((template) => template.id === templateId) || missionTemplates[0]
}

export function getDefaultAdminStagePatchForGame(gameId: AdminGameId) {
  const game = getAdminGame(gameId)
  const config: Record<string, unknown> = {
    ...(game.id === 'sequence_code' ? {} : getDefaultAdminConfigForFamily(game.family)),
    ...game.config,
    game_id: game.id,
    game_title: game.title,
  }

  return {
    type: game.family,
    label: game.title,
    icon: getAdminFamilyIcon(game.family),
    objective: String((config as Record<string, unknown>).objective || ''),
    content: game.content,
    config,
    config_summary: Object.keys(config),
    messages: game.messages,
  }
}

export function getRuntimeFamilyCopy(family: FamilyId) {
  return `${getAdminFamilyIcon(family)} ${getAdminFamilyLabel(family)}`
}

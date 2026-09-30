import type { PlayerGamePayload, PlayerStage, PublicConfig } from '../../types/player'

/**
 * Las decisiones de "¿tiene el móvil lo último?", sin red ni almacén.
 *
 * La pantalla de carga hace UNA comprobación al entrar: compara lo que hay en el
 * teléfono con lo último publicado, parte por parte (app, misión, mapa), y sólo
 * baja lo que ha cambiado. Aquí están las cuentas de esa comparación, separadas
 * de lo que descarga: se pueden probar sin navegador y no dependen de que el
 * servidor o el almacén respondan.
 */

/** Lo poco que hace falta saber del paquete guardado. `MissionPack` lo cumple. */
export interface PaqueteGuardado {
  mission_revision?: string
  payload?: Pick<PlayerGamePayload, 'stages' | 'stages_rev' | 'offline_pack'> | null
}

export function limpiarRevision(valor: unknown): string {
  if (typeof valor === 'string') return valor.trim()
  if (typeof valor === 'number' && Number.isFinite(valor)) return String(valor)
  return ''
}

/**
 * La revisión de la misión que dice el servidor ahora mismo.
 *
 * Manda la de `/api/game/{user}` (lleva las proyecciones de ESE jugador) y, si
 * no viene, la de `/api/config`. Vacía = servidor antiguo: quien la usa cae a la
 * huella de los nodos (`stages_rev`).
 */
export function revisionDelServidor(
  ligero?: PlayerGamePayload | null,
  config?: PublicConfig | null
): string {
  return limpiarRevision(ligero?.mission_revision) || limpiarRevision(config?.mission_revision)
}

function comoObjeto(valor: unknown): Record<string, unknown> {
  return valor && typeof valor === 'object' && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : {}
}

/* ------------------------------------------------------------------ *
 * J8: la configuración de respaldo no pisa a la buena
 * ------------------------------------------------------------------ */

/** Las únicas claves de `buildFallbackPublicConfig` (shared/offlinePublicConfig.ts). */
const CLAVES_DEL_RESPALDO = ['site_name', 'story_text', 'players', 'player_profiles']
const TEXTO_DEL_RESPALDO = 'Elige jugador para continuar.'

/**
 * ¿Esta configuración es la de respaldo (o está vacía)?
 *
 * La de respaldo se fabrica cuando `/api/config` no contesta a tiempo. No trae
 * fecha de inicio, ni prólogo, ni tema, ni idioma: guardarla encima de la buena
 * hacía desaparecer la cortina de «aún no toca» antes de hora y se perdían el
 * prólogo y el idioma de la misión hasta la siguiente carga con cobertura.
 */
export function esConfigDeRespaldo(config: PublicConfig | null | undefined): boolean {
  if (!config || typeof config !== 'object') return true
  const claves = Object.keys(config)
  if (claves.length === 0) return true
  const soloLasDelRespaldo = claves.every((clave) => CLAVES_DEL_RESPALDO.includes(clave))
  return soloLasDelRespaldo && String(config.story_text || '') === TEXTO_DEL_RESPALDO
}

/**
 * Qué configuración se guarda: la nueva si es de verdad; si no, la que había.
 * Si no hay ninguna buena, lo que ya estuviera (o nada): el respaldo no se guarda.
 */
export function elegirConfigParaGuardar(
  nueva: PublicConfig | null | undefined,
  previa: PublicConfig | null | undefined
): PublicConfig {
  if (!esConfigDeRespaldo(nueva)) return nueva as PublicConfig
  if (!esConfigDeRespaldo(previa)) return previa as PublicConfig
  // Ninguna es buena. La de respaldo NO se guarda: no dice nada de la misión
  // (ni fecha, ni prólogo, ni tema) y guardarla la haría pasar por suya.
  return (previa && typeof previa === 'object' ? previa : {}) as PublicConfig
}

/**
 * ¿El paquete guardado se puede jugar sin cobertura?
 *
 * Un paquete "ligero" (sólo título y coordenadas de cada nodo) parece un paquete
 * pero no trae el minijuego ni el código que acepta: sin red, el nodo no carga.
 * Y un nodo con foto por URL sin la foto dentro no abre su mosaico.
 */
export function paqueteCompleto(pack?: PaqueteGuardado | null): {
  completo: boolean
  motivo: 'ok' | 'sin_paquete' | 'sin_nodos' | 'ligero' | 'falta_foto'
} {
  if (!pack || !pack.payload) return { completo: false, motivo: 'sin_paquete' }

  const nodos = pack.payload.stages
  if (!Array.isArray(nodos) || nodos.length === 0) return { completo: false, motivo: 'sin_nodos' }

  for (const nodo of nodos) {
    const registro = comoObjeto(nodo)
    // El contenido jugable trae siempre `success`; el nodo ligero, nunca.
    if (!('success' in registro)) return { completo: false, motivo: 'ligero' }

    const config = comoObjeto(registro.config)
    const minijuego = comoObjeto(registro.minigame)
    const configMinijuego = comoObjeto(minijuego.config)
    for (const c of [config, configMinijuego]) {
      const url = typeof c.image_url === 'string' ? c.image_url : ''
      const dentro = typeof c.image_data_url === 'string' ? c.image_data_url : ''
      if (url && !dentro) return { completo: false, motivo: 'falta_foto' }
    }
  }

  return { completo: true, motivo: 'ok' }
}

/**
 * ¿Los nodos guardados siguen valiendo frente a lo que dice el servidor?
 *
 * `revision` es la del servidor (vacía si no la da). Con revisión manda ella: es
 * la que cambia también cuando cambia lo que el servidor proyecta a este jugador
 * sin tocar ningún nodo. Sin ella, la huella de los nodos, como siempre. Sin
 * ninguna de las dos no se puede saber, y quedarse con nodos viejos en silencio
 * es justo el fallo que esto viene a evitar: no sirve.
 */
export function paqueteSirve(args: {
  pack?: PaqueteGuardado | null
  ligero?: Pick<PlayerGamePayload, 'stages' | 'stages_rev'> | null
  revision: string
}): boolean {
  const nodos = args.pack?.payload?.stages
  if (!Array.isArray(nodos) || nodos.length === 0) return false

  const delServidor = args.ligero?.stages
  if (Array.isArray(delServidor) && delServidor.length !== nodos.length) return false

  if (args.revision) {
    return limpiarRevision(args.pack?.mission_revision) === args.revision
  }

  const huellaServidor = args.ligero?.stages_rev
  const huellaGuardada = args.pack?.payload?.stages_rev
  if (!huellaServidor || !huellaGuardada) return false
  return huellaServidor === huellaGuardada
}

export type MotivoDeMision = 'primera_vez' | 'mision_cambiada' | 'incompleto'

export interface EvaluacionDeMision {
  estado: 'ok' | 'falta' | 'cambio' | 'incompleto'
  motivo: MotivoDeMision | null
  /** La revisión del servidor con la que se comparó (vacía si no la dio). */
  revision: string
}

/** Parte «Misión»: el paquete de nodos del jugador, con sus fotos. */
export function evaluarMision(args: {
  pack?: (PaqueteGuardado & { config?: unknown }) | null
  ligero?: PlayerGamePayload | null
  config?: PublicConfig | null
}): EvaluacionDeMision {
  const revision = revisionDelServidor(args.ligero, args.config)

  if (!args.pack || !args.pack.payload) {
    return { estado: 'falta', motivo: 'primera_vez', revision }
  }

  if (!paqueteCompleto(args.pack).completo) {
    return { estado: 'incompleto', motivo: 'incompleto', revision }
  }

  if (!paqueteSirve({ pack: args.pack, ligero: args.ligero, revision })) {
    return { estado: 'cambio', motivo: 'mision_cambiada', revision }
  }

  return { estado: 'ok', motivo: null, revision }
}

/** Lo que la comprobación necesita saber del resumen del mapa guardado. */
export interface ResumenDeMapaGuardado {
  /** Firma del plan (qué capas lleva el paquete). */
  firma?: string
  /** Firma de la ruta (dónde están los nodos) con la que se bajó. */
  firma_ruta?: string
  /** Cada tesela planificada estaba guardada (o no existe en el origen). */
  completo?: boolean
}

export type MotivoDeMapa = 'primera_vez' | 'ruta_cambiada' | 'incompleto'

export interface EvaluacionDeMapa {
  estado: 'ok' | 'falta' | 'cambio' | 'incompleto'
  motivo: MotivoDeMapa | null
}

/**
 * Parte «Mapa», primera mirada: sólo con el resumen guardado, sin tocar la caché.
 *
 * `ok` aquí quiere decir «el resumen no ve nada que hacer»; quien llama todavía
 * comprueba unas cuantas teselas de verdad, por si el navegador vació la caché
 * sin avisar (iOS lo hace) y el resumen sigue diciendo que está todo.
 */
export function evaluarMapaPorResumen(args: {
  resumen: ResumenDeMapaGuardado | null
  firmaRutaActual: string
}): EvaluacionDeMapa {
  const { resumen, firmaRutaActual } = args

  if (!resumen) return { estado: 'falta', motivo: 'primera_vez' }
  // La ruta cambió (un nodo movido o añadido): hay teselas que ya no valen y
  // otras que faltan. Sin firma de ruta guardada (resumen de antes de esto) se
  // trata igual: no se sabe con qué ruta se hizo.
  if (!resumen.firma_ruta || resumen.firma_ruta !== firmaRutaActual) {
    return { estado: 'cambio', motivo: 'ruta_cambiada' }
  }
  if (!resumen.completo) return { estado: 'incompleto', motivo: 'incompleto' }
  return { estado: 'ok', motivo: null }
}

/**
 * Qué teselas mirar para fiarse del resumen: unas pocas repartidas por toda la
 * lista (ni las primeras ni las últimas solas). Determinista.
 */
export function muestraDeTeselas(urls: string[], cuantas = 24): string[] {
  if (urls.length <= cuantas) return [...urls]
  const salida: string[] = []
  const paso = urls.length / cuantas
  for (let i = 0; i < cuantas; i += 1) {
    salida.push(urls[Math.min(urls.length - 1, Math.floor(i * paso))])
  }
  // Las últimas de la lista son el detalle de los nodos: se miran siempre.
  const ultima = urls[urls.length - 1]
  if (!salida.includes(ultima)) salida[salida.length - 1] = ultima
  return salida
}

/**
 * Firma de la ruta: cambia si se mueve o se añade un nodo, y sólo entonces.
 *
 * Mismos puntos que usa el plan de teselas. Con cinco decimales (~1 m) un nodo
 * movido cambia la firma, y el ruido de coma flotante no.
 */
export function firmaDePuntos(puntos: Array<{ lat: number; lon: number }>): string {
  let hash = 0x811c9dc5
  const texto = puntos.map((p) => `${p.lat.toFixed(5)},${p.lon.toFixed(5)}`).join(';')
  for (let i = 0; i < texto.length; i += 1) {
    hash ^= texto.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return `${hash.toString(16).padStart(8, '0')}:${puntos.length}`
}

/** Un nodo sin coordenadas válidas no cuenta para el mapa. */
export function nodosConCoordenadas(stages: PlayerStage[] | undefined | null): PlayerStage[] {
  return (stages || []).filter(
    (nodo) => typeof nodo?.lat === 'number' && typeof nodo?.lon === 'number'
  )
}

/* ------------------------------------------------------------------ *
 * Sin cobertura: lo guardado, ¿está entero y al día?
 * ------------------------------------------------------------------ */

/** Cuánto puede tener el paquete guardado antes de avisar de que es viejo. */
export const EDAD_MAXIMA_DEL_PAQUETE_MS = 3 * 24 * 60 * 60 * 1000

export interface EstadoDeLoGuardado {
  /** No hay paquete de este jugador en el móvil. */
  sinPaquete: boolean
  /** Hay paquete, pero le falta contenido (nodos ligeros, fotos). */
  paqueteIncompleto: boolean
  /** Hay paquete, pero es más viejo que el máximo. */
  paqueteViejo: boolean
  /** Edad del paquete en días enteros (0 si no se sabe). */
  edadDias: number
  /** Faltan archivos de la aplicación. 0 = todo guardado. */
  archivosDeAppQueFaltan: number
  /** No se sabe qué archivos debería haber (nunca se bajó la lista). */
  appSinComprobar: boolean
  /** El mapa guardado no está entero o es de otra ruta. */
  mapaIncompleto: boolean
  /** Nada que avisar. */
  todoEnOrden: boolean
}

/**
 * Sin cobertura no se descarga nada: se entra con lo que hay. Esto dice qué
 * tiene de malo lo que hay, para poder avisar de QUÉ falta (y no de un genérico
 * "puede que falte algo").
 */
export function evaluarLoGuardado(args: {
  pack?: (PaqueteGuardado & { downloaded_at?: string }) | null
  ahoraMs: number
  app: { faltan: number; sinLista: boolean } | null
  mapa: EvaluacionDeMapa | null
  edadMaximaMs?: number
}): EstadoDeLoGuardado {
  const maxima = args.edadMaximaMs ?? EDAD_MAXIMA_DEL_PAQUETE_MS
  const sinPaquete = !args.pack || !args.pack.payload
  const paqueteIncompleto = !sinPaquete && !paqueteCompleto(args.pack).completo

  const descargado = sinPaquete ? NaN : Date.parse(args.pack?.downloaded_at || '')
  const edadMs = Number.isFinite(descargado) ? Math.max(0, args.ahoraMs - descargado) : NaN
  const paqueteViejo = !sinPaquete && Number.isFinite(edadMs) && edadMs > maxima
  const edadDias = Number.isFinite(edadMs) ? Math.floor(edadMs / (24 * 60 * 60 * 1000)) : 0

  const archivosDeAppQueFaltan = args.app ? args.app.faltan : 0
  const appSinComprobar = Boolean(args.app?.sinLista)
  const mapaIncompleto = Boolean(args.mapa && args.mapa.estado !== 'ok')

  return {
    sinPaquete,
    paqueteIncompleto,
    paqueteViejo,
    edadDias,
    archivosDeAppQueFaltan,
    appSinComprobar,
    mapaIncompleto,
    todoEnOrden:
      !sinPaquete &&
      !paqueteIncompleto &&
      !paqueteViejo &&
      archivosDeAppQueFaltan === 0 &&
      !mapaIncompleto,
  }
}

/* ------------------------------------------------------------------ *
 * J9: el nivel nunca retrocede por bajar la misión
 * ------------------------------------------------------------------ */

/**
 * El nivel del jugador no baja por una respuesta del servidor.
 *
 * Hay dos verdades sobre en qué nodo estás: la del móvil, que avanza aunque no
 * haya cobertura, y la del servidor, que sólo se entera al sincronizar. Cuando
 * el servidor contesta con un nivel más bajo puede ser por tres motivos muy
 * distintos, y tratarlos igual es lo que mandaba a la gente a repetir juegos:
 *
 *  - respuesta vieja que llega tarde  → hay que ignorarla
 *  - nodos hechos sin cobertura       → hay que esperar a que suba la cola
 *  - reseteo desde administración     → hay que obedecer
 *
 * `permitirBajar` es lo único que distingue el tercero. Se pasa `true` sólo
 * cuando la cola está vacía —no hay nada que justifique ir por delante— y no
 * acaba de llegar un reseteo.
 */
export function mantenerNivel(
  anterior: PlayerGamePayload | null,
  siguiente: PlayerGamePayload,
  permitirBajar = false
): PlayerGamePayload {
  if (!anterior) return siguiente

  const nivelAnterior = Number(anterior.level || 0)
  const nivelSiguiente = Number(siguiente.level || 0)

  if (!Number.isFinite(nivelAnterior) || nivelSiguiente >= nivelAnterior) return siguiente
  if (permitirBajar) return siguiente

  // Llega un nivel menor del que ya se veia: respuesta vieja, rebote, o
  // progreso que todavia no ha subido. Se conserva lo alcanzado y se aprovecha
  // el resto de datos nuevos.
  return { ...siguiente, level: nivelAnterior, current_stage: anterior.current_stage }
}

/**
 * Con qué se compara el nivel que trae una descarga antes de guardarla.
 *
 * Mientras haya nodos hechos sin cobertura que el servidor no conoce (cola
 * pendiente), manda el móvil: el nivel que trae la descarga es el del servidor,
 * que va por detrás, y guardarlo hacía que el jugador retrocediera y rejugase
 * nodos. Con la cola vacía manda el servidor al ARRANCAR (es cuando una
 * respuesta no puede venir atrasada) y no baja en plena partida, salvo reseteo.
 *
 * Devuelve la base y si se permite bajar: se le pasan tal cual a
 * `mantenerNivel(base, servidor, permitirBajar)`.
 */
export function reconciliacionDelNivel(args: {
  pendientes: number
  huboReset: boolean
  alArrancar: boolean
  enPantalla: PlayerGamePayload | null | undefined
  guardada: PlayerGamePayload | null | undefined
}): { base: PlayerGamePayload | null; permitirBajar: boolean } {
  if (args.huboReset) return { base: null, permitirBajar: true }

  if (args.pendientes > 0) {
    return { base: args.enPantalla || args.guardada || null, permitirBajar: false }
  }

  if (args.alArrancar) return { base: null, permitirBajar: true }

  return { base: args.enPantalla || null, permitirBajar: false }
}

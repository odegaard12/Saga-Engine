/**
 * El motor de la pantalla de carga: comprueba TRES partes y baja lo que falte.
 *
 * Las partes son la aplicación (App), la misión del jugador (Misión) y el mapa
 * (Mapa). Cada una sabe comprobar si lo que hay en el móvil vale y bajar lo que
 * no; este motor sólo las coordina y va contando el progreso de cada una. No
 * sabe nada de red, ni de React, ni del almacén: por eso se puede probar entero
 * con partes falsas.
 *
 * La regla del dueño, que manda aquí: «la pantalla de carga era la idea
 * siempre: bajar todo offline en ella, no de fondo mientras se jugaba».
 */

export type ParteId = 'app' | 'mision' | 'mapa'

export const PARTES: readonly ParteId[] = ['app', 'mision', 'mapa']

export type EstadoDeParte =
  | 'comprobando' // mirando qué hay
  | 'al_dia' // no hay nada que bajar
  | 'pendiente' // hay que bajar algo (todavía no ha empezado)
  | 'descargando'
  | 'listo' // se ha bajado y está comprobado
  | 'error' // se intentó y no quedó entero

export type MotivoDeParte =
  | 'primera_vez'
  | 'version_nueva'
  | 'mision_cambiada'
  | 'ruta_cambiada'
  | 'incompleto'

export interface ProgresoDeParte {
  id: ParteId
  estado: EstadoDeParte
  motivo: MotivoDeParte | null
  /** Cuánto lleva y de cuánto. `total: 0` = trabajando, sin saber cuánto queda. */
  hecho: number
  total: number
  detalle: string
  /** Bytes bajados en esta descarga (para enseñar los MB). */
  bytes?: number
  /** Tiempo que queda al ritmo de ahora; `null`/ausente si aún no se sabe. */
  restanteMs?: number | null
  error?: string
  /** El navegador dijo que no cabía más. */
  sinEspacio?: boolean
}

export type EstadoDeCarga = Record<ParteId, ProgresoDeParte>

export function parteVacia(id: ParteId): ProgresoDeParte {
  return { id, estado: 'comprobando', motivo: null, hecho: 0, total: 0, detalle: '' }
}

export function cargaInicial(): EstadoDeCarga {
  return { app: parteVacia('app'), mision: parteVacia('mision'), mapa: parteVacia('mapa') }
}

/** ¿Hay algo que bajar? Es lo que decide si se enseña la pantalla de carga. */
export function hayQueBajar(estado: EstadoDeCarga): boolean {
  return PARTES.some((id) => estado[id].estado === 'pendiente')
}

/** Todas las partes están al día o recién bajadas y comprobadas. */
export function todoListo(estado: EstadoDeCarga): boolean {
  return PARTES.every((id) => estado[id].estado === 'al_dia' || estado[id].estado === 'listo')
}

/** Alguna parte se intentó y no quedó entera. */
export function algunaFallo(estado: EstadoDeCarga): boolean {
  return PARTES.some((id) => estado[id].estado === 'error')
}

/** Las partes que fallaron vuelven a estar pendientes: es lo que hace «Reintentar». */
export function reabrirFallidas(estado: EstadoDeCarga): EstadoDeCarga {
  const salida: EstadoDeCarga = {
    app: { ...estado.app },
    mision: { ...estado.mision },
    mapa: { ...estado.mapa },
  }
  for (const id of PARTES) {
    if (salida[id].estado === 'error') {
      salida[id] = { ...salida[id], estado: 'pendiente', error: undefined, sinEspacio: undefined }
    }
  }
  return salida
}

/** Las partes que NO están listas (para avisar de qué falta al entrar igualmente). */
export function partesSinCompletar(estado: EstadoDeCarga): ParteId[] {
  return PARTES.filter((id) => estado[id].estado !== 'al_dia' && estado[id].estado !== 'listo')
}

export interface ResultadoDeComprobacion {
  /** Hay algo que bajar. */
  pendiente: boolean
  motivo: MotivoDeParte | null
  detalle: string
  hecho?: number
  total?: number
}

export interface ResultadoDeDescarga {
  ok: boolean
  error?: string
  sinEspacio?: boolean
  detalle?: string
}

export interface AvanceDeParte {
  hecho: number
  total: number
  detalle: string
  bytes?: number
}

export interface ParteDeCarga {
  id: ParteId
  comprobar(): Promise<ResultadoDeComprobacion>
  descargar(alAvanzar: (avance: AvanceDeParte) => void): Promise<ResultadoDeDescarga>
}

function mensajeDeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error || 'error')
}

/**
 * La comprobación única: las tres partes a la vez, sin bajar nada.
 *
 * Una comprobación que se rompe NO da la parte por buena: si no se puede saber
 * si lo guardado vale, se cuenta como pendiente y se intenta bajar. Lo que no se
 * puede es dejar entrar a alguien con algo sin verificar y llamarlo «al día».
 */
export async function comprobarPartes(
  partes: ParteDeCarga[],
  alCambiar?: (estado: EstadoDeCarga) => void
): Promise<EstadoDeCarga> {
  const estado = cargaInicial()

  await Promise.all(
    partes.map(async (parte) => {
      try {
        const resultado = await parte.comprobar()
        estado[parte.id] = {
          ...estado[parte.id],
          estado: resultado.pendiente ? 'pendiente' : 'al_dia',
          motivo: resultado.pendiente ? resultado.motivo : null,
          hecho: resultado.hecho ?? 0,
          total: resultado.total ?? 0,
          detalle: resultado.detalle,
        }
      } catch (error) {
        estado[parte.id] = {
          ...estado[parte.id],
          estado: 'pendiente',
          motivo: 'incompleto',
          detalle: mensajeDeError(error),
        }
      }
      alCambiar?.({ ...estado })
    })
  )

  return estado
}

export interface OpcionesDeDescarga {
  /** Devuelve `true` cuando hay que dejarlo (el jugador entra igualmente, cambia de jugador). */
  cancelado?: () => boolean
  alCambiar?: (estado: EstadoDeCarga) => void
  /** Cada cuánto mirar `cancelado` mientras se espera a una descarga. */
  cadaMs?: number
}

/**
 * Baja lo pendiente, parte por parte, y va contando el progreso de cada una.
 *
 * La aplicación y la misión van a la vez (son pequeñas); el mapa espera a que
 * termine la misión, porque si la ruta ha cambiado necesita los nodos nuevos
 * para saber qué teselas pedir. Sólo se baja lo que estaba pendiente: una parte
 * al día no se toca.
 *
 * Si `cancelado` se activa, se devuelve el estado tal y como esté sin esperar a
 * que terminen las descargas en vuelo: el jugador que pulsa «Entrar igualmente»
 * no puede quedarse esperando a un lote de teselas.
 */
export async function descargarPartes(
  partes: ParteDeCarga[],
  inicial: EstadoDeCarga,
  opciones: OpcionesDeDescarga = {}
): Promise<EstadoDeCarga> {
  const estado: EstadoDeCarga = {
    app: { ...inicial.app },
    mision: { ...inicial.mision },
    mapa: { ...inicial.mapa },
  }
  const cancelado = opciones.cancelado ?? (() => false)
  const avisar = () => opciones.alCambiar?.({ app: { ...estado.app }, mision: { ...estado.mision }, mapa: { ...estado.mapa } })
  const porId = new Map(partes.map((parte) => [parte.id, parte] as const))

  const bajar = async (id: ParteId): Promise<void> => {
    const parte = porId.get(id)
    if (!parte || estado[id].estado !== 'pendiente') return

    // Los números de la comprobación (lo que ya había) se mantienen: la barra
    // no vuelve a cero al empezar, sigue desde donde estaba.
    estado[id] = { ...estado[id], estado: 'descargando' }
    avisar()

    // Desde dónde se mide el ritmo: se reinicia al cambiar de fase (otro total).
    let inicio = { ms: Date.now(), hecho: estado[id].hecho, total: estado[id].total }

    try {
      const resultado = await parte.descargar((avance) => {
        const ahora = Date.now()
        if (avance.total !== inicio.total) inicio = { ms: ahora, hecho: avance.hecho, total: avance.total }
        estado[id] = {
          ...estado[id],
          estado: 'descargando',
          hecho: avance.hecho,
          total: avance.total,
          detalle: avance.detalle,
          bytes: avance.bytes ?? estado[id].bytes,
          restanteMs: tiempoRestanteMs({
            inicioMs: inicio.ms,
            hechoAlEmpezar: inicio.hecho,
            ahoraMs: ahora,
            hecho: avance.hecho,
            total: avance.total,
          }),
        }
        avisar()
      })

      estado[id] = resultado.ok
        ? {
            ...estado[id],
            estado: 'listo',
            hecho: Math.max(estado[id].total, estado[id].hecho),
            total: estado[id].total,
            detalle: resultado.detalle ?? estado[id].detalle,
            error: undefined,
            sinEspacio: undefined,
            restanteMs: null,
          }
        : {
            ...estado[id],
            estado: 'error',
            error: resultado.error || 'No se pudo completar',
            sinEspacio: resultado.sinEspacio || undefined,
            restanteMs: null,
            detalle: resultado.detalle ?? estado[id].detalle,
          }
    } catch (error) {
      estado[id] = { ...estado[id], estado: 'error', error: mensajeDeError(error) }
    }
    avisar()
  }

  const trabajo = (async () => {
    await Promise.all([bajar('app'), (async () => { await bajar('mision'); await bajar('mapa') })()])
  })()

  // Espera al trabajo, o a que se cancele, lo que llegue antes.
  await Promise.race([
    trabajo,
    new Promise<void>((resolver) => {
      const cada = opciones.cadaMs ?? 150
      const id = setInterval(() => {
        if (cancelado()) {
          clearInterval(id)
          resolver()
        }
      }, cada)
      void trabajo.finally(() => {
        clearInterval(id)
        resolver()
      })
    }),
  ])

  return estado
}

/* ------------------------------------------------------------------ *
 * Textos de progreso que no dependen de la red
 * ------------------------------------------------------------------ */

/** Porcentaje 0-100 de una parte, o `null` si no se sabe cuánto queda. */
export function porcentajeDeParte(parte: ProgresoDeParte): number | null {
  if (parte.estado === 'al_dia' || parte.estado === 'listo') return 100
  if (parte.total > 0) return Math.max(0, Math.min(100, Math.round((parte.hecho / parte.total) * 100)))
  return null
}

/** «12,3 MB» (o «850 KB» por debajo de un mega). */
export function textoDeMegas(bytes: number): string {
  if (!(bytes > 0)) return ''
  if (bytes < 1048576) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / 1048576).toFixed(1).replace('.', ',')} MB`
}

/**
 * Cuánto queda, al ritmo de lo que va de esta descarga. `null` mientras no hay
 * con qué estimar: los primeros segundos y el primer 3 % mienten mucho (el
 * primer lote tarda más, la red arranca) y un «quedan 40 min» que a los dos
 * segundos es «1 min» asusta más que no decir nada.
 */
export function tiempoRestanteMs(args: {
  inicioMs: number
  hechoAlEmpezar: number
  ahoraMs: number
  hecho: number
  total: number
}): number | null {
  const { inicioMs, hechoAlEmpezar, ahoraMs, hecho, total } = args
  const transcurrido = ahoraMs - inicioMs
  const avanzado = hecho - hechoAlEmpezar
  if (total <= 0 || hecho >= total) return null
  if (transcurrido < 3000 || avanzado <= 0 || avanzado / total < 0.03) return null
  return ((total - hecho) * transcurrido) / avanzado
}

/** «≈ 40 s», «≈ 3 min», «≈ 1 h 10 min». */
export function textoDeTiempo(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return ''
  const s = Math.ceil(ms / 1000)
  if (s < 60) return `≈ ${Math.max(5, Math.ceil(s / 5) * 5)} s`
  const min = Math.round(s / 60)
  if (min < 60) return `≈ ${min} min`
  const resto = min % 60
  return `≈ ${Math.floor(min / 60)} h${resto ? ` ${resto} min` : ''}`
}

/**
 * Qué falta de una parte, en una frase corta para «Entrar igualmente»: el error
 * si lo hubo, o lo que dice su detalle mientras baja («Faltan 300 teselas…»).
 */
export function queFaltaDeParte(parte: ProgresoDeParte): string {
  if (parte.estado === 'error') return parte.error || ''
  if (parte.estado === 'descargando' && parte.total > 0) {
    return `${Math.round((parte.hecho / parte.total) * 100)} %`
  }
  return ''
}

/* ------------------------------------------------------------------ *
 * La lista final de «Prepararse»
 * ------------------------------------------------------------------ */

export type ClaveDeLista = 'app' | 'mision' | 'mapa' | 'permisos' | 'espacio'

export interface ElementoDeLista {
  id: ClaveDeLista
  /** `true` hecho, `false` falló, `null` aún sin resolver. */
  ok: boolean | null
}

/**
 * App ✓ Misión ✓ Mapa ✓ Permisos ✓ Espacio ✓
 *
 * Es lo último que se le enseña a quien se prepara: un sí o un no por cosa, sin
 * tener que leer nada más. Sólo es todo ✓ si de verdad lo está: una parte que
 * falló es ✗ y lo que aún no se ha pedido (un permiso, el espacio) queda sin marcar.
 */
export function listaFinalDePreparacion(args: {
  partes: EstadoDeCarga | null
  permisos: { gps: boolean; camara: boolean; movimiento: boolean; microfono: boolean }
  espacio: 'ok' | 'aviso' | 'pendiente'
}): ElementoDeLista[] {
  const deParte = (id: ParteId): boolean | null => {
    const estado = args.partes?.[id].estado
    if (estado === 'al_dia' || estado === 'listo') return true
    if (estado === 'error') return false
    return null
  }

  const todosLosPermisos =
    args.permisos.gps && args.permisos.camara && args.permisos.movimiento && args.permisos.microfono

  return [
    { id: 'app', ok: deParte('app') },
    { id: 'mision', ok: deParte('mision') },
    { id: 'mapa', ok: deParte('mapa') },
    { id: 'permisos', ok: todosLosPermisos ? true : null },
    { id: 'espacio', ok: args.espacio === 'ok' ? true : args.espacio === 'aviso' ? false : null },
  ]
}

/**
 * ¿Algún nodo de la ruta escucha el micrófono? Sólo el reto de audio. Con la
 * ruta sin él, «Prepararse» lo dice a las claras («no hace falta en esta ruta»)
 * en vez de pedir un permiso que no se va a usar.
 */
export function rutaUsaMicrofono(stages: unknown): boolean {
  if (!Array.isArray(stages)) return true
  return stages.some((nodo) => {
    const n = (nodo ?? {}) as Record<string, unknown>
    return [n.type, n.family, n.game_id, n.kind].some((v) => String(v ?? '').toLowerCase().includes('audio'))
  })
}

export function listaCompleta(lista: ElementoDeLista[]): boolean {
  return lista.every((elemento) => elemento.ok === true)
}

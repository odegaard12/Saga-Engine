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

    try {
      const resultado = await parte.descargar((avance) => {
        estado[id] = {
          ...estado[id],
          estado: 'descargando',
          hecho: avance.hecho,
          total: avance.total,
          detalle: avance.detalle,
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
          }
        : {
            ...estado[id],
            estado: 'error',
            error: resultado.error || 'No se pudo completar',
            sinEspacio: resultado.sinEspacio || undefined,
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

export function listaCompleta(lista: ElementoDeLista[]): boolean {
  return lista.every((elemento) => elemento.ok === true)
}

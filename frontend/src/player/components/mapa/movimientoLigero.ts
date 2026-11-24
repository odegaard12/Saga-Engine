/**
 * 23/11 · MAPA MÁS LIGERO MIENTRAS LA CÁMARA SE MUEVE.
 *
 * Girar o desplazar con 15 jugadores en 3D es lo más caro que hace el mapa (a CPU ×2 bajaba de ~42 a ~9 fps). Si el
 * móvil NO llega al presupuesto durante el gesto (y su inercia), se dibuja con menos píxeles, y 220 ms después de soltar
 * vuelve a la densidad del móvil: lo que se queda quieto es EXACTAMENTE lo de siempre. Un móvil que va sobrado nunca
 * ve ningún cambio. No se toca el estilo ni sus capas (`setLayoutProperty` / `setPaintProperty` rehacen teselas o
 * repintan el terreno entero): sólo la densidad del lienzo.
 *
 * Escalones (0 = nada): 1 → 2/3 de la densidad, 2 → 1/2 (nunca por debajo de 1). Se mide el tiempo entre fotogramas del
 * propio gesto: pasada una ventana de 8 fotogramas por encima del presupuesto, sube un escalón; al soltar, el siguiente
 * gesto empieza donde acabó (o un escalón más abajo si fue holgado). Histéresis: a mitad de gesto sólo se sube.
 */
import type * as maplibregl from 'maplibre-gl'

/** Silencio de cámara antes de devolver la densidad completa. */
export const REPOSO_MS = 220
/** Un movimiento que ya acabó antes de esto (un `jumpTo` de seguirte, un tirón) ni se mide: evita parpadeos. */
export const ARRANQUE_MS = 150
/** Por encima de este tiempo entre fotogramas (mediana) se baja la densidad un escalón (~27 fps). */
export const PRESUPUESTO_FOTOGRAMA_MS = 36
/** Por debajo de esto, al soltar, el siguiente gesto empieza con un escalón menos. */
export const HOLGURA_FOTOGRAMA_MS = 22
export const FOTOGRAMAS_POR_MEDIDA = 8
export const ESCALON_MAXIMO = 2
const FRACCION_DE_DENSIDAD = [1, 2 / 3, 1 / 2] as const

export function medianaDe(muestras: readonly number[]): number {
  if (!muestras.length) return 0
  const orden = [...muestras].sort((a, b) => a - b)
  return orden[orden.length >> 1]
}

/** Densidad del lienzo en un escalón; nunca por debajo de 1 (si el móvil ya está en ≤1, no se toca). */
export function pixelRatioDelEscalon(base: number, escalon: number): number {
  if (!(base > 1)) return base > 0 ? base : 1
  const f = FRACCION_DE_DENSIDAD[Math.max(0, Math.min(ESCALON_MAXIMO, Math.floor(escalon)))]
  return Math.max(1, Math.round(base * f * 100) / 100)
}

/** Tras medir una ventana de fotogramas: sube un escalón si va por encima del presupuesto; nunca baja a mitad de gesto. */
export function escalonTrasMedir(escalon: number, medianaMs: number): number {
  return medianaMs > PRESUPUESTO_FOTOGRAMA_MS ? Math.min(ESCALON_MAXIMO, escalon + 1) : escalon
}

/** Escalón con el que empieza el siguiente gesto: el que se alcanzó, o uno menos si el gesto fue holgado. */
export function escalonInicialDelSiguiente(alcanzado: number, medianaMs: number): number {
  if (alcanzado > 0 && medianaMs > 0 && medianaMs < HOLGURA_FOTOGRAMA_MS) return alcanzado - 1
  return alcanzado
}

type MapaConPrivados = maplibregl.Map & {
  _overridePixelRatio?: number | null
  _resizeInternal?: (constrain?: boolean) => void
}

/**
 * Pone la densidad del lienzo SIN los eventos de `resize()` (que, quieto el mapa, dispara movestart/moveend y con ellos
 * el reparto de jugadores): `_resizeInternal` es privado de MapLibre (fijado en 6.10.0); si no existe, `setPixelRatio`.
 */
export function ponerDensidad(mapa: maplibregl.Map, ratio: number | null): void {
  const m = mapa as MapaConPrivados
  if (typeof m._resizeInternal === 'function' && '_overridePixelRatio' in m) {
    m._overridePixelRatio = ratio
    m._resizeInternal(false)
  } else {
    mapa.setPixelRatio(ratio as number)
  }
}

export interface LigeroDelMapa {
  /** Quita los escuchadores y devuelve la densidad si estaba bajada. */
  destruir: () => void
  /** Apaga/enciende el aligerado (diagnóstico). */
  pausar: (pausado: boolean) => void
  estado: () => { escalon: number; bajado: boolean; pixelRatio: number; gestos: number; mediana: number }
}

export function aligerarMientrasSeMueve(mapa: maplibregl.Map): LigeroDelMapa {
  let pausado = false
  let activo = false
  let bajado = false
  let densidadOriginal: number | null = null
  let densidadBase = 1
  let escalon = 0
  let escalonInicial = 0
  let gestos = 0
  let ultimaMediana = 0
  let temporizadorArranque = 0
  let temporizadorReposo = 0
  let ultimoFotograma = 0
  let muestras: number[] = []

  const poner = (n: number) => {
    if (!bajado) {
      densidadOriginal = (mapa as MapaConPrivados)._overridePixelRatio ?? null
      densidadBase = mapa.getPixelRatio()
    }
    bajado = true
    const objetivo = pixelRatioDelEscalon(densidadBase, n)
    if (objetivo === mapa.getPixelRatio()) return
    ponerDensidad(mapa, objetivo)
    // Sin esto, el lienzo (que se vacía al cambiar de tamaño) enseñaría un fotograma en blanco hasta el siguiente.
    mapa.redraw()
  }

  const restaurar = () => {
    temporizadorReposo = 0
    if (!bajado) return
    bajado = false
    if (densidadBase !== mapa.getPixelRatio()) {
      ponerDensidad(mapa, densidadOriginal)
      mapa.redraw()
    }
  }

  const alFotograma = () => {
    const t = performance.now()
    if (ultimoFotograma) muestras.push(t - ultimoFotograma)
    ultimoFotograma = t
    if (muestras.length < FOTOGRAMAS_POR_MEDIDA) return
    ultimaMediana = medianaDe(muestras)
    muestras = []
    const nuevo = escalonTrasMedir(escalon, ultimaMediana)
    if (nuevo !== escalon) {
      escalon = nuevo
      poner(escalon)
    }
  }

  const activar = () => {
    temporizadorArranque = 0
    if (pausado || !mapa.isMoving()) return
    activo = true
    gestos++
    escalon = escalonInicial
    ultimaMediana = 0
    muestras = []
    ultimoFotograma = 0
    mapa.off('render', alFotograma)
    mapa.on('render', alFotograma)
    if (escalon > 0) poner(escalon)
    else if (bajado) restaurar()
  }

  const alEmpezar = () => {
    window.clearTimeout(temporizadorReposo)
    temporizadorReposo = 0
    if (activo || temporizadorArranque) return
    // Otro gesto antes del reposo: sigue como estaba (sin parpadeo) y vuelve a medir.
    if (bajado) activar()
    else temporizadorArranque = window.setTimeout(activar, ARRANQUE_MS)
  }

  const alAcabar = () => {
    window.clearTimeout(temporizadorArranque)
    temporizadorArranque = 0
    if (!activo) return
    activo = false
    mapa.off('render', alFotograma)
    escalonInicial = escalonInicialDelSiguiente(escalon, ultimaMediana)
    if (!bajado) return
    window.clearTimeout(temporizadorReposo)
    temporizadorReposo = window.setTimeout(restaurar, REPOSO_MS)
  }

  mapa.on('movestart', alEmpezar)
  mapa.on('moveend', alAcabar)

  return {
    destruir: () => {
      window.clearTimeout(temporizadorArranque)
      window.clearTimeout(temporizadorReposo)
      mapa.off('movestart', alEmpezar)
      mapa.off('moveend', alAcabar)
      mapa.off('render', alFotograma)
      if (bajado) {
        bajado = false
        ponerDensidad(mapa, densidadOriginal)
      }
    },
    pausar: (v) => {
      pausado = v
      if (v) {
        activo = false
        window.clearTimeout(temporizadorArranque)
        temporizadorArranque = 0
        mapa.off('render', alFotograma)
        restaurar()
      }
    },
    estado: () => ({
      escalon: activo || bajado ? escalon : 0,
      bajado,
      pixelRatio: mapa.getPixelRatio(),
      gestos,
      mediana: ultimaMediana,
    }),
  }
}

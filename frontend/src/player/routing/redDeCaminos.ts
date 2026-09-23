import { cargarGrafo, factorPorLejania, rutaPorCaminos, type GrafoDeCaminos, type Punto } from './roadGraph'

/** La URL de la red. El service worker la guarda desde la pantalla de carga. */
export const URL_RED_DE_CAMINOS = '/api/road-graph'

/** Hasta cuántos metros del punto pedido se busca un nodo de la red. */
const PEGADO_M = 1500

export type RedDeCaminos = {
  /** Descarga e indexa la red. Devuelve si quedó lista. Idempotente. */
  cargar: () => Promise<boolean>
  lista: () => boolean
  /**
   * Ruta por caminos de `desde` a `hasta`, como lista de [lon, lat].
   * `lejaniaM` es lo lejos que estás del trazado: de lejos manda la
   * carretera; cerca valen las pistas. Null si no hay red o no hay ruta.
   */
  ruta: (desde: Punto, hasta: Punto, lejaniaM: number) => Promise<[number, number][] | null>
  cerrar: () => void
}

/**
 * La red de caminos para la guía, calculada en un worker.
 *
 * Si el navegador no puede con el worker (raro, pero pasa en alguna
 * WebView vieja), se hace en el hilo principal como antes: más lento,
 * pero la guía sigue yendo por caminos.
 */
export function crearRedDeCaminos(): RedDeCaminos {
  let worker: Worker | null = null
  let lista = false
  let carga: Promise<boolean> | null = null
  let grafoLocal: GrafoDeCaminos | null = null
  let siguienteId = 1
  const esperando = new Map<number, (coords: [number, number][] | null) => void>()
  let resolverCarga: ((ok: boolean) => void) | null = null

  const arrancar = (): Worker | null => {
    if (worker) return worker
    if (typeof Worker === 'undefined') return null
    try {
      worker = new Worker(new URL('./roadGraph.worker.ts', import.meta.url), { type: 'module' })
      worker.onmessage = (evento: MessageEvent) => {
        const m = evento.data as
          | { tipo: 'cargado'; ok: boolean }
          | { tipo: 'ruta'; id: number; coords: [number, number][] | null }
        if (m?.tipo === 'cargado') {
          lista = Boolean(m.ok)
          resolverCarga?.(lista)
          resolverCarga = null
        } else if (m?.tipo === 'ruta') {
          esperando.get(m.id)?.(m.coords ?? null)
          esperando.delete(m.id)
        }
      }
      worker.onerror = () => {
        // El worker se cayó: lo que estuviera esperando, sin ruta.
        for (const resolver of esperando.values()) resolver(null)
        esperando.clear()
        resolverCarga?.(false)
        resolverCarga = null
      }
      return worker
    } catch {
      worker = null
      return null
    }
  }

  const cargar = (): Promise<boolean> => {
    if (carga) return carga
    carga = new Promise<boolean>((resolver) => {
      const w = arrancar()
      if (w) {
        resolverCarga = resolver
        w.postMessage({ tipo: 'cargar', url: URL_RED_DE_CAMINOS })
        return
      }
      void cargarGrafo().then((grafo) => {
        grafoLocal = grafo
        lista = Boolean(grafo)
        resolver(lista)
      })
    })
    return carga
  }

  const ruta = (desde: Punto, hasta: Punto, lejaniaM: number): Promise<[number, number][] | null> => {
    if (!lista) return Promise.resolve(null)
    if (worker) {
      const id = siguienteId++
      const w = worker
      return new Promise((resolver) => {
        esperando.set(id, resolver)
        w.postMessage({ tipo: 'ruta', id, desde, hasta, lejaniaM, pegadoM: PEGADO_M })
      })
    }
    if (!grafoLocal) return Promise.resolve(null)
    return Promise.resolve(rutaPorCaminos(grafoLocal, desde, hasta, PEGADO_M, factorPorLejania(lejaniaM)))
  }

  const cerrar = () => {
    worker?.terminate()
    worker = null
    esperando.clear()
  }

  return { cargar, lista: () => lista, ruta, cerrar }
}

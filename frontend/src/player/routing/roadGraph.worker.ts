import { factorPorLejania, indexarGrafo, rutaPorCaminos, type GrafoDeCaminos, type Punto } from './roadGraph'

/**
 * La red de caminos, en un hilo aparte.
 *
 * Son 21 MB de JSON: analizarlos e indexarlos en el hilo principal dejaba
 * el mapa congelado unos segundos nada más entrar, y el trazado y las
 * fotos aparecían "mucho después". Aquí se descarga (el service worker la
 * sirve de lo guardado), se analiza, se indexa y se calculan las rutas;
 * el mapa sólo recibe la línea ya hecha.
 */
type Peticion =
  | { tipo: 'cargar'; url: string }
  | { tipo: 'ruta'; id: number; desde: Punto; hasta: Punto; lejaniaM: number; pegadoM: number }

const hilo = self as unknown as {
  postMessage: (mensaje: unknown) => void
  onmessage: ((evento: MessageEvent<Peticion>) => void) | null
}

let grafo: GrafoDeCaminos | null = null

hilo.onmessage = async (evento: MessageEvent<Peticion>) => {
  const m = evento.data
  if (m.tipo === 'cargar') {
    try {
      const respuesta = await fetch(m.url)
      if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`)
      const cuerpo = (await respuesta.json()) as { nodos?: unknown; tramos?: unknown }
      if (!Array.isArray(cuerpo?.nodos) || !Array.isArray(cuerpo?.tramos)) throw new Error('formato')
      grafo = indexarGrafo({
        nodos: cuerpo.nodos as GrafoDeCaminos['nodos'],
        tramos: cuerpo.tramos as GrafoDeCaminos['tramos'],
      })
      hilo.postMessage({ tipo: 'cargado', ok: true, nodos: grafo.nodos.length, tramos: grafo.tramos.length })
    } catch (fallo) {
      hilo.postMessage({ tipo: 'cargado', ok: false, error: String(fallo) })
    }
    return
  }
  if (m.tipo === 'ruta') {
    const coords = grafo ? rutaPorCaminos(grafo, m.desde, m.hasta, m.pegadoM, factorPorLejania(m.lejaniaM)) : null
    hilo.postMessage({ tipo: 'ruta', id: m.id, coords })
  }
}

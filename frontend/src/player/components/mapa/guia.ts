/**
 * La guía por caminos guardada, el trazado de cada nodo y su geometría (sacado tal cual de MapSurfaceGL.tsx).
 */
import type * as maplibregl from 'maplibre-gl'
import { type PlayerStage } from '../../../types/player'
import { type TipoDeNodo } from '../nodosTresD'

/**
 * La guía por caminos se guarda: al volver a abrir la app en el mismo
 * sitio (en casa, por ejemplo), sale al instante en vez de esperar a que
 * el worker cargue la red y la calcule otra vez.
 */
export const CLAVE_GUIA_GUARDADA = 'saga:guia-por-caminos:v1'
/** `alCaminoM`: metros de `desde` al camino más cercano de la red (null: ninguno cerca; sin dato en las guardadas). */
export type RutaGuia = { desde: Punto; hastaClave: string; coords: [number, number][]; alCaminoM?: number | null }
export function leerGuiaGuardada(): RutaGuia | null {
  try {
    const crudo = window.localStorage.getItem(CLAVE_GUIA_GUARDADA)
    if (!crudo) return null
    const ruta = JSON.parse(crudo) as RutaGuia
    if (typeof ruta?.hastaClave !== 'string' || !Array.isArray(ruta.coords)) return null
    if (typeof ruta.desde?.lat !== 'number' || typeof ruta.desde?.lon !== 'number') return null
    return ruta
  } catch {
    return null
  }
}
export function guardarGuia(ruta: RutaGuia): void {
  try {
    window.localStorage.setItem(CLAVE_GUIA_GUARDADA, JSON.stringify(ruta))
  } catch {
    // Sin almacenamiento: se calcula cada vez, como antes.
  }
}
export type Punto = { lat: number; lon: number }

/**
 * El radio de un nodo, como polígono de verdad.
 *
 * MapLibre sabe pintar círculos, pero su radio va en PÍXELES: al alejarse
 * el círculo seguiría midiendo lo mismo en pantalla y dejaría de
 * significar "50 metros a la redonda", que es justo lo único que ese
 * círculo tiene que decir. Un polígono en coordenadas sí escala con el
 * mapa porque está en el terreno, no en la pantalla.
 */
/** Distancia en metros entre dos puntos (suficiente para unos pocos km). */
export function metrosEntre(a: Punto, b: Punto): number {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLon = ((b.lon - a.lon) * Math.PI) / 180
  const lat1 = (a.lat * Math.PI) / 180
  const lat2 = (b.lat * Math.PI) / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return 2 * 6371000 * Math.asin(Math.sqrt(h))
}

/** A partir de cuántos metros del camino se avisa; se apaga algo más cerca, para no parpadear. */
export const FUERA_DE_TRAZADO_M = 500
export const DE_VUELTA_AL_TRAZADO_M = 400

export function tipoDelNodo(nodo: {
  kind?: string
  type?: string
  physical_node_kind?: string
  physical_item_kind?: string
  is_map_collectible?: boolean
}): TipoDeNodo {
  const texto = String(nodo.kind || nodo.type || '').toLowerCase()
  const fisico = String(nodo.physical_node_kind || nodo.physical_item_kind || '').toLowerCase()
  if (texto === 'checkpoint') return 'checkpoint'
  /**
   * Un coleccionable se recoge: para el jugador no es lo mismo que un
   * minijuego, y hasta ahora los diez nodos de la ruta real salían con la
   * misma forma porque todos eran `minijuego`. El servidor ya lo dice en
   * `kind`; se mira también el campo físico por si el nodo viene de un
   * paquete guardado antes.
   */
  if (texto === 'coleccionable' || fisico.includes('collectible') || nodo.is_map_collectible === true) {
    return 'coleccionable'
  }
  if (texto.includes('qr')) return 'qr'
  return 'minijuego'
}

export function circuloGeoJSON(centro: Punto, radioMetros: number, lados = 64) {
  const coords: [number, number][] = []
  const radioLat = radioMetros / 111320
  const radioLon = radioMetros / (111320 * Math.cos((centro.lat * Math.PI) / 180))

  for (let i = 0; i <= lados; i += 1) {
    const angulo = (i / lados) * Math.PI * 2
    coords.push([centro.lon + radioLon * Math.cos(angulo), centro.lat + radioLat * Math.sin(angulo)])
  }

  return {
    type: 'FeatureCollection' as const,
    features: [
      {
        type: 'Feature' as const,
        properties: {},
        geometry: { type: 'Polygon' as const, coordinates: [coords] },
      },
    ],
  }
}

/**
 * Trazado guardado en administración para llegar a un nodo (`route_track`).
 *
 * Mismo lector que el motor de Leaflet, y acepta las mismas dos formas en
 * que se ha ido guardando: pares [lat, lon] y objetos con lat/lon.
 */
/**
 * El trazado de un nodo, cosido a sus nodos: empieza en el anterior y
 * acaba EN este. El track grabado se queda a veces a unos metros -se grabó
 * por el camino y el nodo está al lado- y la línea no llegaba al halo.
 * Hasta 250 m se cose con un tramito recto; más lejos sería inventarse el
 * camino.
 */
export function cerrarTramo(track: Punto[], desde: PlayerStage | null, hasta: PlayerStage): Punto[] {
  if (track.length < 2) return track
  const punto = (stage: PlayerStage | null): Punto | null => {
    if (!stage || stage.lat == null || stage.lon == null) return null
    const lat = Number(stage.lat)
    const lon = Number(stage.lon)
    return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null
  }
  const coser = (a: Punto, b: Punto | null): b is Punto => {
    if (!b) return false
    const metros = metrosEntre(a, b)
    return metros > 0.5 && metros < 250
  }
  const inicio = punto(desde)
  const fin = punto(hasta)
  return [
    ...(coser(track[0], inicio) ? [inicio] : []),
    ...track,
    ...(coser(track[track.length - 1], fin) ? [fin] : []),
  ]
}

export function leerTrackDelNodo(stage: PlayerStage): Punto[] {
  const salida: Punto[] = []
  const crudo = (stage as unknown as Record<string, unknown>).route_track
  if (!Array.isArray(crudo)) return salida

  for (const punto of crudo) {
    let lat: number | null = null
    let lon: number | null = null

    if (Array.isArray(punto) && punto.length >= 2) {
      lat = Number(punto[0])
      lon = Number(punto[1])
    } else if (punto && typeof punto === 'object') {
      const p = punto as Record<string, unknown>
      lat = Number(p.lat ?? p.latitude)
      lon = Number(p.lon ?? p.lng ?? p.longitude)
    }

    if (lat !== null && lon !== null && Number.isFinite(lat) && Number.isFinite(lon)) {
      salida.push({ lat, lon })
    }
  }

  return salida
}

export const COLECCION_VACIA = { type: 'FeatureCollection' as const, features: [] }

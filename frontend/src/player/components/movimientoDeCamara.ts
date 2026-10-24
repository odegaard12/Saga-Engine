import { prefiereMenosMovimiento } from '../avatares/celebracion'

/**
 * Los movimientos de cámara del mapa (24/10, variante B «Vuelo»).
 *
 * - Al nodo (o a ti): un vuelo en arco que se aleja y se vuelve a acercar, de hasta 1,4 s. Más lejos que eso,
 *   MapLibre salta en vez de volar (`maxDuration`).
 * - 2D <-> 3D: 700 ms con curva suave y medio punto de zoom (acercarse al inclinar, alejarse al aplanar).
 *
 * Con «reducir movimiento» la cámara SALTA (0 ms). Antes `essential: true` hacía que MapLibre animase igual.
 */
export const VUELO_MAX_MS = 1400
export const PASO_2D_3D_MS = 700
export const ZOOM_AL_INCLINAR = 0.5

type Camara = {
  easeTo: (opciones: Record<string, unknown>) => unknown
  flyTo: (opciones: Record<string, unknown>) => unknown
  getZoom: () => number
}
type ConsultaDeMedios = ((consulta: string) => { matches: boolean }) | undefined

const consultaDeLaVentana = (): ConsultaDeMedios =>
  typeof window !== 'undefined' ? window.matchMedia?.bind(window) : undefined

/** Cúbica de entrada y salida. */
export function curvaSuave(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
}

/** Centrar en `centro` (lon, lat) a zoom 17 y al norte: en arco, o de golpe si se pide o si el móvil pide menos movimiento. */
export function volarA(
  mapa: Camara,
  centro: [number, number],
  deGolpe = false,
  matchMedia: ConsultaDeMedios = consultaDeLaVentana()
): void {
  if (deGolpe || prefiereMenosMovimiento(matchMedia)) {
    mapa.easeTo({ center: centro, zoom: 17, bearing: 0, duration: 0 })
    return
  }
  mapa.flyTo({
    center: centro,
    zoom: 17,
    bearing: 0,
    curve: 1.2,
    speed: 1.4,
    maxDuration: VUELO_MAX_MS,
  })
}

/** Inclinar o aplanar. `conZoom`: sólo cuando lo cambia el jugador (al montar el mapa no se toca el zoom). */
export function inclinar(
  mapa: Camara,
  pitch: number,
  conZoom: number,
  matchMedia: ConsultaDeMedios = consultaDeLaVentana()
): void {
  const duration = prefiereMenosMovimiento(matchMedia) ? 0 : PASO_2D_3D_MS
  const zoom = conZoom ? { zoom: mapa.getZoom() + conZoom } : {}
  mapa.easeTo({ pitch, duration, easing: curvaSuave, ...zoom })
}

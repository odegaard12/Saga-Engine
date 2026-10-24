import { prefiereMenosMovimiento } from '../avatares/celebracion'

/**
 * Efectos puntuales del mapa (24/10, elegidos de las propuestas del 24/10):
 *
 * - Nodo hecho («sellar con un golpe»): un sello ✓ cae sobre el nodo y golpea una vez (1,65 s). Sustituye a la
 *   insignia verde del festejo, que tapaba el nodo justo cuando se celebraba.
 * - Tocar a un compañero («cámara que acompaña»): la cámara lo deja en el tercio de arriba, encima de su ficha
 *   (0,9 s), con un anillo que se abre una vez.
 * - Fin de ruta: la cámara se aleja para enseñar la ruta entera (2 s).
 *
 * Regla de batería: cada efecto dura como mucho unos 2 s y después NO queda nada vivo (ni rAF, ni capa, ni
 * animación en bucle). Las piezas DOM siguen al nodo con `project()` sólo mientras duran y luego se quitan.
 *
 * Con «reducir movimiento»: la cámara SALTA (0 ms), sin anillo y sin sello (el festejo deja su insignia quieta).
 */
export const ENCUADRE_MS = 900
export const VER_RUTA_MS = 2000
export const SELLO_MS = 1650

type Punto = { lat: number; lon: number }
type ConsultaDeMedios = ((consulta: string) => { matches: boolean }) | undefined
/** Lo justo de MapLibre (así se prueba en Node con un mapa de mentira). */
export type CamaraDeEfectos = {
  easeTo: (opciones: Record<string, unknown>) => unknown
  fitBounds: (
    caja: [[number, number], [number, number]],
    opciones: Record<string, unknown>
  ) => unknown
  getZoom: () => number
  getPitch: () => number
  getBearing: () => number
  getContainer: () => HTMLElement
  project: (lngLat: [number, number]) => { x: number; y: number }
}

const consultaDeLaVentana = (): ConsultaDeMedios =>
  typeof window !== 'undefined' ? window.matchMedia?.bind(window) : undefined

/** Una pieza DOM pegada a un punto del mapa durante `ms` (alzada `alzar` px); luego se quita. */
function pieza(
  mapa: CamaraDeEfectos,
  estilo: string,
  donde: Punto,
  ms: number,
  alzar = 0,
  texto = ''
): HTMLElement {
  const el = document.createElement('div')
  el.setAttribute('aria-hidden', 'true')
  el.dataset.sagaEfecto = ''
  el.style.cssText = `position:absolute;left:0;top:0;pointer-events:none;z-index:30;${estilo}`
  el.textContent = texto
  mapa.getContainer().appendChild(el)
  const fin = performance.now() + ms
  const seguir = () => {
    const p = mapa.project([donde.lon, donde.lat])
    el.style.transform = `translate(${p.x}px, ${p.y - alzar}px)`
    if (performance.now() < fin) window.requestAnimationFrame(seguir)
    else el.remove()
  }
  seguir()
  return el
}

/** Nodo hecho: el sello ✓ golpea una vez. Devuelve si se puso (con «reducir movimiento», no). */
export function sellarNodo(
  mapa: CamaraDeEfectos,
  donde: Punto,
  matchMedia: ConsultaDeMedios = consultaDeLaVentana()
): boolean {
  if (prefiereMenosMovimiento(matchMedia)) return false
  const el = pieza(
    mapa,
    'width:58px;height:58px;margin:-29px 0 0 -29px;border-radius:50%;display:grid;place-items:center;' +
      'background:rgb(var(--theme-done));color:#ffffff;font:900 30px/1 system-ui,sans-serif;' +
      'box-shadow:inset 0 0 0 3px rgba(255,255,255,.4),0 6px 14px rgba(var(--theme-ink-deep),.35);',
    donde,
    SELLO_MS + 50,
    70,
    '✓'
  )
  el.animate?.(
    [
      { opacity: 0, scale: '1.9' },
      { opacity: 1, scale: '0.92', offset: 0.28 },
      { opacity: 1, scale: '1', offset: 0.4 },
      { opacity: 1, scale: '1', offset: 0.82 },
      { opacity: 0, scale: '1' },
    ],
    { duration: SELLO_MS, easing: 'cubic-bezier(.3,.7,.2,1)', fill: 'forwards' }
  )
  return true
}

/**
 * Tocar a un compañero: la cámara lo deja en el tercio de arriba (la ficha tapa la mitad de abajo) y un anillo se
 * abre una vez. Sin cambiar la inclinación (el 2D/3D es del jugador). Devuelve si la cámara se anima.
 */
export function encuadrarJugador(
  mapa: CamaraDeEfectos,
  donde: Punto,
  matchMedia: ConsultaDeMedios = consultaDeLaVentana()
): boolean {
  const reducido = prefiereMenosMovimiento(matchMedia)
  mapa.easeTo({
    center: [donde.lon, donde.lat],
    zoom: Math.max(mapa.getZoom(), 18),
    offset: [0, -mapa.getContainer().clientHeight * 0.22],
    duration: reducido ? 0 : ENCUADRE_MS,
  })
  if (reducido) return false
  pieza(
    mapa,
    'width:90px;height:90px;margin:-45px 0 0 -45px;border-radius:50%;border:3px solid var(--theme-primary);',
    donde,
    1250
  ).animate?.(
    [
      { scale: '0.3', opacity: 0.9 },
      { scale: '1.6', opacity: 0 },
    ],
    { duration: 1200, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' }
  )
  return true
}

/** Fin de ruta: la cámara se aleja hasta que se ven todos los nodos (2 s; con «reducir movimiento», de golpe). */
export function verRutaEntera(
  mapa: CamaraDeEfectos,
  nodos: ReadonlyArray<{ lat?: unknown; lon?: unknown }>,
  matchMedia: ConsultaDeMedios = consultaDeLaVentana()
): boolean {
  const puntos = nodos.filter(
    (n) => typeof n.lat === 'number' && typeof n.lon === 'number'
  ) as Punto[]
  if (puntos.length < 2) return false
  const lons = puntos.map((p) => p.lon)
  const lats = puntos.map((p) => p.lat)
  mapa.fitBounds(
    [
      [Math.min(...lons), Math.min(...lats)],
      [Math.max(...lons), Math.max(...lats)],
    ],
    {
      padding: { top: 140, bottom: 220, left: 50, right: 50 },
      bearing: mapa.getBearing(),
      pitch: mapa.getPitch(),
      maxZoom: 17.5,
      duration: prefiereMenosMovimiento(matchMedia) ? 0 : VER_RUTA_MS,
    }
  )
  return true
}

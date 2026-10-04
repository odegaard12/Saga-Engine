/**
 * Que la pantalla vuelva a su sitio al cerrar el teclado (iPhone).
 *
 * Al enfocar un campo, iOS Safari desplaza el VISUAL viewport (y a veces la página) para que el campo
 * quede a la vista: la pantalla «sube» y con ella los botones de abajo. Al cerrar el teclado NO siempre
 * lo deshace: se queda la pantalla desplazada, con una franja vacía abajo, hasta que se toca otra cosa.
 *
 * La app del jugador no tiene scroll de página (`body { overflow: hidden }`), así que su sitio es
 * siempre el (0, 0): cuando no hay un campo con el foco y el teclado se ha ido, se vuelve a (0, 0) y se
 * avisa a quien mide la pantalla (`resize`). La altura del teclado NUNCA entra en el diseño base de la
 * app (que sigue siendo `100dvh`): sólo se repone la posición.
 *
 * Lo que no se puede probar sin un iPhone de verdad: el momento exacto en que Safari termina de
 * animar el teclado (por eso se reintenta a 120, 450 y 900 ms) y si deja o no el visual viewport
 * desplazado en cada versión de iOS.
 */

export type MedidaVisualCompleta = {
  height: number
  offsetTop: number
  pageTop?: number
} | null | undefined

/** Un campo donde se escribe (el teclado sale con él). */
export function esCampoDeTexto(el: Element | null | undefined): boolean {
  if (!el || !(el instanceof HTMLElement)) return false
  if (el.isContentEditable) return true
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true
  if (el instanceof HTMLInputElement) {
    return !['button', 'submit', 'checkbox', 'radio', 'range', 'file', 'color', 'image', 'reset'].includes(el.type)
  }
  return false
}

/** Margen por debajo del cual la diferencia entre ventana y área visible no es un teclado (barras del navegador). */
export const ALTO_MINIMO_DE_TECLADO_PX = 160

/** ¿El área visible es claramente menor que la ventana? En iOS y Android la ventana no encoge con el teclado: el visual viewport sí. */
export function tecladoAbierto(medida: MedidaVisualCompleta, alturaVentana: number): boolean {
  if (!medida || !Number.isFinite(medida.height) || !Number.isFinite(alturaVentana)) return false
  return alturaVentana - medida.height > ALTO_MINIMO_DE_TECLADO_PX
}

/** ¿Está la pantalla fuera de su sitio? (página desplazada o visual viewport corrido hacia abajo). */
export function estaDesplazada(medida: MedidaVisualCompleta, scrollX: number, scrollY: number): boolean {
  const corrida = medida ? Math.max(medida.offsetTop || 0, medida.pageTop || 0) : 0
  return scrollY > 1 || scrollX > 1 || corrida > 1
}

/** Qué hacer ahora: reponer sólo si no se está escribiendo, no hay teclado y la pantalla está corrida. */
export function hayQueReponer(args: {
  escribiendo: boolean
  medida: MedidaVisualCompleta
  alturaVentana: number
  scrollX: number
  scrollY: number
}): boolean {
  if (args.escribiendo) return false
  if (tecladoAbierto(args.medida, args.alturaVentana)) return false
  return estaDesplazada(args.medida, args.scrollX, args.scrollY)
}

const REINTENTOS_MS = [120, 450, 900]

/** Instala los vigilantes. Devuelve la función que los quita. */
export function instalarVistaTrasTeclado(): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => undefined
  const vv = window.visualViewport ?? null
  const raiz = document.documentElement
  const temporizadores = new Set<number>()

  const reponer = () => {
    const escribiendo = esCampoDeTexto(document.activeElement)
    raiz.dataset.teclado = !escribiendo ? '' : tecladoAbierto(vv, window.innerHeight) ? 'abierto' : 'enfocado'
    if (
      !hayQueReponer({
        escribiendo,
        medida: vv,
        alturaVentana: window.innerHeight,
        scrollX: window.scrollX,
        scrollY: window.scrollY,
      })
    )
      return
    window.scrollTo(0, 0)
    // Algunos Safari desplazan el cuerpo o la raíz y no la ventana.
    document.body.scrollTop = 0
    raiz.scrollTop = 0
    // Quien mide la pantalla (el mapa, la hoja de la tienda) la vuelve a medir.
    window.dispatchEvent(new Event('resize'))
  }

  const programar = () => {
    for (const ms of REINTENTOS_MS) {
      const id = window.setTimeout(() => {
        temporizadores.delete(id)
        reponer()
      }, ms)
      temporizadores.add(id)
    }
  }

  const alSalirDelCampo = () => programar()
  const alCambiarVisual = () => reponer()
  const alVolver = () => {
    if (document.visibilityState === 'visible') programar()
  }

  document.addEventListener('focusout', alSalirDelCampo, true)
  document.addEventListener('focusin', alCambiarVisual, true)
  vv?.addEventListener('resize', alCambiarVisual)
  vv?.addEventListener('scroll', alCambiarVisual)
  window.addEventListener('orientationchange', alVolver)
  window.addEventListener('pageshow', alVolver)
  document.addEventListener('visibilitychange', alVolver)
  reponer()

  return () => {
    document.removeEventListener('focusout', alSalirDelCampo, true)
    document.removeEventListener('focusin', alCambiarVisual, true)
    vv?.removeEventListener('resize', alCambiarVisual)
    vv?.removeEventListener('scroll', alCambiarVisual)
    window.removeEventListener('orientationchange', alVolver)
    window.removeEventListener('pageshow', alVolver)
    document.removeEventListener('visibilitychange', alVolver)
    temporizadores.forEach((id) => window.clearTimeout(id))
    delete raiz.dataset.teclado
  }
}

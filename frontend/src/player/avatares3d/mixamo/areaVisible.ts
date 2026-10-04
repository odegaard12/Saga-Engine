import { useEffect } from 'react'
import { tecladoAbierto } from '../../utils/vistaTrasTeclado'

/**
 * El área que de verdad ve el jugador, para las hojas a pantalla completa (tienda de ropa,
 * menú de gestos).
 *
 * Un `position: fixed; inset: 0` mide la ventana de diseño, y en un móvil esa ventana no es lo que
 * se ve: la barra de direcciones que sube y baja, la barra de navegación de Android o la
 * pestaña de iOS dejan parte de la hoja por DEBAJO (el botón «Listo» y las pestañas quedaban
 * tapadas). `visualViewport` sí dice lo que se ve. Se publica en dos variables CSS de la raíz
 * (`--saga-area-alto`, `--saga-area-top`) con la que la hoja se dimensiona; sin `visualViewport` (o
 * sin medida) no se escribe nada y vale el `100dvh` del CSS.
 *
 * Con el TECLADO abierto (el área visible es mucho menor que la ventana) tampoco se escribe nada: la
 * altura del teclado no es la de la hoja, y en iOS el visual viewport queda corrido hasta que se cierra
 * (ver `vistaTrasTeclado.ts`). La hoja de la tienda no tiene campos de texto, así que esto es sólo
 * un seguro por si otro campo deja el teclado abierto debajo.
 */

export type MedidaVisual = { height: number; offsetTop: number } | null | undefined

/** Las dos variables CSS para una medida del área visible; vacío si la medida no sirve. */
export function variablesDeArea(
  medida: MedidaVisual,
  alturaVentana: number
): Record<string, string> {
  if (tecladoAbierto(medida, alturaVentana)) return {}
  const alto =
    medida && Number.isFinite(medida.height) && medida.height > 0 ? medida.height : alturaVentana
  if (!Number.isFinite(alto) || alto < 120) return {}
  const arriba = medida && Number.isFinite(medida.offsetTop) ? Math.max(0, medida.offsetTop) : 0
  return {
    '--saga-area-alto': `${Math.round(alto)}px`,
    '--saga-area-top': `${Math.round(arriba)}px`,
  }
}

const NOMBRES = ['--saga-area-alto', '--saga-area-top']

/** Mantiene las variables mientras la hoja está abierta y las quita al cerrarla. */
export function useAreaVisible(): void {
  useEffect(() => {
    const raiz = document.documentElement
    const vv = window.visualViewport ?? null
    const aplicar = () => {
      const v = variablesDeArea(vv, window.innerHeight)
      for (const n of NOMBRES) {
        if (v[n]) raiz.style.setProperty(n, v[n])
        else raiz.style.removeProperty(n)
      }
    }
    aplicar()
    vv?.addEventListener('resize', aplicar)
    vv?.addEventListener('scroll', aplicar)
    window.addEventListener('resize', aplicar)
    window.addEventListener('orientationchange', aplicar)
    return () => {
      vv?.removeEventListener('resize', aplicar)
      vv?.removeEventListener('scroll', aplicar)
      window.removeEventListener('resize', aplicar)
      window.removeEventListener('orientationchange', aplicar)
      for (const n of NOMBRES) raiz.style.removeProperty(n)
    }
  }, [])
}

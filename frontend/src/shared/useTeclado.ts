import { useEffect, useState } from 'react'
import { tecladoAbierto } from '../player/utils/vistaTrasTeclado'

/**
 * Lo que se ve con el TECLADO abierto, para que lo que se escribe no quede debajo (revisión 20/10).
 *
 * En iPhone el teclado no encoge la ventana: un `position: fixed; inset: 0` sigue midiendo la ventana entera y su
 * parte de abajo (el campo de la clave, el botón «Entrar», la casilla del código de respaldo) queda TAPADA por el
 * teclado, sin poder desplazarse. `visualViewport` sí dice lo que se ve.
 *
 * Sólo da medida con el teclado abierto; cerrado devuelve `null` y el diseño de siempre manda (5.49 tocaba alturas
 * siempre y dejó una franja en iPhone: ver vistaTrasTeclado.ts).
 */
export type HuecoVisible = { alto: number; arriba: number; tapado: number }

export function huecoConTeclado(
  medida: { height: number; offsetTop: number } | null | undefined,
  alturaVentana: number
): HuecoVisible | null {
  if (!medida || !tecladoAbierto(medida, alturaVentana)) return null
  const alto = Math.round(medida.height)
  const arriba = Math.max(0, Math.round(medida.offsetTop || 0))
  return { alto, arriba, tapado: Math.max(0, Math.round(alturaVentana - alto - arriba)) }
}

export function useTeclado(): HuecoVisible | null {
  const [hueco, setHueco] = useState<HuecoVisible | null>(null)
  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null
    if (!vv) return undefined
    const medir = () => {
      const nuevo = huecoConTeclado(vv, window.innerHeight)
      setHueco((previo) =>
        previo?.alto === nuevo?.alto && previo?.arriba === nuevo?.arriba ? previo : nuevo
      )
    }
    medir()
    vv.addEventListener('resize', medir)
    vv.addEventListener('scroll', medir)
    window.addEventListener('resize', medir)
    return () => {
      vv.removeEventListener('resize', medir)
      vv.removeEventListener('scroll', medir)
      window.removeEventListener('resize', medir)
    }
  }, [])
  return hueco
}

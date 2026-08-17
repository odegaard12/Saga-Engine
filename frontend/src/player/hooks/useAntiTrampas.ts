import { useEffect, useRef, useState } from 'react'

/**
 * Salir de la aplicación en medio de un reto tiene consecuencia.
 *
 * Hasta ahora no había ninguna: nada miraba si el jugador se iba del juego,
 * buscaba la respuesta y volvía. Con un mosaico o un Simón delante, salir y
 * volver era gratis.
 *
 * Lo que hace, y por qué así:
 *
 *  1. **Reinicia el reto.** Es la parte que de verdad quita la ventaja: al
 *     volver, el patrón es otro y lo que hubiera memorizado fuera ya no vale.
 *     Castiga la trampa, no el descuido.
 *
 *  2. **Suma tiempo.** Treinta segundos por salida, que se anotan como
 *     penalización del nodo igual que el código de respaldo.
 *
 *  3. **Lo cuenta.** El jugador ve que ha pasado y por qué; sin eso, un patrón
 *     que se reinicia solo parece un fallo de la aplicación.
 *
 * ⚠️ No distingue una trampa de una llamada entrante. Nadie puede: el navegador
 * sólo dice que la página dejó de estar visible. Por eso la penalización es
 * moderada y se avisa antes de empezar, en vez de intentar adivinar intenciones.
 */

/** Lo que cuesta cada salida, en milisegundos. */
export const PENALIZACION_POR_SALIDA_MS = 30_000

/**
 * Salidas más cortas que esto no cuentan.
 *
 * Bajar la persiana de notificaciones, que el móvil apague la pantalla un
 * segundo o un cambio de aplicación fallido dejan la página oculta un instante.
 * Buscar una respuesta fuera lleva más.
 */
const SALIDA_MINIMA_MS = 1_500

export type AntiTrampas = {
  /** Veces que ha salido de la aplicación durante este reto. */
  salidas: number
  /** Lo que suman esas salidas, para el tiempo del nodo. */
  penalizacionMs: number
  /** Cambia en cada salida: úsalo como `key` para rearmar el reto. */
  reinicios: number
  /** Para avisar en pantalla. Se apaga solo. */
  acabaDeVolver: boolean
}

export function useAntiTrampas(activo: boolean, nodoId: string): AntiTrampas {
  const [salidas, setSalidas] = useState(0)
  const [acabaDeVolver, setAcabaDeVolver] = useState(false)
  const salidaDesde = useRef<number | null>(null)

  // Nodo nuevo, cuenta nueva.
  useEffect(() => {
    setSalidas(0)
    setAcabaDeVolver(false)
    salidaDesde.current = null
  }, [nodoId])

  useEffect(() => {
    if (!activo) {
      salidaDesde.current = null
      return
    }

    const alCambiar = () => {
      if (document.visibilityState === 'hidden') {
        salidaDesde.current = Date.now()
        return
      }

      const desde = salidaDesde.current
      salidaDesde.current = null

      if (!desde) return
      if (Date.now() - desde < SALIDA_MINIMA_MS) return

      setSalidas((n) => n + 1)
      setAcabaDeVolver(true)
    }

    document.addEventListener('visibilitychange', alCambiar)

    // `pagehide` es lo que dispara iOS al cambiar de aplicación, donde
    // `visibilitychange` no siempre llega.
    const alIrse = () => {
      if (salidaDesde.current === null) salidaDesde.current = Date.now()
    }
    window.addEventListener('pagehide', alIrse)

    return () => {
      document.removeEventListener('visibilitychange', alCambiar)
      window.removeEventListener('pagehide', alIrse)
    }
  }, [activo, nodoId])

  // El aviso se apaga solo: es para enterarse, no para tener que cerrarlo.
  useEffect(() => {
    if (!acabaDeVolver) return
    const id = window.setTimeout(() => setAcabaDeVolver(false), 6000)
    return () => window.clearTimeout(id)
  }, [acabaDeVolver])

  return {
    salidas,
    penalizacionMs: salidas * PENALIZACION_POR_SALIDA_MS,
    reinicios: salidas,
    acabaDeVolver,
  }
}

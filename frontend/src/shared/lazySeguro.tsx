import { lazy, useEffect, useState, type ComponentType } from 'react'

/**
 * `React.lazy`, pero que no tumba la partida si la pieza no se puede bajar.
 *
 * Revisión 19/10 (prueba con navegador real): quien entra con «Entrar igualmente» antes de que se guarden todas las
 * piezas de la app y luego se queda sin cobertura, al necesitar una de ellas (la clasificación, una hoja, un
 * minijuego) veía «SAGA Engine no pudo cargarse correctamente»: el fallo de la importación subía hasta el
 * ErrorBoundary de arriba y se llevaba la app entera. Ahora en su lugar no se pinta nada (en un minijuego, la hoja
 * sigue ofreciendo el código de respaldo) y se reintenta sola al volver la red y cada 30 s.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- igual que `React.lazy`: vale para cualquier componente */
type Cargador<T extends ComponentType<any>> = () => Promise<{ default: T }>

export function lazySeguro<T extends ComponentType<any>>(cargar: Cargador<T>) {
  return lazy<T>(async () => {
    try {
      return await cargar()
    } catch {
      return { default: piezaQueReintenta(cargar) as unknown as T }
    }
  })
}

function piezaQueReintenta(cargar: Cargador<ComponentType<any>>): ComponentType<any> {
  let cargada: ComponentType<any> | null = null

  return function PiezaPendiente(props: any) {
    const [Pieza, setPieza] = useState<ComponentType<any> | null>(() => cargada)

    useEffect(() => {
      if (Pieza) return undefined
      let viva = true
      const intentar = () => {
        if (typeof navigator !== 'undefined' && navigator.onLine === false) return
        cargar()
          .then((m) => {
            cargada = m.default
            if (viva) setPieza(() => m.default)
          })
          .catch(() => undefined)
      }
      window.addEventListener('online', intentar)
      const reloj = window.setInterval(intentar, 30_000)
      return () => {
        viva = false
        window.removeEventListener('online', intentar)
        window.clearInterval(reloj)
      }
    }, [Pieza])

    return Pieza ? <Pieza {...props} /> : null
  }
}

import { useEffect, useRef } from 'react'

/**
 * El botón Atrás de Android (o el gesto de volver) cierra la hoja que está abierta en vez de sacar al jugador de la
 * partida (30/10). Cada hoja abierta mete una entrada en el historial con la MISMA dirección; Atrás la saca y cierra
 * sólo la de arriba. Si la hoja se cierra con su ×, se quita su entrada para que Atrás no quede «gastado».
 */
type Entrada = { cerrar: () => void }
const pila: Entrada[] = []
let ignorar = 0

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    if (ignorar > 0) {
      ignorar -= 1
      return
    }
    pila.pop()?.cerrar()
  })
}

export function useAtrasCierra(abierto: boolean, cerrar: () => void) {
  const ref = useRef(cerrar)
  ref.current = cerrar
  useEffect(() => {
    if (!abierto || typeof window === 'undefined') return undefined
    let porAtras = false
    const entrada: Entrada = {
      cerrar: () => {
        porAtras = true
        ref.current()
      },
    }
    pila.push(entrada)
    window.history.pushState({ sagaHoja: true }, '')
    return () => {
      const i = pila.indexOf(entrada)
      if (i >= 0) pila.splice(i, 1)
      if (!porAtras) {
        ignorar += 1
        window.history.back()
      }
    }
  }, [abierto])
}

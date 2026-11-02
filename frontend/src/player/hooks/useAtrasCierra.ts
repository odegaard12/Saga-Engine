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

/**
 * Quitar la entrada del historial de una hoja que se cierra con su × NO puede ser un `history.back()` inmediato.
 *
 * `back()` es asíncrono y se cuenta desde la entrada en la que esté el historial CUANDO se ejecuta. Si en el mismo
 * instante se abre otra hoja (menú de gestos → tienda, ficha → tienda), su `pushState` ya está hecho y el `back()` que
 * quedó pendiente se llevaba POR DELANTE la entrada de la hoja nueva: la tienda se abría sin entrada, y al cerrarla
 * el segundo `back()` sacaba al jugador de su partida (al login, 1/11, 6.2.0). Ahora los `back()` se juntan: una hoja
 * que se abre al mismo tiempo reutiliza la entrada de la que se va, y sólo lo que sobra se devuelve (tras un tic).
 */
let sobran = 0
let vaciando = false

function devolverLoQueSobra() {
  vaciando = false
  if (sobran <= 0 || typeof window === 'undefined') return
  const n = sobran
  sobran = 0
  ignorar += n
  window.history.go(-n)
}

/** Registra una hoja abierta (y su entrada en el historial). Devuelve cómo cerrarla (sin Atrás). */
export function abrirHoja(cerrar: () => void): () => void {
  let porAtras = false
  const entrada: Entrada = {
    cerrar: () => {
      porAtras = true
      cerrar()
    },
  }
  pila.push(entrada)
  if (sobran > 0) sobran -= 1
  else window.history.pushState({ sagaHoja: true }, '')
  return () => {
    const i = pila.indexOf(entrada)
    if (i >= 0) pila.splice(i, 1)
    if (porAtras) return
    sobran += 1
    if (!vaciando) {
      vaciando = true
      window.setTimeout(devolverLoQueSobra, 0)
    }
  }
}

export function useAtrasCierra(abierto: boolean, cerrar: () => void) {
  const ref = useRef(cerrar)
  ref.current = cerrar
  useEffect(() => {
    if (!abierto || typeof window === 'undefined') return undefined
    return abrirHoja(() => ref.current())
  }, [abierto])
}

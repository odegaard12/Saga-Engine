/**
 * `setInterval` que se para con la pantalla oculta (bloqueada, otra app) y, al volver, se pone al día al momento y
 * sigue. Sirve para los sondeos de adorno de la interfaz: con el móvil en el bolsillo no hay nadie a quien enseñárselo.
 * Devuelve cómo pararlo del todo (el `return` de un `useEffect`).
 */
export function cadaMientrasVisible(accion: () => void, ms: number): () => void {
  let id: number | undefined
  const arrancar = () => {
    if (id === undefined) id = window.setInterval(accion, ms)
  }
  const parar = () => {
    if (id !== undefined) {
      window.clearInterval(id)
      id = undefined
    }
  }
  const alCambiar = () => {
    if (document.visibilityState === 'hidden') parar()
    else {
      accion()
      arrancar()
    }
  }
  if (document.visibilityState !== 'hidden') arrancar()
  document.addEventListener('visibilitychange', alCambiar)
  return () => {
    parar()
    document.removeEventListener('visibilitychange', alCambiar)
  }
}

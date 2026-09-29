/**
 * ¿Hay red ahora mismo? Lo que dicen las últimas peticiones, no el icono.
 *
 * `navigator.onLine` sólo sabe si hay una interfaz de red: con una barra de
 * cobertura dice «online» y las peticiones se cuelgan ocho segundos cada una.
 * Sin esto, cada nodo completado en un tramo malo empezaba por esperar ese
 * corte antes de guardarse en el móvil, y cinco nodos seguidos eran casi un
 * minuto de pantalla congelada.
 *
 * Aquí sólo se apunta qué pasó con la última petición de verdad. Quien decide
 * qué hacer con ello es quien pregunta.
 */

let ultimoFallo = 0
let ultimoExito = 0

/** Una petición no llegó (corte, tiempo agotado). NO vale para un 4xx/5xx. */
export function notarFalloDeRed(): void {
  ultimoFallo = Date.now()
}

/** Una petición llegó y el servidor contestó, con el código que fuera. */
export function notarRedOk(): void {
  ultimoExito = Date.now()
}

/** Un error de `fetch` sin respuesta HTTP es la red; con `status`, es el servidor. */
export function esFalloDeRed(error: unknown): boolean {
  const estado = (error as { status?: number } | null)?.status
  return typeof estado !== 'number'
}

/**
 * ¿Conviene ir directo al almacén local, sin gastar un corte de red antes?
 *
 * Sí si el navegador sabe que no hay red, o si lo último que pasó fue un fallo
 * y fue hace poco. Pasada la ventana se vuelve a intentar: la cobertura vuelve.
 */
export function sinCoberturaAhora(ventanaMs = 45_000): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  return ultimoFallo > ultimoExito && Date.now() - ultimoFallo < ventanaMs
}

/** Sólo para pruebas. */
export function olvidarEstadoDeRed(): void {
  ultimoFallo = 0
  ultimoExito = 0
}

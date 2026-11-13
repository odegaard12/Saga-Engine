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

/**
 * Volvió la red tras un fallo, aunque el navegador no lo anunciase: iOS a menudo no dispara 'online' al recuperar la
 * cobertura, y sin eso 'saga:red-ok' (PlayerApp) no salía nunca y lo que espera a la red esperaba para siempre.
 */
let redRecuperada = false

/** Una petición llegó y el servidor contestó, con el código que fuera. */
export function notarRedOk(): void {
  if (ultimoFallo > ultimoExito) redRecuperada = true
  ultimoExito = Date.now()
}

/**
 * Lo que contestó el servidor, por su código. 502-504 y los 52x son la pasarela (Cloudflare) diciendo que no llega a
 * la Raspberry: para el jugador eso es «sin cobertura», no «hay red». 5/11: con las Pis caídas la app decía
 * «Sincronizando…» para siempre en vez de «Sin cobertura · todo se guarda en tu móvil».
 */
export function notarRespuesta(estado: number): void {
  if (estado >= 502 && estado <= 599) {
    notarFalloDeRed()
    return
  }
  notarRedOk()
  // 13/11: un 401 es la clave de la misión que caducó (7 días) o que se cambió: toda la API contesta igual, y la cola
  // se queda guardada pero no sube. Un éxito lo desmiente. (Un 403 lo apunta quien sabe que es de sesión: la cola.)
  if (estado === 401) notarAccesoCaducado()
  else if (estado >= 200 && estado < 300) notarAccesoValido()
}

let accesoCaducado = false

/** El servidor rechaza el acceso (clave de misión o sesión caducadas), aunque haya red. */
export function notarAccesoCaducado(): void {
  accesoCaducado = true
}

/** Algo se aceptó: el acceso vale. */
export function notarAccesoValido(): void {
  accesoCaducado = false
}

export function accesoHaCaducado(): boolean {
  return accesoCaducado
}

/** ¿Llegó algo después de un fallo de red desde la última vez que se preguntó? Contesta `true` una sola vez. */
export function consumirRedRecuperada(): boolean {
  const habia = redRecuperada
  redRecuperada = false
  return habia
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

/**
 * ¿Conexión lenta o «ahorro de datos» activado? (Network Information API: Chrome/Android; Safari no la da.)
 * Vivía en PlayerApp; aquí la usan también las fotos de la cola (revisión 19/10).
 */
export function conexionAhorradora(): boolean {
  if (typeof navigator === 'undefined') return false
  const c = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection
  return Boolean(c?.saveData) || /(^|-)2g$/.test(String(c?.effectiveType || ''))
}

/**
 * ¿Con datos móviles (o «ahorro de datos»)? Sólo Chrome/Android da `connection.type`; Safari no, y allí no se avisa.
 * La primera descarga de la ruta (mapa + modelos) ronda los 300 MB.
 */
export function conDatosMoviles(): boolean {
  if (typeof navigator === 'undefined') return false
  const c = (navigator as Navigator & { connection?: { saveData?: boolean; type?: string } }).connection
  return Boolean(c?.saveData) || c?.type === 'cellular'
}

/**
 * ¿Red para subir la foto ORIGINAL (1-2 MB)? Más exigente que `conexionAhorradora`: tampoco 3G, ni una conexión que
 * el navegador mida por debajo de 1 Mbit/s. Safari no da esta información: allí se sube y, si se corta, se reintenta
 * con espera creciente (la subida de la ligera, que es lo que importa con mala cobertura, ya se hizo).
 */
export function redBuenaParaOriginales(): boolean {
  if (typeof navigator === 'undefined') return true
  if (conexionAhorradora()) return false
  const c = (navigator as Navigator & { connection?: { effectiveType?: string; downlink?: number } }).connection
  if (/^(slow-2g|2g|3g)$/.test(String(c?.effectiveType || ''))) return false
  return !(typeof c?.downlink === 'number' && c.downlink > 0 && c.downlink < 1)
}

/** Sólo para pruebas. */
export function olvidarEstadoDeRed(): void {
  ultimoFallo = 0
  ultimoExito = 0
  redRecuperada = false
  accesoCaducado = false
}

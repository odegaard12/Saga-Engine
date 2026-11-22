/**
 * Una petición con límite de tiempo.
 *
 * Con la cobertura del monte una conexión no falla: se queda colgada. Sin límite,
 * un lote de teselas o un archivo de la aplicación esperaba lo que quisiera el
 * navegador (minutos) y la barra de la pantalla de carga se quedaba parada. El
 * límite cuenta hasta que llegan las CABECERAS de la respuesta: un cuerpo grande
 * (la red de caminos son varios MB) puede tardar lo que tarde en bajar.
 */
export async function fetchConLimite(
  input: RequestInfo | URL,
  init: RequestInit = {},
  limiteMs = 20000
): Promise<Response> {
  const control = new AbortController()
  const externa = init.signal
  const alAbortar = () => control.abort()

  if (externa) {
    if (externa.aborted) control.abort()
    else externa.addEventListener('abort', alAbortar, { once: true })
  }

  const temporizador = setTimeout(() => control.abort(), limiteMs)

  try {
    return await fetch(input, { ...init, signal: control.signal })
  } finally {
    clearTimeout(temporizador)
    externa?.removeEventListener('abort', alAbortar)
  }
}

/**
 * 22/11 (cargas): ¿ahora mismo no se puede bajar nada? Sin red, o con la pantalla apagada/la app en segundo plano: el
 * iPhone congela la página y cada petición falla, aunque la cobertura sea buena. Un fallo en ese estado no es de la
 * red: la pantalla de carga espera a que vuelva en vez de gastar sus reintentos (y, en el mapa, pasar a pedir las
 * teselas de una en una, diez veces más lento).
 */
export function noSePuedeBajarAhora(): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  return typeof document !== 'undefined' && document.visibilityState === 'hidden'
}

/** Espera (sin límite) a que se pueda bajar otra vez, o a que se cancele. */
export async function esperarAQueSePuedaBajar(cancelado: () => boolean = () => false, cadaMs = 2000): Promise<void> {
  while (!cancelado() && noSePuedeBajarAhora()) await new Promise<void>((resolver) => setTimeout(resolver, cadaMs))
}

/**
 * Un cuerpo JSON comprimido con gzip si el navegador sabe (`CompressionStream`); si no, el texto tal cual.
 *
 * Nació en la caja negra; la cola de avances lo usa también desde la revisión 19/10: con una barra de 2G, una tanda
 * de eventos (JSON muy repetitivo) baja a una fracción y sale antes de que se corte la cobertura. Quien lo usa pone
 * `Content-Encoding: gzip` sólo si `gzip` es verdadero: el servidor acepta las dos cosas.
 */
export async function cuerpoGzip(texto: string): Promise<{ body: BodyInit; gzip: boolean }> {
  if (typeof CompressionStream === 'undefined') return { body: texto, gzip: false }
  try {
    const flujo = new Blob([texto]).stream().pipeThrough(new CompressionStream('gzip'))
    return { body: await new Response(flujo).blob(), gzip: true }
  } catch {
    return { body: texto, gzip: false }
  }
}

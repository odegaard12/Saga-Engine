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

/** 23/11: sin un byte durante este tiempo, el cuerpo se da por colgado. */
export const PARON_DEL_CUERPO_MS = 20000

/**
 * 23/11 (auditoría Slow 4G: la primera carga no terminaba): una petición que se aborta sólo si se PARA.
 *
 * El 22/11 el límite del lote pasó a cubrir también el cuerpo (30 s), pero a 1,44 Mbit/s un lote de relieve de 1,2 a
 * 3,1 MB tarda 45-80 s en bajar: se abortaba SIEMPRE, tres veces, y se bajaba de una en una (109 MB para 50).
 * Ahora: `esperaMs` hasta las cabeceras, y luego `paronMs` sin llegar NADA (cada trozo lo reinicia); `maximoMs` es
 * sólo un seguro. Devuelve la respuesta y el cuerpo entero; abortado o cortado, lanza: nunca sale un cuerpo a medias.
 * Salvo con `aMedias`: entonces un cuerpo parado o cortado tras las cabeceras sale con `cortado: true` y lo que llegó
 * (el lote: quien lo lee se queda con las teselas enteras y pide sólo las demás, en vez de bajarlo todo otra vez).
 */
export async function fetchSinParon(
  input: RequestInfo | URL,
  init: RequestInit,
  tiempos: { esperaMs: number; paronMs?: number; maximoMs: number; aMedias?: boolean }
): Promise<{ respuesta: Response; cuerpo: ArrayBuffer; cortado: boolean }> {
  const control = new AbortController()
  let paron = setTimeout(() => control.abort(), tiempos.esperaMs)
  const tope = setTimeout(() => control.abort(), tiempos.maximoMs)
  const latido = () => {
    clearTimeout(paron)
    paron = setTimeout(() => control.abort(), tiempos.paronMs ?? PARON_DEL_CUERPO_MS)
  }
  try {
    const respuesta = await fetch(input, { ...init, signal: control.signal })
    latido()
    if (!respuesta.body) return { respuesta, cuerpo: await respuesta.arrayBuffer(), cortado: false }
    const lector = respuesta.body.getReader()
    // Si el navegador no corta el cuerpo al abortar, se corta aquí (y abajo se ve que fue abortado).
    control.signal.addEventListener('abort', () => void lector.cancel().catch(() => undefined), { once: true })
    const trozos: Uint8Array[] = []
    let total = 0
    let cortado = false
    for (;;) {
      let leido: ReadableStreamReadResult<Uint8Array>
      try {
        leido = await lector.read()
      } catch (error) {
        if (!tiempos.aMedias) throw error
        cortado = true
        break
      }
      if (leido.done) break
      if (leido.value?.byteLength) {
        trozos.push(leido.value)
        total += leido.value.byteLength
        latido()
      }
    }
    if (control.signal.aborted) {
      if (!tiempos.aMedias) throw new Error('AbortError: cuerpo parado')
      cortado = true
    }
    const cuerpo = new Uint8Array(total)
    let o = 0
    for (const t of trozos) {
      cuerpo.set(t, o)
      o += t.byteLength
    }
    return { respuesta, cuerpo: cuerpo.buffer as ArrayBuffer, cortado }
  } finally {
    clearTimeout(paron)
    clearTimeout(tope)
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

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

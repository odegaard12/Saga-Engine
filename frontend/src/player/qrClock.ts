/**
 * Reloj de los nodos de pegatina QR.
 *
 * Estos nodos no son como los demás. En un minijuego el tiempo empieza cuando
 * el jugador pulsa Comenzar, porque hasta entonces sólo está leyendo. Aquí la
 * prueba ES buscar la pegatina por el monte: en cuanto se llega al nodo ya se
 * está jugando, aunque no se haya abierto la cámara.
 *
 * Antes arrancaba al abrir la cámara, así que quien tardaba cinco minutos en
 * dar con la pegatina y luego escaneaba en un segundo salía con un segundo. Lo
 * que costaba de verdad no contaba.
 *
 * El instante de arranque vive en el almacén del móvil por jugador y nodo, así
 * que aguanta cerrar la cámara, cambiar de pantalla y recargar la aplicación.
 */

const PREFIJO = 'saga:qr-inicio:'

function clave(user: string, payload: string) {
  return `${PREFIJO}${user}:${payload || 'nodo'}`
}

function leer(user: string, payload: string): number {
  if (typeof window === 'undefined') return 0
  try {
    const valor = Number(window.localStorage.getItem(clave(user, payload)))
    return Number.isFinite(valor) && valor > 0 ? valor : 0
  } catch {
    return 0
  }
}

/**
 * Marca que el jugador ya está en el nodo. Si ya estaba marcado respeta el
 * original: volver a entrar no reinicia la cuenta.
 */
export function marcarInicioQr(user: string, payload: string): number {
  const existente = leer(user, payload)
  if (existente) return existente

  const ahora = Date.now()
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(clave(user, payload), String(ahora))
    } catch {
      // Sin almacenamiento el reloj cuenta desde ahora y ya está.
    }
  }
  return ahora
}

/** Milisegundos desde que se llegó al nodo. 0 si todavía no se llegó. */
export function tempoDoQr(user: string, payload: string): number {
  const inicio = leer(user, payload)
  if (!inicio) return 0
  return Math.max(0, Date.now() - inicio)
}

/** Se llama al validar la pegatina: el reloj de ese nodo ya no hace falta. */
export function pecharQr(user: string, payload: string) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(clave(user, payload))
  } catch {
    // Nada que hacer.
  }
}

/** Borra los relojes QR de todos los nodos: al resetear la partida. */
export function limparRelojesQr(user: string) {
  if (typeof window === 'undefined') return
  try {
    const prefijo = `${PREFIJO}${user}:`
    Object.keys(window.localStorage)
      .filter((k) => k.startsWith(prefijo))
      .forEach((k) => window.localStorage.removeItem(k))
  } catch {
    // Nada que hacer.
  }
}

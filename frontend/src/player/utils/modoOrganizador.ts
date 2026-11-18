/**
 * 20/11: MODO ORGANIZADOR, oculto y sólo en ESTE dispositivo. Lo desbloquean 7 pulsaciones seguidas (cada una a menos de
 * 1,5 s de la anterior) sobre la insignia de versión de Ferramentas. Con él aparecen «Simular ubicación (debug)» y el
 * panel de diagnóstico del mapa; sin él, ninguno de los dos existe para el jugador (trampas con la ubicación simulada).
 * El servidor ya marca esos avances como `modo_prueba` (main.py: `es_modo_prueba`), así que esto sólo esconde la interfaz.
 */
export const CLAVE_ORGANIZADOR = 'saga:organizador'
export const TOQUES_PARA_ORGANIZADOR = 7
export const PAUSA_MAXIMA_ENTRE_TOQUES_MS = 1500
export const EVENTO_ORGANIZADOR = 'saga:organizador-cambio'

type Almacen = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

function almacenLocal(): Almacen | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

export function organizadorActivo(almacen: Pick<Storage, 'getItem'> | null = almacenLocal()): boolean {
  try {
    return almacen?.getItem(CLAVE_ORGANIZADOR) === '1'
  } catch {
    return false
  }
}

function avisar(): void {
  try {
    window.dispatchEvent(new Event(EVENTO_ORGANIZADOR))
  } catch {
    // sin window (pruebas)
  }
}

export function activarOrganizador(almacen: Almacen | null = almacenLocal()): void {
  try {
    almacen?.setItem(CLAVE_ORGANIZADOR, '1')
  } catch {
    // sin almacenamiento: no se recuerda
  }
  avisar()
}

export function salirDelOrganizador(almacen: Almacen | null = almacenLocal()): void {
  try {
    almacen?.removeItem(CLAVE_ORGANIZADOR)
  } catch {
    // sin almacenamiento
  }
  avisar()
}

/** Cuenta pulsaciones seguidas: la cuenta vuelve a 1 si pasó más de la pausa máxima. `activar` al llegar a 7. */
export function contarToque(
  antes: { n: number; t: number } | null,
  ahoraMs: number
): { n: number; t: number; activar: boolean } {
  const n = antes && ahoraMs - antes.t < PAUSA_MAXIMA_ENTRE_TOQUES_MS ? antes.n + 1 : 1
  return n >= TOQUES_PARA_ORGANIZADOR ? { n: 0, t: ahoraMs, activar: true } : { n, t: ahoraMs, activar: false }
}

import { getOfflineVaultSummary, type OfflineVaultSummary } from './offlineVault'

/**
 * Abrir la PWA instalada entra directo en tu perfil (14/11, decisión de Óscar).
 *
 * Antes la app instalada arrancaba siempre en la lista de nombres: había que volver a elegirse y, sin PINs, un niño
 * podía tocar el nombre de otro. `saga_remembered_player` se escribía al entrar en una ruta de jugador y nadie lo
 * leía. Ahora, en la portada, si hay un jugador recordado Y el servidor dice que este móvil tiene sesión válida como
 * él, se abre su partida sin pasar por la lista (no se llega a pintar ningún nombre). Sin sesión, sin red y sin datos
 * guardados, o con `?pin=` / `?cambiar` en la dirección, todo sigue como antes. «Cambiar de jugador» (Herramientas) y
 * «No soy yo» (esta portada) olvidan al recordado.
 *
 * Sin React ni red propia al cargarse: se prueba en Node (tests/js/decisiones_14_11.cjs).
 */

export const CLAVE_JUGADOR_RECORDADO = 'saga_remembered_player'

export function leerJugadorRecordado(): string | null {
  try {
    const valor = String(window.localStorage.getItem(CLAVE_JUGADOR_RECORDADO) || '').trim()
    return valor || null
  } catch {
    return null
  }
}

// Tras olvidarlo, nada lo vuelve a escribir hasta recargar la página: al repintar, `getPlayerNameFromLocation` lo
// reescribía antes de que la navegación terminara y «Cambiar de jugador» volvía al mismo (14/11).
let olvidado = false

export function recordarJugador(id: string): void {
  if (olvidado) return
  try {
    window.localStorage.setItem(CLAVE_JUGADOR_RECORDADO, id)
  } catch {
    /* sin almacenamiento tampoco pasa nada */
  }
}

export function olvidarJugadorRecordado(): void {
  olvidado = true
  try {
    window.localStorage.removeItem(CLAVE_JUGADOR_RECORDADO)
  } catch {
    /* sin almacenamiento tampoco pasa nada */
  }
}

/** ¿Se intenta entrar directo? Sólo en la portada, con alguien recordado y sin PIN ni «cambiar» en la dirección. */
export function entradaDirectaPosible(pathname: string, search: string, recordado: string | null): boolean {
  if (!recordado) return false
  if (pathname !== '/' && pathname !== '/player' && pathname !== '/player/') return false
  const params = new URLSearchParams(search)
  return !params.has('pin') && !params.has('cambiar')
}

export type EstadoDeSesion = 'valida' | 'invalida' | 'sin-red'

/** Pregunta al servidor si este móvil tiene sesión como `user`. 200 sí; 401/403/404 no; lo demás (sin red, 5xx, tiempo) = sin red. */
export async function comprobarSesionDelJugador(
  user: string,
  esperaMs = 3000,
  buscar: typeof fetch = (...args) => fetch(...args)
): Promise<EstadoDeSesion> {
  const control = new AbortController()
  const reloj = setTimeout(() => control.abort(), esperaMs)
  try {
    const res = await buscar(`/api/jugador/sesion?user=${encodeURIComponent(user)}`, {
      signal: control.signal,
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    })
    if (res.ok) return 'valida'
    if (res.status === 401 || res.status === 403 || res.status === 404) return 'invalida'
    return 'sin-red'
  } catch {
    return 'sin-red'
  } finally {
    clearTimeout(reloj)
  }
}

/** ¿Este móvil tiene la partida de `id` preparada para jugar sin red? */
export function tieneDatosSinRed(id: string, vault: OfflineVaultSummary = getOfflineVaultSummary()): boolean {
  return vault.players.some((jugador) => jugador.ok && jugador.id === id)
}

/** Entrar directo si hay sesión válida; sin red, sólo si el móvil ya trae la partida de este jugador. */
export function decidirEntrada(estado: EstadoDeSesion, datosSinRed: boolean): 'entrar' | 'lista' {
  return estado === 'valida' || (estado === 'sin-red' && datosSinRed) ? 'entrar' : 'lista'
}

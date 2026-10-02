import { elegirPersonaje as enviarAlServidor } from '../../shared/api'
import { esPersonaje, type Personaje } from './personajes'

/**
 * Guardar el personaje elegido: primero en el móvil (se ve al instante y
 * sirve sin cobertura) y después en el servidor, que es quien lo enseña a
 * los compañeros. Si el servidor no contesta, se queda marcado como pendiente
 * y se reintenta al volver la cobertura o al abrir la app.
 *
 * Si el servidor dice 409 (otro jugador ya tiene ese avatar) se deshace lo
 * local: lo del móvil nunca puede quedarse con algo que el servidor rechazó.
 */

const clave = (usuario: string) => `saga:personaje:${usuario}`
const clavePendiente = (usuario: string) => `saga:personaje-pendiente:${usuario}`

export type ResultadoDeGuardar = 'guardado' | 'pendiente' | 'ocupado'

function leer(k: string): string | null {
  try {
    return window.localStorage.getItem(k)
  } catch {
    return null
  }
}
function escribir(k: string, v: string | null): void {
  try {
    if (v === null) window.localStorage.removeItem(k)
    else window.localStorage.setItem(k, v)
  } catch {
    // Sin almacenamiento: sólo se pierde la copia local.
  }
}

export function personajeLocal(usuario: string): Personaje | null {
  const v = leer(clave(usuario))
  return esPersonaje(v) ? v : null
}

/** Recordar en el móvil lo que el servidor ya sabe (no hay nada que subir). */
export function recordarPersonajeLocal(usuario: string, personaje: Personaje): void {
  escribir(clave(usuario), personaje)
  escribir(clavePendiente(usuario), null)
}

export function hayPendiente(usuario: string): boolean {
  return leer(clavePendiente(usuario)) === '1'
}

function esConflicto(error: unknown): boolean {
  return Boolean(error) && (error as { status?: number }).status === 409
}

export async function reintentarPendiente(usuario: string): Promise<boolean> {
  const elegido = personajeLocal(usuario)
  if (!elegido || !hayPendiente(usuario)) return true
  try {
    await enviarAlServidor(usuario, elegido)
    escribir(clavePendiente(usuario), null)
    return true
  } catch (error) {
    if (esConflicto(error)) {
      // Otro jugador lo cogió mientras tanto: ese personaje no es tuyo.
      escribir(clave(usuario), null)
      escribir(clavePendiente(usuario), null)
      return true
    }
    return false
  }
}

/** Devuelve si el servidor lo guardó ya, si queda pendiente de subir o si lo tiene otro. */
export async function guardarPersonaje(usuario: string, personaje: Personaje): Promise<ResultadoDeGuardar> {
  const anterior = leer(clave(usuario))
  const anteriorPendiente = leer(clavePendiente(usuario))
  escribir(clave(usuario), personaje)
  escribir(clavePendiente(usuario), '1')
  try {
    await enviarAlServidor(usuario, personaje)
    escribir(clavePendiente(usuario), null)
    return 'guardado'
  } catch (error) {
    if (esConflicto(error)) {
      escribir(clave(usuario), anterior)
      escribir(clavePendiente(usuario), anteriorPendiente)
      return 'ocupado'
    }
    return 'pendiente'
  }
}

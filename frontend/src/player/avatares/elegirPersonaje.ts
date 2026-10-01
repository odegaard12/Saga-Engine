import { elegirPersonaje as enviarAlServidor } from '../../shared/api'
import { esPersonaje, type Personaje } from './personajes'

/**
 * Guardar el personaje elegido: primero en el móvil (se ve al instante y
 * sirve sin cobertura) y después en el servidor, que es quien lo enseña a
 * los compañeros. Si el servidor no contesta, se queda marcado como pendiente
 * y se reintenta al volver la cobertura o al abrir la app.
 */

const clave = (usuario: string) => `saga:personaje:${usuario}`
const clavePendiente = (usuario: string) => `saga:personaje-pendiente:${usuario}`

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

export function hayPendiente(usuario: string): boolean {
  return leer(clavePendiente(usuario)) === '1'
}

export async function reintentarPendiente(usuario: string): Promise<boolean> {
  const elegido = personajeLocal(usuario)
  if (!elegido || !hayPendiente(usuario)) return true
  try {
    await enviarAlServidor(usuario, elegido)
    escribir(clavePendiente(usuario), null)
    return true
  } catch {
    return false
  }
}

/** Devuelve si el servidor lo guardó ya (si no, queda pendiente). */
export async function guardarPersonaje(usuario: string, personaje: Personaje): Promise<boolean> {
  escribir(clave(usuario), personaje)
  escribir(clavePendiente(usuario), '1')
  return reintentarPendiente(usuario)
}

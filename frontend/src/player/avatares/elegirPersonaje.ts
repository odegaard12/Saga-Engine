import { elegirPersonaje as enviarAlServidor } from '../../shared/api'
import { normalizarAvatar, type AvatarConfig } from './avatarConfig'
import { esPersonaje, type Personaje } from './personajes'

/**
 * Guardar el avatar elegido: primero en el móvil (se ve al instante y
 * sirve sin cobertura) y después en el servidor, que es quien lo enseña a
 * los compañeros. Si el servidor no contesta, se queda marcado como pendiente
 * y se reintenta al volver la cobertura o al abrir la app.
 *
 * Si el servidor dice 409 (otro jugador ya tiene ese avatar) se deshace lo
 * local: lo del móvil nunca puede quedarse con algo que el servidor rechazó.
 *
 * Lo del móvil son DOS claves: el nombre del personaje 2D de reserva (como
 * siempre, `saga:personaje:`) y la configuración entera (`saga:avatar:`), que es
 * la que lleva el aspecto 3D (personaje, colores, complementos).
 */

const clave = (usuario: string) => `saga:personaje:${usuario}`
const claveAvatar = (usuario: string) => `saga:avatar:${usuario}`
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

/** Lo que se pasa a guardar: la configuración entera o, como antes, sólo el nombre. */
export type AvatarAGuardar = AvatarConfig | Personaje

function aConfig(valor: AvatarAGuardar): AvatarConfig | null {
  return normalizarAvatar(valor)
}

export function personajeLocal(usuario: string): Personaje | null {
  const v = leer(clave(usuario))
  return esPersonaje(v) ? v : null
}

/** La configuración entera guardada en este móvil (o la del nombre a secas si es lo único que hay). */
export function avatarLocal(usuario: string): AvatarConfig | null {
  const crudo = leer(claveAvatar(usuario))
  if (crudo) {
    try {
      const cfg = normalizarAvatar(JSON.parse(crudo))
      if (cfg) return cfg
    } catch {
      // Copia local estropeada: se ignora.
    }
  }
  const p = personajeLocal(usuario)
  return p ? { character: p } : null
}

function escribirLocal(usuario: string, cfg: AvatarConfig | null): void {
  escribir(clave(usuario), cfg ? cfg.character : null)
  escribir(claveAvatar(usuario), cfg ? JSON.stringify(cfg) : null)
}

/** Recordar en el móvil lo que el servidor ya sabe (no hay nada que subir). */
export function recordarPersonajeLocal(usuario: string, valor: AvatarAGuardar): void {
  const cfg = aConfig(valor)
  if (!cfg) return
  escribirLocal(usuario, cfg)
  escribir(clavePendiente(usuario), null)
}

export function hayPendiente(usuario: string): boolean {
  return leer(clavePendiente(usuario)) === '1'
}

function esConflicto(error: unknown): boolean {
  return Boolean(error) && (error as { status?: number }).status === 409
}

export async function reintentarPendiente(usuario: string): Promise<boolean> {
  const elegido = avatarLocal(usuario)
  if (!elegido || !hayPendiente(usuario)) return true
  try {
    await enviarAlServidor(usuario, elegido)
    escribir(clavePendiente(usuario), null)
    return true
  } catch (error) {
    if (esConflicto(error)) {
      // Otro jugador lo cogió mientras tanto: ese avatar no es tuyo.
      escribirLocal(usuario, null)
      escribir(clavePendiente(usuario), null)
      return true
    }
    return false
  }
}

/** Devuelve si el servidor lo guardó ya, si queda pendiente de subir o si lo tiene otro. */
export async function guardarPersonaje(
  usuario: string,
  valor: AvatarAGuardar
): Promise<ResultadoDeGuardar> {
  const cfg = aConfig(valor)
  if (!cfg) return 'ocupado'
  const anterior = avatarLocal(usuario)
  const anteriorPendiente = leer(clavePendiente(usuario))
  escribirLocal(usuario, cfg)
  escribir(clavePendiente(usuario), '1')
  try {
    await enviarAlServidor(usuario, cfg)
    escribir(clavePendiente(usuario), null)
    return 'guardado'
  } catch (error) {
    if (esConflicto(error)) {
      escribirLocal(usuario, anterior)
      escribir(clavePendiente(usuario), anteriorPendiente)
      return 'ocupado'
    }
    return 'pendiente'
  }
}

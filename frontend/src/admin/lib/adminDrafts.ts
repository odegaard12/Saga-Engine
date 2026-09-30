/**
 * Copia local del trabajo sin guardar, para no perderlo si la sesión caduca.
 *
 * La sesión de administración dura una hora y no se renueva. Cuando caduca, el
 * servidor contesta 403 y el panel volvía a la pantalla de entrada tirando lo
 * editado (nodos movidos, jugadores, ajustes). Ahora, antes de volver al login,
 * se deja una copia en `sessionStorage` (solo esta pestaña, se borra al cerrarla)
 * y, al entrar otra vez, se ofrece recuperarla.
 *
 * Todo el acceso al almacenamiento va con `try/catch`: en una ventana privada,
 * con el almacenamiento bloqueado o lleno, escribir lanza, y el panel tiene que
 * seguir funcionando sin copia.
 */

const CLAVE = 'saga-admin-borradores-v1'

export type AdminDraftBundle = {
  savedAt: number
  /** Por qué se guardó: `session` (caducó), `auto` (copia periódica), `conflicto`... */
  reason: string
  /** Nodos tal y como se estaban editando. */
  stages?: unknown[]
  /** Huella de la misión con la que se cargaron esos nodos. */
  stagesBaseRevision?: string
  players?: unknown[]
  mission?: Record<string, string>
}

export type AdminDraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

function almacenamientoPorDefecto(): AdminDraftStorage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage
  } catch {
    return null
  }
}

/** true si se pudo guardar la copia. */
export function writeAdminDrafts(
  bundle: AdminDraftBundle,
  storage: AdminDraftStorage | null = almacenamientoPorDefecto()
): boolean {
  if (!storage) return false
  try {
    storage.setItem(CLAVE, JSON.stringify(bundle))
    return true
  } catch {
    return false
  }
}

export function readAdminDrafts(
  storage: AdminDraftStorage | null = almacenamientoPorDefecto()
): AdminDraftBundle | null {
  if (!storage) return null
  try {
    const crudo = storage.getItem(CLAVE)
    if (!crudo) return null
    const bundle = JSON.parse(crudo) as AdminDraftBundle
    if (!bundle || typeof bundle !== 'object' || typeof bundle.savedAt !== 'number') return null
    return bundle
  } catch {
    return null
  }
}

export function clearAdminDrafts(storage: AdminDraftStorage | null = almacenamientoPorDefecto()) {
  if (!storage) return
  try {
    storage.removeItem(CLAVE)
  } catch {
    // Nada que borrar o no se puede: da igual.
  }
}

/** «hace unos segundos», «hace 3 min», «hace 2 h». */
export function describeDraftAge(savedAt: number, now: number = Date.now()): string {
  const segundos = Math.max(0, Math.round((now - savedAt) / 1000))
  if (segundos < 45) return 'hace unos segundos'
  if (segundos < 90 * 60) return `hace ${Math.max(1, Math.round(segundos / 60))} min`
  return `hace ${Math.round(segundos / 3600)} h`
}

/** Una copia más vieja que esto ya no es «lo que estaba haciendo». */
export const MAX_DRAFT_AGE_MS = 12 * 60 * 60 * 1000

export function isDraftFresh(bundle: AdminDraftBundle, now: number = Date.now()): boolean {
  return now - bundle.savedAt <= MAX_DRAFT_AGE_MS
}

/**
 * ¿Trae la copia algo que valga la pena restaurar? Solo se guardan las partes
 * que estaban sin guardar, así que basta con que exista alguna.
 */
export function draftHasContent(bundle: AdminDraftBundle): boolean {
  return (
    Array.isArray(bundle.stages) || Array.isArray(bundle.players) || Boolean(bundle.mission)
  )
}

import type { TeamProfileLiveStatus } from '../../types/player'

/**
 * La tabla de equipo por DIFERENCIAS (25/10/2026, ahorro de datos): ver backend/app/runtime/equipo_delta.py.
 *
 * El móvil guarda la última tabla (sin `is_self`), su época y su revisión; las manda en cada latido y el servidor
 * contesta sólo con los perfiles que cambiaron. Este módulo es puro (sin red ni almacenamiento): fusiona y recompone
 * la MISMA tabla que habría mandado el servidor completa.
 *
 * 24/11 (clasificación ligera): con `campos`, cada perfil que cambió llega con `user` y SÓLO lo que cambió (más
 * `quitar`, lo que desapareció); se monta sobre el que ya se tenía. Lo que no cambió conserva el MISMO objeto, y
 * `conIsSelf` también, para que la clasificación no repinte las filas que siguen igual.
 */
export type EquipoRecibido = {
  user?: string
  epoca?: string
  rev?: number
  completo?: boolean
  profiles?: TeamProfileLiveStatus[]
  ids?: string[]
  /** Los perfiles cambiados traen sólo lo que cambió (el móvil lo pide con `equipo_campos`). */
  campos?: boolean
}

export type EstadoDelEquipo = { epoca: string; rev: number; perfiles: TeamProfileLiveStatus[] }

/** ¿La respuesta es del formato nuevo? Un servidor viejo (o un panel) manda la tabla entera, sin época. */
export function esPorDiferencias(rec: EquipoRecibido | undefined): rec is EquipoRecibido & { epoca: string; rev: number } {
  return Boolean(rec) && typeof rec?.epoca === 'string' && typeof rec?.rev === 'number'
}

/**
 * Aplica lo recibido a lo último que se tenía. Devuelve el estado nuevo, o `null` si no cuadra (falta un perfil,
 * orden desconocido…): quien llama olvida su copia y el siguiente latido pide la tabla completa.
 */
export function fusionarEquipo(
  previo: EstadoDelEquipo | null,
  rec: EquipoRecibido & { epoca: string; rev: number }
): EstadoDelEquipo | null {
  const recibidos = Array.isArray(rec.profiles) ? rec.profiles : []
  // Una respuesta que llega tarde (un latido lento detrás de otro más nuevo) no puede hacer retroceder la tabla.
  if (previo && previo.epoca === rec.epoca && rec.rev < previo.rev) return previo
  if (rec.completo) return { epoca: rec.epoca, rev: rec.rev, perfiles: recibidos }
  if (!previo || previo.epoca !== rec.epoca) return null

  const porId = new Map<string, TeamProfileLiveStatus>()
  for (const p of previo.perfiles) porId.set(String(p.user), p)
  for (const p of recibidos) {
    const viejo = porId.get(String(p.user))
    porId.set(String(p.user), rec.campos && viejo ? conCambios(viejo, p) : p)
  }

  let perfiles: TeamProfileLiveStatus[]
  if (Array.isArray(rec.ids)) {
    perfiles = []
    for (const id of rec.ids) {
      const p = porId.get(String(id))
      if (!p) return null
      perfiles.push(p)
    }
  } else {
    // Sin `ids` la lista y el orden son los de antes: sólo se sustituyen los que cambiaron.
    if (recibidos.some((p) => !previo.perfiles.some((q) => String(q.user) === String(p.user)))) return null
    perfiles = previo.perfiles.map((p) => porId.get(String(p.user)) as TeamProfileLiveStatus)
  }
  return { epoca: rec.epoca, rev: rec.rev, perfiles }
}

/** Un perfil con lo que cambió encima (y sin lo que el servidor dice que ya no está). */
function conCambios(viejo: TeamProfileLiveStatus, cambios: TeamProfileLiveStatus): TeamProfileLiveStatus {
  const { quitar, ...resto } = cambios as TeamProfileLiveStatus & { quitar?: unknown }
  const nuevo: Record<string, unknown> = { ...viejo, ...resto }
  if (Array.isArray(quitar)) for (const k of quitar) delete nuevo[String(k)]
  return nuevo as unknown as TeamProfileLiveStatus
}

/** Perfil recibido -> el mismo con `is_self`: mientras el recibido no cambie, el MISMO objeto (React no repinta). */
const conYo = new WeakMap<TeamProfileLiveStatus, TeamProfileLiveStatus>()

/** La tabla tal y como la mandaba el servidor completa: `is_self` según quién mira. */
export function conIsSelf(perfiles: TeamProfileLiveStatus[], user: string): TeamProfileLiveStatus[] {
  const yo = String(user).trim()
  return perfiles.map((p) => {
    const esYo = String(p.user ?? '').trim() === yo
    const hecho = conYo.get(p)
    if (hecho && hecho.is_self === esYo) return hecho
    const nuevo = { ...p, is_self: esYo }
    conYo.set(p, nuevo)
    return nuevo
  })
}

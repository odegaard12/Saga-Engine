/**
 * Avisos antes de tocar la misión mientras hay gente jugándola.
 *
 * El progreso de un jugador es un índice en la lista de nodos, así que borrar,
 * insertar o reordenar nodos por delante de donde va alguien le cambia el nodo
 * (informe A12), y poner una fecha de salida futura en plena partida bloquea a
 * todos (A13). Estas funciones dicen A QUIÉN afecta algo, con los datos que el
 * panel ya tiene; la confirmación final del guardado la da el servidor con el
 * ensayo (`dry_run`), que conoce los niveles de ahora mismo.
 */
import type { AdminReactOverviewProfile } from './adminApi'

export type PlayerPastNode = { id: string; name: string; level: number; finished: boolean }

/**
 * Jugadores que YA han completado el nodo que está en la posición `index`
 * (su nivel es mayor que `index`, o han terminado la misión). Tocar ese nodo
 * o ponerle otro delante les hace repetir uno ya hecho o saltarse uno.
 */
export function playersPastIndex(
  profiles: AdminReactOverviewProfile[],
  index: number
): PlayerPastNode[] {
  const salida: PlayerPastNode[] = []

  for (const profile of profiles) {
    const nivel = typeof profile.level === 'number' && Number.isFinite(profile.level) ? profile.level : 0
    if (profile.finished || nivel > index) {
      salida.push({
        id: String(profile.id),
        name: String(profile.display_name || profile.id),
        level: nivel,
        finished: Boolean(profile.finished),
      })
    }
  }

  return salida
}

export function describePlayersPast(players: PlayerPastNode[], max = 6): string {
  const nombres = players
    .slice(0, max)
    .map((jugador) => `${jugador.name} (${jugador.finished ? 'ha terminado la misión' : `va por el nodo ${jugador.level + 1}`})`)
  const resto = players.length > max ? ` y ${players.length - max} más` : ''
  return nombres.join(', ') + resto
}

export type StructuralChange = 'reordenar' | 'borrar' | 'insertar'

/**
 * El texto de la confirmación, o cadena vacía si no hay nadie a quien afecte.
 * `index` es la posición más baja que se toca (al reordenar, la menor de las dos).
 */
export function confirmationForStructuralChange(
  change: StructuralChange,
  nodeTitle: string,
  profiles: AdminReactOverviewProfile[],
  index: number
): string {
  const afectados = playersPastIndex(profiles, index)
  if (afectados.length === 0) return ''

  const accion =
    change === 'reordenar'
      ? `Reordenar «${nodeTitle}»`
      : change === 'borrar'
        ? `Borrar «${nodeTitle}»`
        : 'Insertar un nodo aquí'

  return (
    `${accion} afecta a ${afectados.length} jugador(es) que ya han pasado por esta zona de la ruta:\n\n` +
    `${describePlayersPast(afectados)}\n\n` +
    'Al guardar repetirán un nodo ya hecho o se saltarán otro. ' +
    'Antes de guardar se te enseñará la lista exacta. ¿Hacerlo de todos modos?'
  )
}

const VENTANA_RECIENTE_MS = 30 * 60 * 1000

/** `last_seen` puede venir en segundos, milisegundos o como texto ISO. */
export function lastSeenMs(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === '') return null

  let numero = typeof valor === 'number' ? valor : Number(valor)
  if (!Number.isFinite(numero)) {
    const parseada = Date.parse(String(valor))
    if (!Number.isFinite(parseada)) return null
    numero = parseada
  }

  return numero > 1_000_000_000_000 ? numero : numero * 1000
}

/** ¿Está esta persona jugando ahora? Nivel avanzado sin terminar, o vista hace poco. */
export function isActivelyPlaying(profile: AdminReactOverviewProfile, nowMs: number = Date.now()): boolean {
  if (profile.finished) return false
  if (typeof profile.level === 'number' && profile.level > 0) return true
  const visto = lastSeenMs(profile.last_seen)
  return visto !== null && nowMs - visto <= VENTANA_RECIENTE_MS
}

export function launchInstant(valor: string): number {
  const texto = String(valor || '').trim()
  return texto ? Date.parse(texto) : Number.NaN
}

/**
 * Jugadores a los que bloquearía una fecha de salida FUTURA nueva. Vacío si no
 * hay fecha, si no es futura, si no ha cambiado o si nadie está jugando.
 */
export function playersBlockedByNewLaunch(
  anterior: string,
  nueva: string,
  profiles: AdminReactOverviewProfile[],
  nowMs: number = Date.now()
): AdminReactOverviewProfile[] {
  const instanteNuevo = launchInstant(nueva)
  if (!Number.isFinite(instanteNuevo) || instanteNuevo <= nowMs) return []

  const instanteAnterior = launchInstant(anterior)
  if (Number.isFinite(instanteAnterior) && instanteAnterior === instanteNuevo) return []

  return profiles.filter((profile) => isActivelyPlaying(profile, nowMs))
}

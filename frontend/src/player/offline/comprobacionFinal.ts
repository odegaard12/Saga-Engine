import type { PlayerStage } from '../../types/player'
import { teselasQueFaltan } from './mapTileCache'
import { getStoredMissionPack } from './missionPack'
import { asegurarPaquetesDelJugador, verificarPaquetesDelJugador } from './pwaShell'

/**
 * 31/10: lo que comprueba la pantalla de carga al terminar, mirando la caché de verdad (no el resumen de la descarga):
 * paquetes de la app y avatares, teselas y relieve del plan, y la misión guardada. Y cuánto ocupa todo.
 */
export interface ComprobacionFinal {
  paquetesQueFaltan: number
  teselasQueFaltan: number
  hayMision: boolean
  bytes: number | null
  /** `mission_launch_at` de la misión guardada ('' = sin hora de inicio). */
  inicio: string
}

export function todoDescargado(c: ComprobacionFinal): boolean {
  return c.hayMision && c.paquetesQueFaltan === 0 && c.teselasQueFaltan === 0
}

/** «N MB» con lo que ocupa SAGA en el móvil (`null` si el navegador no lo dice). */
export function megas(bytes: number | null): string | null {
  return bytes && bytes > 0 ? `${Math.max(1, Math.round(bytes / 1_048_576))} MB` : null
}

/**
 * Con tiempo máximo: la comprobación nunca retiene la pantalla (no bloquea nada: sólo enseña el resultado). Con el mapa
 * pintándose a la vez, en el banco tarda 4-11 s (01/11: eran ~20 s antes de las consultas en paralelo); tope 20 s. Pasado `ms` contesta `null` y el resumen no sale
 * (la carga ya comprobó cada parte al bajarla; esto es sólo la prueba final a la vista).
 */
export function comprobarConLimite(user: string, ms = 20000): Promise<ComprobacionFinal | null> {
  return Promise.race([
    comprobarTodoDescargado(user).catch(() => null),
    new Promise<null>((resolver) => setTimeout(() => resolver(null), ms)),
  ])
}

/**
 * 06/11: los paquetes que faltan de verdad. Los avatares no cuentan (la descarga los trata como opcionales: sin ellos
 * sale el retrato 2D). Y si falta algo con red, se baja aquí mismo, en la pantalla de carga, y se vuelve a mirar.
 */
async function paquetesQueFaltanDeVerdad(ruta: string): Promise<string[]> {
  const faltan = (await verificarPaquetesDelJugador(ruta, { soloCopia: true })).faltan.filter(
    (r) => !r.startsWith('/assets/avatares/')
  )
  if (faltan.length === 0 || typeof navigator === 'undefined' || navigator.onLine === false)
    return faltan
  return (await asegurarPaquetesDelJugador(ruta, 2)).faltan // ya sin avatares
}

export async function comprobarTodoDescargado(user: string): Promise<ComprobacionFinal> {
  const pack = await getStoredMissionPack(user).catch(() => null)
  const stages = (pack?.payload?.stages || []) as PlayerStage[]
  const ruta = typeof window !== 'undefined' ? window.location.pathname : '/'
  const [paquetes, teselas, uso] = await Promise.all([
    paquetesQueFaltanDeVerdad(ruta),
    teselasQueFaltan(stages, { muestra: true }).catch(() => ({ total: 0, faltan: 1 })),
    typeof navigator !== 'undefined' && navigator.storage?.estimate
      ? navigator.storage.estimate().catch(() => null)
      : Promise.resolve(null),
  ])
  return {
    paquetesQueFaltan: paquetes.length,
    teselasQueFaltan: teselas.faltan,
    hayMision: Boolean(pack && stages.length > 0),
    bytes: uso?.usage ?? null,
    inicio: String(pack?.config?.mission_launch_at || ''),
  }
}

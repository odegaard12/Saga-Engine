/**
 * ¿Qué tal va la red? (15/11, admin con muy poca cobertura.)
 *
 * Chrome da `navigator.connection` (tipo de red, ahorro de datos, latencia); Safari de iPhone NO lo da. Sin él se mide con
 * lo que el propio navegador ya bajó: cuánto tardó en llegar el cuerpo de los recursos grandes (Resource Timing). Si no
 * hay nada que medir (todo salió de la caché), se da por buena: bajar de más desde la caché no cuesta red.
 *
 * Sirve para tres cosas: no precargar el panel entero mientras se teclea la clave con 2G, sondear a los jugadores
 * con más calma, y no gastar datos en lo que no hace falta.
 */
export type CalidadDeRed = 'buena' | 'media' | 'mala'

type Conexion = { effectiveType?: string; saveData?: boolean; rtt?: number; downlink?: number }

/** kbit/s por debajo de los cuales la red es «mala» / «media» al medir con los recursos ya bajados. */
export const UMBRAL_MALA_KBPS = 200
export const UMBRAL_MEDIA_KBPS = 1500

export function calidadPorConexion(c: Conexion | undefined | null): CalidadDeRed | null {
  if (!c || typeof c !== 'object') return null
  if (c.saveData === true || c.effectiveType === 'slow-2g' || c.effectiveType === '2g')
    return 'mala'
  if (typeof c.rtt === 'number' && c.rtt >= 1000) return 'mala'
  if (c.effectiveType === '3g') return 'media'
  if (typeof c.downlink === 'number' && c.downlink > 0 && c.downlink < 0.5) return 'mala'
  if (typeof c.rtt === 'number' && c.rtt >= 400) return 'media'
  return c.effectiveType ? 'buena' : null
}

export function calidadPorRecursos(
  entradas: Array<{ transferSize?: number; responseStart?: number; responseEnd?: number }>
): CalidadDeRed {
  let peor = Infinity
  for (const e of entradas) {
    const bytes = Number(e.transferSize)
    const ms = Number(e.responseEnd) - Number(e.responseStart)
    // Sólo cuentan los recursos grandes que de verdad vinieron de la red: los pequeños los domina la latencia.
    if (Number.isFinite(bytes) && Number.isFinite(ms) && bytes > 30_000 && ms > 50) {
      peor = Math.min(peor, (bytes * 8) / ms)
    }
  }
  if (peor === Infinity) return 'buena'
  return peor < UMBRAL_MALA_KBPS ? 'mala' : peor < UMBRAL_MEDIA_KBPS ? 'media' : 'buena'
}

export function calidadDeRed(): CalidadDeRed {
  try {
    const nav = (globalThis as { navigator?: { connection?: Conexion } }).navigator
    const porConexion = calidadPorConexion(nav?.connection)
    if (porConexion) return porConexion
    const perf = (globalThis as { performance?: { getEntriesByType?: (t: string) => unknown[] } })
      .performance
    const recursos = perf?.getEntriesByType?.('resource') ?? []
    return calidadPorRecursos(recursos as PerformanceResourceTiming[])
  } catch {
    return 'buena'
  }
}

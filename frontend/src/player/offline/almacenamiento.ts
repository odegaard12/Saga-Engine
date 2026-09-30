/**
 * El espacio del móvil: que lo descargado no se pierda, y que se sepa si no cabe.
 *
 * Dos cosas que faltaban:
 *
 *  - Sin `storage.persist()` el navegador puede vaciar la caché y la base de
 *    datos del jugador cuando va justo de espacio, y en iPhone Safari lo hace a
 *    los siete días sin abrir una web que no esté instalada. El jugador prepara
 *    el móvil días antes y se planta en el monte con todo borrado.
 *  - Los fallos de cuota se tragaban (`catch {}`): el panel decía «listo» con la
 *    descarga a medias.
 */

export interface EstadoDelAlmacenamiento {
  /** `true`/`false` según el navegador; `null` = no se puede saber. */
  persistente: boolean | null
  usoBytes: number | null
  cuotaBytes: number | null
  libreBytes: number | null
}

export type ResultadoDePersistir = 'persistente' | 'no_concedido' | 'no_soportado'

/** ¿Este error es «no cabe»? Cada navegador lo llama a su manera. */
export function esErrorDeCuota(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const e = error as { name?: unknown; code?: unknown; message?: unknown }
  const nombre = String(e.name || '')
  if (nombre === 'QuotaExceededError' || nombre === 'NS_ERROR_DOM_QUOTA_REACHED') return true
  // Safari antiguo y algunos Android: código 22 / 1014.
  if (e.code === 22 || e.code === 1014) return true
  return /quota|storage is full|no space|disk is full/i.test(String(e.message || ''))
}

export async function estadoDelAlmacenamiento(): Promise<EstadoDelAlmacenamiento> {
  const vacio: EstadoDelAlmacenamiento = {
    persistente: null,
    usoBytes: null,
    cuotaBytes: null,
    libreBytes: null,
  }
  if (typeof navigator === 'undefined' || !navigator.storage) return vacio

  const salida = { ...vacio }

  try {
    if (typeof navigator.storage.persisted === 'function') {
      salida.persistente = await navigator.storage.persisted()
    }
  } catch {
    // Sin respuesta: se queda en "no se sabe".
  }

  try {
    if (typeof navigator.storage.estimate === 'function') {
      const estimacion = await navigator.storage.estimate()
      const uso = Number(estimacion.usage)
      const cuota = Number(estimacion.quota)
      salida.usoBytes = Number.isFinite(uso) ? uso : null
      salida.cuotaBytes = Number.isFinite(cuota) && cuota > 0 ? cuota : null
      if (salida.usoBytes !== null && salida.cuotaBytes !== null) {
        salida.libreBytes = Math.max(0, salida.cuotaBytes - salida.usoBytes)
      }
    }
  } catch {
    // Igual: la estimación es un dato de ayuda, no una condición.
  }

  return salida
}

/**
 * Pide al navegador que no borre los datos de SAGA por su cuenta.
 *
 * Chrome lo concede según cuánto se usa la web, Safari (iOS 17+) sobre todo si
 * está instalada, Firefox pregunta. Un «no» no es un error: se cuenta.
 */
export async function pedirAlmacenamientoPersistente(): Promise<ResultadoDePersistir> {
  if (typeof navigator === 'undefined' || !navigator.storage) return 'no_soportado'
  if (typeof navigator.storage.persist !== 'function') return 'no_soportado'

  try {
    if (typeof navigator.storage.persisted === 'function' && (await navigator.storage.persisted())) {
      return 'persistente'
    }
    return (await navigator.storage.persist()) ? 'persistente' : 'no_concedido'
  } catch {
    return 'no_concedido'
  }
}

/** La web está abierta como aplicación instalada (pantalla de inicio). */
export function estaInstalada(): boolean {
  if (typeof window === 'undefined') return false
  try {
    if ((navigator as Navigator & { standalone?: boolean }).standalone === true) return true
    return Boolean(window.matchMedia?.('(display-mode: standalone)').matches)
  } catch {
    return false
  }
}

/** Menos de esto libre y la descarga del mapa puede no caber. */
export const ESPACIO_LIBRE_MINIMO_BYTES = 300 * 1024 * 1024

export type NivelDeEspacio = 'ok' | 'justo' | 'desconocido'

/**
 * ¿Sobra sitio? Con menos de 300 MB libres se avisa: el mapa completo ronda los
 * 200 MB y el resto de la aplicación otro tanto.
 */
export function evaluarEspacio(estado: EstadoDelAlmacenamiento): NivelDeEspacio {
  if (estado.libreBytes === null) return 'desconocido'
  return estado.libreBytes < ESPACIO_LIBRE_MINIMO_BYTES ? 'justo' : 'ok'
}

/** «143 MB», «2,1 GB». Con coma, que es como se lee aquí. */
export function formatearBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return '—'
  const mb = bytes / (1024 * 1024)
  if (mb >= 1024) return `${(mb / 1024).toFixed(1).replace('.', ',')} GB`
  return `${Math.round(mb)} MB`
}

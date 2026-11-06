import type { PlayerStage } from '../../types/player'
import { configDelNodo } from '../configDelNodo'
import { sha256Hex } from './sha256'

/**
 * «Mapa mudo»: ¿ha llegado el jugador al sitio, sin saber dónde está el sitio?
 *
 * El móvil sólo tiene el círculo difuso. Para poder comprobar la llegada SIN
 * COBERTURA el servidor manda, en vez del punto, las celdas de una cuadrícula
 * (de 8 m, con origen en el centro difuso) que cubren el radio real, cada una
 * como un hash salado. Aquí se pasa la posición a celda, se hashea y se mira si
 * está en el conjunto. Lo mismo, cuenta por cuenta, que hace el servidor en
 * `mapa_mudo_verificador` (backend/app/runtime/mision.py).
 *
 * Trade-off, a propósito y sin esconderlo: es el mismo nivel de defensa que el
 * hash de las respuestas. Nadie lee el punto en el paquete ni lo ve en el
 * mapa, pero quien sepa programar puede probar las celdas del círculo. La
 * barrera real es que el servidor revisa las muestras de GPS que el móvil
 * manda como evidencia y lo anota. El modo prueba, que existe siempre, sigue
 * usando esta misma comprobación con la posición que se ponga a mano.
 */

export type LlegadaMapaMudo = {
  celda_m: number
  sal: string
  hashes: string[]
}

const METROS_POR_GRADO = 111320

export function leerLlegada(stage: PlayerStage | null | undefined): LlegadaMapaMudo | null {
  const bruta = configDelNodo(stage).arrival as Partial<LlegadaMapaMudo> | undefined
  if (!bruta || typeof bruta !== 'object') return null
  if (!Array.isArray(bruta.hashes) || typeof bruta.sal !== 'string') return null
  const celda = Number(bruta.celda_m)
  if (!Number.isFinite(celda) || celda <= 0) return null
  return { celda_m: celda, sal: bruta.sal, hashes: bruta.hashes.map(String) }
}

/** Las hashes del nodo, como conjunto. Se cachea por referencia del array. */
const conjuntos = new WeakMap<string[], Set<string>>()

function conjuntoDe(llegada: LlegadaMapaMudo): Set<string> {
  let conjunto = conjuntos.get(llegada.hashes)
  if (!conjunto) {
    conjunto = new Set(llegada.hashes)
    conjuntos.set(llegada.hashes, conjunto)
  }
  return conjunto
}

export function hashDeCelda(sal: string, i: number, j: number): string {
  return sha256Hex(`${sal}:${i}:${j}`).slice(0, 16)
}

/**
 * ¿Está alguna celda que toca el disco (posición, margen) entre las buenas?
 *
 * `margenM` es lo que ya se le perdona al GPS en un punto de control normal
 * (la precisión del fix, con tope): así «mapa mudo» no es más estricto ni más
 * laxo que cualquier otro nodo.
 */
export function haLlegadoAlMapaMudo(
  posicion: { lat: number; lon: number },
  margenM: number,
  origen: { lat: number; lon: number },
  llegada: LlegadaMapaMudo
): boolean {
  const celda = llegada.celda_m
  const conjunto = conjuntoDe(llegada)
  const dy = (posicion.lat - origen.lat) * METROS_POR_GRADO
  const dx =
    (posicion.lon - origen.lon) *
    METROS_POR_GRADO *
    Math.max(0.2, Math.cos((origen.lat * Math.PI) / 180))
  const margen = Math.max(0, margenM)

  for (let i = Math.floor((dx - margen) / celda); i <= Math.floor((dx + margen) / celda); i += 1) {
    for (
      let j = Math.floor((dy - margen) / celda);
      j <= Math.floor((dy + margen) / celda);
      j += 1
    ) {
      const cx = Math.min(Math.max(dx, i * celda), (i + 1) * celda)
      const cy = Math.min(Math.max(dy, j * celda), (j + 1) * celda)
      if (Math.hypot(dx - cx, dy - cy) > margen) continue
      if (conjunto.has(hashDeCelda(llegada.sal, i, j))) return true
    }
  }
  return false
}

export type BandaDeCalor = 'caliente' | 'templado' | 'frio'

type CalorMapaMudo = { celda_m: number; caliente: Set<string>; templado: Set<string> }
const calores = new WeakMap<object, CalorMapaMudo>()

/**
 * 5/11: la pista frío/templado/caliente, calculada aquí con el GPS (sin red ni latido). El servidor manda en
 * `arrival.calor` las celdas saladas de cada banda (ver `mapa_mudo_calor` en backend/app/runtime/mision.py);
 * fuera de las dos, frío. Null si el nodo no lleva la pista.
 */
export function calorDelMapaMudo(
  stage: PlayerStage | null | undefined,
  posicion: { lat: number; lon: number } | null | undefined,
  origen: { lat: number; lon: number } | null | undefined
): BandaDeCalor | null {
  const llegada = configDelNodo(stage).arrival as { sal?: unknown; calor?: Record<string, unknown> } | undefined
  const bruto = llegada?.calor
  if (!bruto || typeof bruto !== 'object' || typeof llegada?.sal !== 'string' || !posicion || !origen) return null
  let calor = calores.get(bruto)
  if (!calor) {
    const celda = Number(bruto.celda_m)
    if (!Number.isFinite(celda) || celda <= 0) return null
    const lista = (v: unknown) => new Set(Array.isArray(v) ? v.map(String) : [])
    calor = { celda_m: celda, caliente: lista(bruto.caliente), templado: lista(bruto.templado) }
    calores.set(bruto, calor)
  }
  const dy = (posicion.lat - origen.lat) * METROS_POR_GRADO
  const dx =
    (posicion.lon - origen.lon) * METROS_POR_GRADO * Math.max(0.2, Math.cos((origen.lat * Math.PI) / 180))
  const hash = hashDeCelda(llegada.sal, Math.floor(dx / calor.celda_m), Math.floor(dy / calor.celda_m))
  if (calor.caliente.has(hash)) return 'caliente'
  if (calor.templado.has(hash)) return 'templado'
  return 'frio'
}

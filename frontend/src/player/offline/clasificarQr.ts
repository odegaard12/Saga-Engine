/**
 * ¿Qué es lo que acaba de leer la cámara?
 *
 * Antes cualquier cosa que no fuera la pegatina del nodo activo se guardaba en
 * la mochila como «objeto» —la pegatina de otro nodo, el QR de un cartel, una
 * URL cualquiera— y el escáner enseñaba «PEGATINA VALIDADA» y se cerraba,
 * aunque el nodo no hubiera avanzado. Ahora:
 *
 *   - la del nodo activo completa el nodo (una vez: ver QuickProofPanel);
 *   - la de OTRO nodo de la misión no hace nada y lo dice;
 *   - un objeto SAGA (`SAGA1:ITEM:…`, `SAGA:PROOF:…`) que no es de ningún nodo
 *     se guarda en la mochila, como siempre;
 *   - cualquier otra cosa es «este QR no es de SAGA» y no se guarda.
 */

import { sha256Hex } from '../utils/sha256'

/** Mayúsculas, sin espacios ni guiones: así se compara en todo el juego. */
export function normalizarCodigo(valor: string | null | undefined): string {
  return String(valor || '')
    .trim()
    .toUpperCase()
    .replace(/[\s_-]+/g, '')
}

/**
 * La «huella» de las pegatinas de un nodo (auditoría 15/10/2026): su sal y el hash de cada código impreso, nunca
 * el código. Es lo que el servidor manda en `qr_hashes` (sha256(sal + ':' + código en mayúsculas), ver
 * `hash_codigo_de_nodo` en runtime/mision.py). Un paquete viejo con el código en claro se convierte aquí al mismo
 * hash, así que todo se compara igual, también sin red.
 */
export type HuellaQr = { sal: string; hashes: string[] }

/** Así limpia el servidor un código antes del hash (`_clean_code`: sin espacios de los lados y en mayúsculas). */
function limpio(valor: unknown): string {
  return typeof valor === 'string' ? valor.trim().toUpperCase() : ''
}

export function huellaQr(nodo: unknown): HuellaQr | null {
  if (!nodo || typeof nodo !== 'object') return null
  const n = nodo as Record<string, unknown>
  if (n.id === undefined || n.id === null) return null
  const sal = `${String(n.id)}:codigo`
  const config = n.config && typeof n.config === 'object' ? (n.config as Record<string, unknown>) : {}
  const fisico =
    n.physical_qr && typeof n.physical_qr === 'object' ? (n.physical_qr as Record<string, unknown>) : {}
  const hashes = new Set<string>(
    Array.isArray(n.qr_hashes) ? n.qr_hashes.filter((h): h is string => typeof h === 'string') : []
  )
  for (const viejo of [n.qr_payload, config.qr_payload, fisico.payload]) {
    if (limpio(viejo)) hashes.add(sha256Hex(`${sal}:${limpio(viejo)}`))
    if (normalizarCodigo(viejo as string)) hashes.add(sha256Hex(`${sal}:${normalizarCodigo(viejo as string)}`))
  }
  return hashes.size ? { sal, hashes: [...hashes] } : null
}

/** ¿Lo leído es una de las pegatinas de esta huella? Sin red: sólo un hash (tal cual o sin espacios ni guiones). */
export function esDeLaHuella(leido: string, huella: HuellaQr | null | undefined): boolean {
  if (!huella) return false
  return [limpio(leido), normalizarCodigo(leido)].some(
    (codigo) => Boolean(codigo) && huella.hashes.includes(sha256Hex(`${huella.sal}:${codigo}`))
  )
}

export type ClaseQr =
  | { tipo: 'nodo_actual' }
  | { tipo: 'otro_nodo'; indice: number; superado: boolean }
  | { tipo: 'objeto' }
  | { tipo: 'ajeno' }

export function clasificarQr(
  leido: string,
  opciones: {
    /** Huella de la pegatina del nodo activo, si tiene. */
    activo?: HuellaQr | null
    /** Huella de las pegatinas de cada nodo de la misión, en orden. */
    nodos?: ReadonlyArray<HuellaQr | null>
    /** Índice del nodo activo en `nodos`. */
    indiceActual?: number | null
    /** El formato reconocido por el escáner: `item`/`proof` = formato SAGA. */
    formato?: 'item' | 'proof' | 'text'
  } = {}
): ClaseQr {
  const leidoNorm = normalizarCodigo(leido)
  if (!leidoNorm) return { tipo: 'ajeno' }

  if (esDeLaHuella(leido, opciones.activo)) return { tipo: 'nodo_actual' }

  const nodos = opciones.nodos || []
  for (let i = 0; i < nodos.length; i += 1) {
    if (esDeLaHuella(leido, nodos[i])) {
      if (typeof opciones.indiceActual === 'number' && i === opciones.indiceActual) {
        // Mismo nodo con otro de sus códigos (los tres sitios del servidor).
        return { tipo: 'nodo_actual' }
      }
      return {
        tipo: 'otro_nodo',
        indice: i,
        superado: typeof opciones.indiceActual === 'number' && i < opciones.indiceActual,
      }
    }
  }

  if (opciones.formato === 'item' || opciones.formato === 'proof') return { tipo: 'objeto' }
  return { tipo: 'ajeno' }
}

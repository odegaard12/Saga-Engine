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

/** Mayúsculas, sin espacios ni guiones: así se compara en todo el juego. */
export function normalizarCodigo(valor: string | null | undefined): string {
  return String(valor || '')
    .trim()
    .toUpperCase()
    .replace(/[\s_-]+/g, '')
}

/** Los códigos impresos de un nodo. Mismos tres sitios que `stage_qr_payloads` del servidor. */
export function payloadsDeNodo(nodo: unknown): string[] {
  if (!nodo || typeof nodo !== 'object') return []
  const n = nodo as Record<string, unknown>
  const config =
    n.config && typeof n.config === 'object' ? (n.config as Record<string, unknown>) : {}
  const fisico =
    n.physical_qr && typeof n.physical_qr === 'object'
      ? (n.physical_qr as Record<string, unknown>)
      : {}
  return [n.qr_payload, config.qr_payload, fisico.payload]
    .map((v) => (typeof v === 'string' ? v.trim() : ''))
    .filter(Boolean)
}

export type ClaseQr =
  | { tipo: 'nodo_actual' }
  | { tipo: 'otro_nodo'; indice: number; superado: boolean }
  | { tipo: 'objeto' }
  | { tipo: 'ajeno' }

export function clasificarQr(
  leido: string,
  opciones: {
    /** Código del nodo activo, si tiene pegatina. */
    activo?: string | null
    /** Códigos de cada nodo de la misión, en orden. */
    nodos?: ReadonlyArray<ReadonlyArray<string>>
    /** Índice del nodo activo en `nodos`. */
    indiceActual?: number | null
    /** El formato reconocido por el escáner: `item`/`proof` = formato SAGA. */
    formato?: 'item' | 'proof' | 'text'
  } = {}
): ClaseQr {
  const leidoNorm = normalizarCodigo(leido)
  if (!leidoNorm) return { tipo: 'ajeno' }

  const activo = normalizarCodigo(opciones.activo)
  if (activo && activo === leidoNorm) return { tipo: 'nodo_actual' }

  const nodos = opciones.nodos || []
  for (let i = 0; i < nodos.length; i += 1) {
    if (nodos[i].some((codigo) => normalizarCodigo(codigo) === leidoNorm)) {
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

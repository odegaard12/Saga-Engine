/**
 * Lo que va DENTRO del código de una pegatina.
 *
 * El panel generaba `SAGA1:ITEM:<id>:<título del nodo>` o el título en
 * mayúsculas, y el código de respaldo sugerido era `SAGA-01`, `SAGA-02`…:
 *   - el título metía tildes, eñes y espacios, que obligan al modo «bytes» del
 *     QR: más módulos, módulos más pequeños a igual tamaño impreso;
 *   - el título del nodo suele ser un sitio real, y quedaba impreso y legible
 *     por cualquiera con un lector de QR;
 *   - y lo peor: con saber el nombre o el número del nodo se podía teclear el
 *     código sin haber encontrado la pegatina.
 *
 * Ahora el panel propone `SAGA` + 6 caracteres al azar de un alfabeto sin
 * letras que se confundan (ni 0/O ni 1/I). Son 10 caracteres alfanuméricos en
 * mayúsculas: el modo alfanumérico del QR los mete en un código de versión 1
 * (21×21) con corrección H, el más grande posible por módulo. 32⁶ ≈ 10⁹
 * combinaciones: no se adivina tecleando.
 *
 * Los payloads que ya existen NO se tocan: hay pegatinas impresas con ellos.
 * `revisarPayloadQr` sólo avisa en el panel.
 */

/** Sin 0/O ni 1/I: se lee bien impreso debajo del código y se teclea sin dudas. */
export const ALFABETO_QR = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
export const PREFIJO_QR = 'SAGA'
export const LARGO_ALEATORIO_QR = 6
/** Por encima de esto el código sube de versión y los módulos se encogen. */
export const LARGO_MAXIMO_PAYLOAD = 32

type FuenteDeAzar = (bytes: Uint8Array) => Uint8Array

function azarDelSistema(bytes: Uint8Array): Uint8Array {
  const cripto = (globalThis as { crypto?: { getRandomValues?: (b: Uint8Array) => Uint8Array } })
    .crypto
  if (!cripto?.getRandomValues) throw new Error('sin generador criptográfico')
  return cripto.getRandomValues(bytes)
}

/** Un payload nuevo, imposible de deducir del nodo. */
export function generarPayloadQr(azar: FuenteDeAzar = azarDelSistema): string {
  const bytes = azar(new Uint8Array(LARGO_ALEATORIO_QR))
  let sufijo = ''
  // 32 símbolos = 5 bits exactos: sin sesgo al hacer el módulo.
  for (let i = 0; i < LARGO_ALEATORIO_QR; i += 1) sufijo += ALFABETO_QR[bytes[i] & 31]
  return PREFIJO_QR + sufijo
}

export type AvisoPayload = 'vacio' | 'largo' | 'caracteres' | 'deducible' | 'datos'

export const TEXTO_AVISO_PAYLOAD: Record<AvisoPayload, string> = {
  vacio: 'Sin código: esta pegatina no completaría el nodo.',
  largo: `Más de ${LARGO_MAXIMO_PAYLOAD} caracteres: el código sale más denso y se lee peor de lejos.`,
  caracteres:
    'Lleva tildes, espacios o símbolos: el código sale más denso. Mejor letras y números.',
  deducible:
    'Se puede adivinar (número o nombre del nodo): cualquiera lo teclearía sin encontrar la pegatina.',
  datos: 'Parece llevar datos personales o un enlace: va impreso y lo lee cualquiera.',
}

function plano(valor: string): string {
  return valor
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '')
}

/**
 * Qué tiene de malo un payload. Lista vacía = bien.
 *
 * `contexto` es lo que se sabe del nodo, para detectar si el código se
 * deduce de él: su título, su número en la ruta y su id.
 */
export function revisarPayloadQr(
  payload: string,
  contexto: { titulo?: string | null; indice?: number | null; id?: string | number | null } = {}
): AvisoPayload[] {
  const avisos: AvisoPayload[] = []
  const valor = String(payload || '').trim()
  if (!valor) return ['vacio']

  if (valor.length > LARGO_MAXIMO_PAYLOAD) avisos.push('largo')
  if (/[^A-Za-z0-9_:-]/.test(valor)) avisos.push('caracteres')

  if (/@|https?:|www\.|\d{9,}/i.test(valor)) avisos.push('datos')

  const limpio = plano(valor)
  const sinPrefijo = limpio.replace(/^SAGA1?(ITEM|PROOF|NODE|STAGE|CODE)?/, '')
  const deducible =
    // SAGA-01, SAGA_QR_3, 12…: el número del nodo.
    /^(QR)?\d{1,4}$/.test(sinPrefijo) ||
    sinPrefijo.length < 4 ||
    (contexto.titulo
      ? plano(contexto.titulo).length >= 3 && limpio.includes(plano(contexto.titulo))
      : false) ||
    // Un id con letras metido en el código (un id sólo de cifras daría falsos
    // avisos con los códigos al azar, que también llevan cifras).
    (contexto.id !== undefined &&
    contexto.id !== null &&
    /[A-Za-z]/.test(String(contexto.id)) &&
    plano(String(contexto.id)).length >= 3
      ? limpio.includes(plano(String(contexto.id)))
      : false) ||
    (typeof contexto.indice === 'number'
      ? new RegExp(`^SAGA0*${contexto.indice + 1}$`).test(limpio)
      : false)
  if (deducible) avisos.push('deducible')

  return avisos
}

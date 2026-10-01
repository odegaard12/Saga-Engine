/**
 * Los personajes con los que cada jugador se ve en el mapa.
 *
 * Son muñecos dibujados en el móvil (ver `dibujarPersonaje.ts`): ninguna cara
 * ni foto sale en el mapa, y funcionan sin cobertura porque no se descarga
 * nada. Aquí, lo que no depende del navegador: la lista, el defecto y los
 * nombres. Es un módulo puro para poder ejecutarlo en Node en las pruebas.
 *
 * La lista y la cuenta del defecto son las MISMAS que en
 * backend/app/runtime/personajes.py. Si se toca una, se toca la otra.
 */

export const PERSONAJES = [
  'explorador',
  'exploradora',
  'vikingo',
  'vikinga',
  'peregrino',
  'bruxa',
  'marinheira',
  'gaiteiro',
  'can',
  'raposo',
] as const

export type Personaje = (typeof PERSONAJES)[number]

export type Idioma = 'es' | 'gl' | 'en'

const NOMBRES: Record<Personaje, Record<Idioma, string>> = {
  explorador: { es: 'Explorador', gl: 'Explorador', en: 'Explorer' },
  exploradora: { es: 'Exploradora', gl: 'Exploradora', en: 'Explorer' },
  vikingo: { es: 'Vikingo', gl: 'Vikingo', en: 'Viking' },
  vikinga: { es: 'Vikinga', gl: 'Vikinga', en: 'Viking' },
  peregrino: { es: 'Peregrino', gl: 'Peregrino', en: 'Pilgrim' },
  bruxa: { es: 'Bruja', gl: 'Bruxa', en: 'Witch' },
  marinheira: { es: 'Marinera', gl: 'Mariñeira', en: 'Sailor' },
  gaiteiro: { es: 'Gaitero', gl: 'Gaiteiro', en: 'Piper' },
  can: { es: 'Perro', gl: 'Can', en: 'Dog' },
  raposo: { es: 'Zorro', gl: 'Raposo', en: 'Fox' },
}

export function esPersonaje(valor: unknown): valor is Personaje {
  return typeof valor === 'string' && (PERSONAJES as readonly string[]).includes(valor)
}

export function nombreDePersonaje(personaje: Personaje, idioma: string): string {
  const tabla = NOMBRES[personaje]
  return tabla[(idioma as Idioma) in tabla ? (idioma as Idioma) : 'es']
}

/** Los bytes UTF-8 de un texto, sin depender de TextEncoder (no está en todos los entornos). */
function bytesUtf8(texto: string): number[] {
  const bytes: number[] = []
  for (const simbolo of texto) {
    const c = simbolo.codePointAt(0) as number
    if (c < 0x80) bytes.push(c)
    else if (c < 0x800) bytes.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f))
    else if (c < 0x10000) bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f))
    else bytes.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 0x3f), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f))
  }
  return bytes
}

/** El personaje que le toca a quien aún no ha elegido: FNV-1a del id, igual que en el servidor. */
export function personajePorDefecto(jugadorId: unknown): Personaje {
  let hash = 0x811c9dc5
  for (const byte of bytesUtf8(String(jugadorId ?? '').trim())) {
    hash = Math.imul(hash ^ byte, 0x01000193) >>> 0
  }
  return PERSONAJES[hash % PERSONAJES.length]
}

type ConPersonaje = { character?: unknown; id?: unknown; user?: unknown; display_name?: unknown } | null | undefined

/** El personaje de una ficha: el que trae (si es válido) o el que le toca por defecto. */
export function personajeDe(ficha: ConPersonaje): Personaje {
  if (ficha && esPersonaje(ficha.character)) return ficha.character
  return personajePorDefecto(ficha?.user || ficha?.id || ficha?.display_name || 'player')
}

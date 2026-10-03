import type { ParteDeAvatar, AvatarConfig } from '../../avatares/avatarConfig'
import type { Personaje } from '../../avatares/personajes'

/**
 * El catálogo de los avatares 3D (personajes de Mixamo): lo que NO depende del
 * navegador ni de three.js, para poder comprobarlo en Node y compararlo con el
 * servidor (`backend/app/runtime/personajes.py`).
 *
 * Un aspecto se guarda DENTRO de `parts` del avatar de siempre:
 *
 *   { character: 'peregrino', parts: { mx: 'Ch01', top: 0, pants: 10, hair: 4,
 *                                      cabeza: 'boina', manoD: 'bordon' } }
 *
 * `character` sigue siendo uno de los diez de la lista antigua: lo exige el servidor
 * y mantiene válido el formato para cualquier cosa que sólo conozca el nombre. Los
 * jugadores de la versión 2D (sólo `character`) pasan a su personaje 3D con
 * `MX_DE_LEGACY`. En el mapa, lejos o sin modelo, se ve el retrato redondo. La unicidad
 * compara el hash de la forma canónica ENTERA, así que dos jugadores pueden
 * llevar el mismo personaje si cambian un color o un complemento.
 */

export const MX_IDS = [
  'Ch01',
  'Ch02',
  'Ch08',
  'Ch21',
  'Ch22',
  'Ch23',
  'Ch26',
  'Ch28',
  'Ch31',
  'Ch37',
] as const
export type MxId = (typeof MX_IDS)[number]

export const MX_NOMBRES: Record<MxId, string> = {
  Ch01: 'Xoán',
  Ch02: 'Antía',
  Ch08: 'Brais',
  Ch21: 'Uxía',
  Ch22: 'Iria',
  Ch23: 'Martiño',
  Ch26: 'Carme',
  Ch28: 'Breixo',
  Ch31: 'Pelayo',
  Ch37: 'Noa',
}

/**
 * El valor de `character` que se guarda con cada personaje 3D. Lo exige el servidor (y los
 * jugadores antiguos de la versión 2D sólo tienen esto): ver `personajes.ts`.
 */
export const MX_LEGACY: Record<MxId, Personaje> = {
  Ch01: 'peregrino',
  Ch02: 'marinheira',
  Ch08: 'gaiteiro',
  Ch21: 'bruxa',
  Ch22: 'exploradora',
  Ch23: 'explorador',
  Ch26: 'vikinga',
  Ch28: 'explorador',
  Ch31: 'vikingo',
  Ch37: 'peregrino',
}

/**
 * Quien eligió un personaje en la versión 2D (sólo tiene `character`, sin `parts`) pasa a este
 * personaje 3D. Es inyectiva: dos jugadores antiguos distintos siguen siendo distintos.
 */
export const MX_DE_LEGACY: Record<Personaje, MxId> = {
  explorador: 'Ch23',
  exploradora: 'Ch22',
  vikingo: 'Ch31',
  vikinga: 'Ch26',
  peregrino: 'Ch01',
  bruxa: 'Ch21',
  marinheira: 'Ch02',
  gaiteiro: 'Ch08',
  can: 'Ch28',
  raposo: 'Ch37',
}

export type ColorDeRopa = {
  es: string
  gl: string
  /** Color base (`#rrggbb`). */
  tint: string
  /** Cuánto manda el tinte sobre la textura original (0..1). */
  amt: number
  plaid?: { a: string; b: string; c: string; s: number }
}

const C = (es: string, gl: string, tint: string, amt = 0.92): ColorDeRopa => ({ es, gl, tint, amt })

export const COLORES_DE_ROPA: readonly ColorDeRopa[] = [
  C('Azul Galicia', 'Azul Galicia', '#0d5fb3'),
  C('Blanco lino', 'Branco liño', '#ece7da', 0.95),
  C('Verde pino', 'Verde piñeiro', '#3f6b3c'),
  C('Rojo teja', 'Vermello tella', '#a8402b'),
  C('Mostaza', 'Mostaza', '#c79a2b'),
  C('Granate', 'Granate', '#6d1f2c'),
  C('Gris pizarra', 'Gris lousa', '#5b6670'),
  C('Marrón tierra', 'Marrón terra', '#6f4b2e'),
  C('Arena', 'Area', '#c8b48a'),
  C('Amarillo chubasquero', 'Amarelo chuvasqueiro', '#f2c200', 0.95),
  C('Azul marino', 'Azul mariño', '#1e2a4a'),
  C('Negro', 'Negro', '#1c1c1f'),
  C('Naranja', 'Laranxa', '#d8742a'),
  C('Rosa palo', 'Rosa pálido', '#d79a9a'),
  {
    ...C('Tartán verde', 'Tartán verde', '#2f5d3a', 0.96),
    plaid: { a: '#12331d', b: '#c9b25a', c: '#f2eedd', s: 6 },
  },
  {
    ...C('Tartán rojo', 'Tartán vermello', '#a01f27', 0.96),
    plaid: { a: '#4a0c12', b: '#e0c070', c: '#ffffff', s: 6 },
  },
  {
    ...C('Tartán Galicia', 'Tartán Galicia', '#0d5fb3', 0.96),
    plaid: { a: '#06306a', b: '#f2f2f2', c: '#9ec4ee', s: 6 },
  },
]

export const COLORES_DE_PELO: readonly ColorDeRopa[] = [
  C('Negro', 'Negro', '#1b1714'),
  C('Castaño oscuro', 'Castaño escuro', '#3a2418'),
  C('Castaño', 'Castaño', '#6a4528'),
  C('Rubio', 'Loiro', '#c79a4a', 0.9),
  C('Pelirrojo', 'Roxo', '#a8431f'),
  C('Canoso', 'Canoso', '#8f8f92', 0.9),
  C('Blanco', 'Branco', '#d8d6d0', 0.9),
  C('Azul fantasía', 'Azul fantasía', '#2a5aa8', 0.9),
]

export type Hueco = 'cabeza' | 'espalda' | 'manoD' | 'manoI' | 'dos' | 'pies'
export type Complemento =
  | 'casco'
  | 'boina'
  | 'sombrero'
  | 'mochila'
  | 'mochilaP'
  | 'bordon'
  | 'paraguas'
  | 'cesta'
  | 'gaita'
  | 'zocas'
export type Mano = 'L' | 'R'

export const HUECOS: readonly {
  clave: Hueco
  es: string
  gl: string
  items: readonly Complemento[]
}[] = [
  { clave: 'cabeza', es: 'Cabeza', gl: 'Cabeza', items: ['casco', 'boina', 'sombrero'] },
  { clave: 'espalda', es: 'Espalda', gl: 'Costas', items: ['mochila', 'mochilaP'] },
  { clave: 'manoD', es: 'Mano derecha', gl: 'Man dereita', items: ['bordon', 'paraguas'] },
  { clave: 'manoI', es: 'Mano izquierda', gl: 'Man esquerda', items: ['cesta'] },
  { clave: 'dos', es: 'Ambas manos', gl: 'Ambas mans', items: ['gaita'] },
  { clave: 'pies', es: 'Pies', gl: 'Pés', items: ['zocas'] },
]

export const COMPLEMENTOS: Record<
  Complemento,
  { hueco: Hueco; ocupa: readonly Mano[]; es: string; gl: string }
> = {
  casco: { hueco: 'cabeza', ocupa: [], es: 'Casco vikingo', gl: 'Casco viquingo' },
  boina: { hueco: 'cabeza', ocupa: [], es: 'Boina', gl: 'Boina' },
  sombrero: {
    hueco: 'cabeza',
    ocupa: [],
    es: 'Sombrero de peregrino',
    gl: 'Sombreiro de peregrino',
  },
  mochila: { hueco: 'espalda', ocupa: [], es: 'Mochila', gl: 'Mochila' },
  mochilaP: { hueco: 'espalda', ocupa: [], es: 'Mochila de peregrino', gl: 'Mochila de peregrino' },
  bordon: { hueco: 'manoD', ocupa: ['R'], es: 'Bordón de peregrino', gl: 'Caxato de peregrino' },
  paraguas: { hueco: 'manoD', ocupa: ['R'], es: 'Paraguas', gl: 'Paraugas' },
  cesta: {
    hueco: 'manoI',
    ocupa: ['L'],
    es: 'Cesta con grelos y setas',
    gl: 'Cesta con grelos e cogomelos',
  },
  gaita: { hueco: 'dos', ocupa: ['R', 'L'], es: 'Gaita gallega', gl: 'Gaita galega' },
  zocas: { hueco: 'pies', ocupa: [], es: 'Zocas', gl: 'Zocas' },
}

/** Los complementos que se agarran con la mano (llevan clips de agarre horneados en Blender, `hold-<Ch>.glb`). */
export const SE_AGARRAN: readonly Complemento[] = ['bordon', 'paraguas', 'cesta', 'gaita']

/** Los gestos de la hoja de tocarte y de la tienda: clips `ge__*` del archivo de animaciones. */
export const GESTOS: readonly { clip: string; es: string; gl: string }[] = [
  { clip: 'ge__salute', es: 'Saludar', gl: 'Saudar' },
  { clip: 'ge__clapping', es: 'Aplaudir', gl: 'Aplaudir' },
  { clip: 'ge__head_nod_yes', es: 'Asentir', gl: 'Asentir' },
  { clip: 'ge__happy_hand_gesture', es: 'Gesto feliz', gl: 'Aceno feliz' },
  { clip: 'ge__acknowledging', es: 'De acuerdo', gl: 'De acordo' },
  { clip: 'ge__look_away_gesture', es: 'Mirar', gl: 'Mirar' },
]

/** Los gestos con los que se festeja un nodo completado (sin sentarse, saltar ni bailar). */
export const GESTOS_DE_FESTEJO: readonly string[] = [
  'ge__clapping',
  'ge__happy_hand_gesture',
  'ge__salute',
]

export type Aspecto = {
  mx: MxId
  top: number
  pants: number
  hair: number
  items: Partial<Record<Hueco, Complemento>>
}

export const ASPECTO_BASE = { top: 0, pants: 10, hair: 4 } as const

export function esMxId(v: unknown): v is MxId {
  return typeof v === 'string' && (MX_IDS as readonly string[]).includes(v)
}

const entero = (v: unknown, n: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < n

/** Manos que ocupan estos complementos. */
export function manosOcupadas(items: Partial<Record<Hueco, Complemento>>): Set<Mano> {
  const s = new Set<Mano>()
  for (const c of Object.values(items)) if (c) for (const m of COMPLEMENTOS[c].ocupa) s.add(m)
  return s
}

/** Por qué NO se puede poner `c` además de lo que ya hay (o null si cabe): una mano ocupada por otro hueco. */
export function bloqueadoPor(
  c: Complemento,
  items: Partial<Record<Hueco, Complemento>>
): Mano[] | null {
  const hueco = COMPLEMENTOS[c].hueco
  const otros: Partial<Record<Hueco, Complemento>> = { ...items }
  delete otros[hueco]
  const ocupadas = manosOcupadas(otros)
  const choque = COMPLEMENTOS[c].ocupa.filter((m) => ocupadas.has(m))
  return choque.length ? [...choque] : null
}

/** Pone un complemento (quita lo que hubiera en su hueco) o devuelve los mismos si no cabe. */
export function conComplemento(
  items: Partial<Record<Hueco, Complemento>>,
  c: Complemento
): Partial<Record<Hueco, Complemento>> {
  if (bloqueadoPor(c, items)) return items
  return { ...items, [COMPLEMENTOS[c].hueco]: c }
}

export function sinComplemento(
  items: Partial<Record<Hueco, Complemento>>,
  c: Complemento
): Partial<Record<Hueco, Complemento>> {
  const salida = { ...items }
  if (salida[COMPLEMENTOS[c].hueco] === c) delete salida[COMPLEMENTOS[c].hueco]
  return salida
}

/** Aspecto -> `parts` del avatar (sólo valores corta cadena o entero, como pide el servidor). */
export function aspectoAParts(a: Aspecto): Record<string, ParteDeAvatar> {
  const parts: Record<string, ParteDeAvatar> = {
    mx: a.mx,
    top: a.top,
    pants: a.pants,
    hair: a.hair,
  }
  for (const h of HUECOS) {
    const c = a.items[h.clave]
    if (c) parts[h.clave] = c
  }
  return parts
}

export function configDeAspecto(a: Aspecto): AvatarConfig {
  return { character: MX_LEGACY[a.mx], parts: aspectoAParts(a) }
}

/** `parts` -> aspecto, o null si no es de un avatar 3D (o está mal formado). */
export function partsAAspecto(parts: unknown): Aspecto | null {
  if (!parts || typeof parts !== 'object') return null
  const p = parts as Record<string, unknown>
  if (!esMxId(p.mx)) return null
  const top = p.top === undefined ? ASPECTO_BASE.top : p.top
  const pants = p.pants === undefined ? ASPECTO_BASE.pants : p.pants
  const hair = p.hair === undefined ? ASPECTO_BASE.hair : p.hair
  if (
    !entero(top, COLORES_DE_ROPA.length) ||
    !entero(pants, COLORES_DE_ROPA.length) ||
    !entero(hair, COLORES_DE_PELO.length)
  )
    return null
  const items: Partial<Record<Hueco, Complemento>> = {}
  for (const h of HUECOS) {
    const v = p[h.clave]
    if (v === undefined) continue
    if (typeof v !== 'string' || !(h.items as readonly string[]).includes(v)) return null
    items[h.clave] = v as Complemento
  }
  if (items.dos && (items.manoD || items.manoI)) return null
  return { mx: p.mx, top, pants, hair, items }
}

/** FNV-1a de los bytes UTF-8 (la misma cuenta que `personajePorDefecto`). */
function fnv(texto: string): number {
  let h = 0x811c9dc5
  for (const simbolo of texto) {
    const c = simbolo.codePointAt(0) as number
    const bytes =
      c < 0x80
        ? [c]
        : c < 0x800
          ? [0xc0 | (c >> 6), 0x80 | (c & 0x3f)]
          : c < 0x10000
            ? [0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f)]
            : [
                0xf0 | (c >> 18),
                0x80 | ((c >> 12) & 0x3f),
                0x80 | ((c >> 6) & 0x3f),
                0x80 | (c & 0x3f),
              ]
    for (const b of bytes) h = Math.imul(h ^ b, 0x01000193) >>> 0
  }
  return h
}

const PANTALONES_SOBRIOS = [1, 6, 7, 8, 10, 11]

/**
 * El aspecto de quien aún no ha elegido: sale de su id, igual en todos los
 * móviles, para que se le vea en 3D desde el primer segundo. Nada de
 * complementos (los elige la persona).
 */
export function aspectoPorDefecto(jugadorId: unknown): Aspecto {
  const h = fnv(String(jugadorId ?? '').trim() || 'player')
  return {
    mx: MX_IDS[h % MX_IDS.length],
    top: (h >>> 4) % 14,
    pants: PANTALONES_SOBRIOS[(h >>> 9) % PANTALONES_SOBRIOS.length],
    hair: (h >>> 13) % 7,
    items: {},
  }
}

type ConAvatar =
  | {
      avatar?: unknown
      character?: unknown
      character_chosen?: unknown
      user?: unknown
      id?: unknown
      display_name?: unknown
    }
  | null
  | undefined

/** El aspecto de quien eligió su personaje en la versión 2D: sólo cambia la figura, el resto de serie. */
export function aspectoDeLegacy(character: unknown): Aspecto | null {
  if (typeof character !== 'string' || !(character in MX_DE_LEGACY)) return null
  return { mx: MX_DE_LEGACY[character as Personaje], ...ASPECTO_BASE, items: {} }
}

/**
 * El aspecto de una ficha: el que trae su avatar (si es 3D y válido); el de su personaje 2D
 * si lo eligió así; y si no ha elegido nada, el que le toca por su id.
 */
export function aspectoDe(ficha: ConAvatar): Aspecto {
  const avatar = ficha?.avatar as { parts?: unknown; character?: unknown } | null | undefined
  const eligio = ficha?.character_chosen === true
  return (
    partsAAspecto(avatar?.parts) ??
    (eligio ? aspectoDeLegacy(avatar?.character ?? ficha?.character) : null) ??
    aspectoPorDefecto(ficha?.user || ficha?.id || ficha?.display_name || 'player')
  )
}

/** Clave estable de un aspecto (para saber si cambió y hay que reconstruir). */
export function claveDeAspecto(a: Aspecto): string {
  return [a.mx, a.top, a.pants, a.hair, ...HUECOS.map((h) => a.items[h.clave] ?? '')].join('|')
}

export type Conjunto = {
  es: string
  gl: string
  top: number
  pants: number
  hair: number
  items: readonly Complemento[]
}

/** «Un clic y listo»: no cambian el personaje, sólo colores y complementos. */
export const CONJUNTOS: readonly Conjunto[] = [
  {
    es: 'Peregrino',
    gl: 'Peregrino',
    top: 2,
    pants: 8,
    hair: 3,
    items: ['mochilaP', 'bordon', 'sombrero'],
  },
  {
    es: 'Día de mercado',
    gl: 'Día de mercado',
    top: 0,
    pants: 1,
    hair: 2,
    items: ['cesta', 'sombrero'],
  },
  { es: 'Gaiteiro', gl: 'Gaiteiro', top: 0, pants: 10, hair: 0, items: ['gaita', 'boina'] },
  {
    es: 'Cogedora de setas',
    gl: 'Cogomeleira',
    top: 5,
    pants: 6,
    hair: 4,
    items: ['cesta', 'boina', 'zocas'],
  },
  {
    es: 'Gaitera de tartán',
    gl: 'Gaiteira de tartán',
    top: 16,
    pants: 11,
    hair: 4,
    items: ['gaita', 'mochila'],
  },
  {
    es: 'Domingo con paraguas',
    gl: 'Domingo con paraugas',
    top: 6,
    pants: 11,
    hair: 5,
    items: ['paraguas', 'boina'],
  },
  {
    es: 'Chubasquero y paraguas',
    gl: 'Chuvasqueiro e paraugas',
    top: 9,
    pants: 10,
    hair: 1,
    items: ['paraguas', 'zocas'],
  },
  {
    es: 'Labrego con caxato',
    gl: 'Labrego con caxato',
    top: 15,
    pants: 7,
    hair: 1,
    items: ['bordon', 'boina', 'zocas'],
  },
  {
    es: 'Vikingo de Catoira',
    gl: 'Viquingo de Catoira',
    top: 3,
    pants: 7,
    hair: 3,
    items: ['casco', 'mochila'],
  },
  {
    es: 'Peregrina bajo la lluvia',
    gl: 'Peregrina baixo a choiva',
    top: 9,
    pants: 8,
    hair: 1,
    items: ['mochilaP', 'bordon', 'sombrero'],
  },
]

export function aplicarConjunto(a: Aspecto, c: Conjunto): Aspecto {
  const items: Partial<Record<Hueco, Complemento>> = {}
  for (const it of c.items) items[COMPLEMENTOS[it].hueco] = it
  return { ...a, top: c.top, pants: c.pants, hair: c.hair, items }
}

/** Dos aspectos iguales (misma ropa, mismo pelo, mismos complementos, mismo personaje). */
export function mismoAspecto(a: Aspecto, b: Aspecto): boolean {
  return claveDeAspecto(a) === claveDeAspecto(b)
}

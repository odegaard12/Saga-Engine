import type { DesbloqueosDelJugador } from '../../../types/player'
import {
  COLORES_DE_PELO,
  COLORES_DE_ROPA,
  COMPLEMENTOS,
  GESTOS,
  GESTOS_RETIRADOS,
  MX_NOMBRES,
  type Aspecto,
  type Complemento,
  type MxId,
} from './catalogo'

/**
 * El vestuario desbloqueable visto desde el móvil (contrato en backend/app/runtime/desbloqueos.py).
 *
 * Cada pieza de la tienda tiene una CLAVE: `mx:ChXX`, `ropa:N` (camiseta y pantalón comparten paleta), `hair:N`,
 * `item:<id>` y `gesto:<clip>`. El servidor dice cuáles están bloqueadas para ESTE jugador, cuáles ya ganó
 * (`mios`), cuáles son nuevas y sin ver (`nuevos`), la pista de cada una («Se consigue: …») y el progreso de cada
 * regla. Con `activos = false` todo es libre: ni un candado.
 *
 * Sin cobertura se usa la última copia (en el móvil). Lógica pura salvo `pedirDesbloqueos` y `marcarVisto`.
 */

export type Desbloqueos = DesbloqueosDelJugador

export const claveMx = (mx: string) => `mx:${mx}`
export const claveRopa = (i: number) => `ropa:${i}`
export const claveHair = (i: number) => `hair:${i}`
export const claveItem = (c: string) => `item:${c}`
export const claveGesto = (clip: string) => `gesto:${clip}`

const lista = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []

/** La clave de hoy: un gesto quitado (r16) pasa a su sustituto (una copia vieja del móvil aún puede traerlo). */
export function claveVigente(clave: string): string {
  if (!clave.startsWith('gesto:')) return clave
  const viejo = clave.slice(6)
  return GESTOS_RETIRADOS[viejo] ? claveGesto(GESTOS_RETIRADOS[viejo]) : clave
}
const ganadas = (v: unknown) => [...new Set(lista(v).map(claveVigente))]
/** Libres y bloqueados: lo quitado no cuenta (bloquear su sustituto dejaría sin un gesto que era libre). */
const vigentes = (v: unknown) =>
  lista(v).filter((k) => !(k.startsWith('gesto:') && k.slice(6) in GESTOS_RETIRADOS))

/** Lo que llega del servidor (o de la copia) en limpio; null si no tiene forma de desbloqueos. */
export function normalizarDesbloqueos(crudo: unknown): Desbloqueos | null {
  if (!crudo || typeof crudo !== 'object') return null
  const d = crudo as Partial<Desbloqueos>
  if (typeof d.activos !== 'boolean') return null
  return {
    status: 'ok',
    activos: d.activos,
    revision: Number(d.revision) || 0,
    libres: vigentes(d.libres),
    bloqueados: vigentes(d.bloqueados),
    mios: ganadas(d.mios),
    nuevos: ganadas(d.nuevos),
    reglas: Array.isArray(d.reglas)
      ? d.reglas.filter((r) => r && typeof r === 'object' && Array.isArray(r.da))
      : [],
    progreso: d.progreso && typeof d.progreso === 'object' ? d.progreso : {},
    pistas: d.pistas && typeof d.pistas === 'object' ? d.pistas : {},
    avisos: Array.isArray(d.avisos)
      ? d.avisos.filter((a) => a && typeof a === 'object' && typeof a.texto === 'string')
      : [],
  }
}

/** ¿Está bloqueada para este jugador? Los personajes no se bloquean nunca, y sin desbloqueos activos, nada. */
export function estaBloqueada(d: Desbloqueos | null | undefined, clave: string): boolean {
  if (!d || !d.activos || clave.startsWith('mx:')) return false
  if (d.mios.includes(clave)) return false
  return d.bloqueados.includes(clave)
}

/** Las claves que lleva un aspecto: personaje, camiseta, pantalón, pelo y complementos. */
export function clavesDeAspecto(a: Aspecto): string[] {
  const salida = [claveMx(a.mx), claveRopa(a.top), claveRopa(a.pants), claveHair(a.hair)]
  for (const c of Object.values(a.items)) if (c) salida.push(claveItem(c))
  return [...new Set(salida)]
}

/** Lo que lleva puesto y aún no ha ganado: no se puede guardar así. */
export function bloqueadasDeAspecto(a: Aspecto, d: Desbloqueos | null | undefined): string[] {
  return clavesDeAspecto(a).filter((k) => estaBloqueada(d, k))
}

/** «Se consigue: …» de una pieza (vacío si no hay pista). */
export function pistaDe(d: Desbloqueos | null | undefined, clave: string): string {
  return (d?.pistas?.[clave] ?? '').trim()
}

/** Cuánto le falta: la regla que la da con más avance (0..1), o null si no hay progreso que contar. */
export function progresoDe(
  d: Desbloqueos | null | undefined,
  clave: string
): { actual: number; meta: number; fraccion: number } | null {
  if (!d) return null
  let mejor: { actual: number; meta: number; fraccion: number } | null = null
  for (const r of d.reglas) {
    if (!r.da.includes(clave)) continue
    const p = d.progreso[r.id]
    if (!p || !(Number(p.meta) > 0)) continue
    const actual = Math.max(0, Number(p.actual) || 0)
    const meta = Number(p.meta)
    const fraccion = Math.min(1, actual / meta)
    if (!mejor || fraccion > mejor.fraccion)
      mejor = { actual: Math.min(actual, meta), meta, fraccion }
  }
  return mejor
}

/** Nombre de una pieza en el idioma de la tienda. */
export function nombreDeClave(clave: string, idioma: 'es' | 'gl'): string {
  const [tipo, valor = ''] = clave.split(':', 2)
  const n = Number(valor)
  if (tipo === 'mx') return MX_NOMBRES[valor as MxId] ?? valor
  if (tipo === 'ropa' && COLORES_DE_ROPA[n])
    return idioma === 'gl' ? COLORES_DE_ROPA[n].gl : COLORES_DE_ROPA[n].es
  if (tipo === 'hair' && COLORES_DE_PELO[n]) {
    const c = COLORES_DE_PELO[n]
    return idioma === 'gl' ? `Pelo ${c.gl.toLowerCase()}` : `Pelo ${c.es.toLowerCase()}`
  }
  if (tipo === 'item' && valor in COMPLEMENTOS) {
    const c = COMPLEMENTOS[valor as Complemento]
    return idioma === 'gl' ? c.gl : c.es
  }
  if (tipo === 'gesto') {
    const g = GESTOS.find((x) => x.clip === (GESTOS_RETIRADOS[valor] ?? valor))
    return g ? (idioma === 'gl' ? g.gl : g.es) : valor
  }
  return valor || clave
}

// ---------------------------------------------------------------- copia en el móvil y red

const claveCopia = (usuario: string) => `saga:desbloqueos:${usuario}`
/** La última que se supo en esta sesión (el menú de gestos la lee sin saber de quién es la partida). */
let ultima: Desbloqueos | null = null

export function ultimaConocida(): Desbloqueos | null {
  return ultima
}

export function leerCopia(usuario: string): Desbloqueos | null {
  try {
    const d = normalizarDesbloqueos(
      JSON.parse(window.localStorage.getItem(claveCopia(usuario)) || 'null')
    )
    if (d) ultima = d
    return d
  } catch {
    return null
  }
}

export function guardarCopia(usuario: string, d: Desbloqueos): void {
  ultima = d
  try {
    window.localStorage.setItem(claveCopia(usuario), JSON.stringify(d))
  } catch {
    // Sin almacenamiento: vale la de memoria.
  }
}

/** Avisa a quien muestre candados (tienda, menú de gestos, aviso del mapa) de que hay datos nuevos. */
export const EVENTO_DESBLOQUEOS = 'saga:desbloqueos'

/** Lo de ahora del servidor (y se guarda la copia); sin red o con error, la copia. */
export async function pedirDesbloqueos(
  usuario: string,
  timeoutMs = 4000
): Promise<Desbloqueos | null> {
  if (!usuario) return null
  const corte = new AbortController()
  const reloj = window.setTimeout(() => corte.abort(), timeoutMs)
  try {
    const res = await fetch(`/api/desbloqueos/${encodeURIComponent(usuario)}`, {
      headers: { Accept: 'application/json' },
      signal: corte.signal,
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const d = normalizarDesbloqueos(await res.json())
    if (!d) throw new Error('sin forma')
    guardarCopia(usuario, d)
    window.dispatchEvent(new CustomEvent(EVENTO_DESBLOQUEOS, { detail: d }))
    return d
  } catch {
    return leerCopia(usuario)
  } finally {
    window.clearTimeout(reloj)
  }
}

/** Marca vistas piezas nuevas o avisos. Sin red se pierde (se volverá a enseñar, que es lo seguro). */
export async function marcarVisto(
  usuario: string,
  que: { claves?: string[]; avisos?: number[] }
): Promise<void> {
  // La copia deja de tenerlos ya: no se repite el aviso mientras llega la respuesta.
  const d = ultima
  if (d) {
    const vistas = new Set(que.claves ?? [])
    const avisos = new Set(que.avisos ?? [])
    guardarCopia(usuario, {
      ...d,
      nuevos: que.claves ? d.nuevos.filter((k) => !vistas.has(k)) : d.nuevos,
      avisos: que.avisos ? d.avisos.filter((a) => !avisos.has(a.id)) : d.avisos,
    })
  }
  try {
    await fetch('/api/desbloqueos/visto', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ user: usuario, ...que }),
    })
  } catch {
    // Sin red: se volverá a enseñar la próxima vez.
  }
}

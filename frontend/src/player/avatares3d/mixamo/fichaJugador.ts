/**
 * Los datos de la ficha de un compañero (la hoja que sale al tocarlo en el mapa), sin DOM ni red:
 * todo sale de lo que ya trae `/api/team` y queda en el móvil, así que sin cobertura la ficha
 * enseña lo último que se supo.
 *
 * - Conexión: «en vivo» (presence live), «hace N min» (stale) o «sin conexión» (offline), con
 *   `last_seen` (segundos) para el «hace N min».
 * - Nodos hechos de N: `level` es el índice del nodo en juego (los anteriores están hechos); quien
 *   terminó los tiene todos.
 * - Tiempo: `total_time_ms`, el mismo campo que usa la clasificación.
 */

export type IdiomaFicha = 'es' | 'gl' | 'en'

export type JugadorDeFicha = {
  user?: string
  display_name?: string
  presence?: string
  last_seen?: number
  level?: number
  finished?: boolean
  total_nodes?: number
  total_time_ms?: number
}

export type Conexion =
  | { tipo: 'vivo' }
  | { tipo: 'reciente'; minutos: number | null }
  | { tipo: 'sin'; minutos: number | null }

export type DatosDeFicha = {
  nombre: string
  conexion: Conexion
  hechos: number
  total: number
  terminado: boolean
  tiempoMs: number
}

/** Minutos desde `last_seen` (segundos de época), o null si no se sabe. */
export function minutosDesde(ultimaVezS: number | undefined, ahoraMs: number): number | null {
  if (typeof ultimaVezS !== 'number' || !Number.isFinite(ultimaVezS) || ultimaVezS <= 0) return null
  return Math.max(0, Math.floor((ahoraMs / 1000 - ultimaVezS) / 60))
}

export function conexionDe(j: JugadorDeFicha, ahoraMs: number): Conexion {
  const p = String(j.presence || 'offline').toLowerCase()
  const minutos = minutosDesde(j.last_seen, ahoraMs)
  if (p === 'offline') return { tipo: 'sin', minutos }
  if (p === 'stale') return { tipo: 'reciente', minutos }
  return { tipo: 'vivo' }
}

export function datosDeFicha(
  j: JugadorDeFicha,
  totalMision: number,
  ahoraMs: number
): DatosDeFicha {
  const total = Math.max(0, Math.floor(Number(j.total_nodes) || totalMision || 0))
  const nivel = Math.max(0, Math.floor(Number(j.level) || 0))
  const terminado = Boolean(j.finished)
  const hechos = terminado ? total : total > 0 ? Math.min(nivel, total) : nivel
  const tiempoMs = Math.max(0, Number(j.total_time_ms) || 0)
  return {
    nombre: String(j.display_name || j.user || ''),
    conexion: conexionDe(j, ahoraMs),
    hechos,
    total,
    terminado,
    tiempoMs,
  }
}

/** «12:05» o «1:02:05» (h:mm:ss a partir de una hora). */
export function tiempoLegible(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

export const TEXTOS_FICHA = {
  es: {
    titulo: (n: string) => `Ficha de ${n}`,
    jugador: 'Jugador',
    vivo: 'En vivo',
    hace: (m: number) =>
      m < 1 ? 'Hace un momento' : m < 60 ? `Hace ${m} min` : `Hace ${Math.floor(m / 60)} h`,
    sin: 'Sin conexión',
    sinVisto: (cuando: string) => `Sin conexión · visto ${cuando.toLowerCase()}`,
    nodos: 'Nodos',
    deTotal: (h: number, t: number) => (t > 0 ? `${h} de ${t}` : `${h}`),
    terminado: '¡Terminado!',
    tiempo: 'Tiempo',
    irA: 'Ir a él',
    saludar: 'Saludar',
    cerrar: 'Cerrar',
    gira: 'Desliza para girar',
    sinModelo: 'Su personaje 3D no está en este móvil todavía.',
    cacheado: 'Sin cobertura: datos de la última vez',
  },
  gl: {
    titulo: (n: string) => `Ficha de ${n}`,
    jugador: 'Xogador',
    vivo: 'En directo',
    hace: (m: number) =>
      m < 1 ? 'Hai un momento' : m < 60 ? `Hai ${m} min` : `Hai ${Math.floor(m / 60)} h`,
    sin: 'Sen conexión',
    sinVisto: (cuando: string) => `Sen conexión · visto ${cuando.toLowerCase()}`,
    nodos: 'Nodos',
    deTotal: (h: number, t: number) => (t > 0 ? `${h} de ${t}` : `${h}`),
    terminado: 'Rematado!',
    tiempo: 'Tempo',
    irA: 'Ir onda el',
    saludar: 'Saudar',
    cerrar: 'Pechar',
    gira: 'Esvara para xirar',
    sinModelo: 'O seu personaxe 3D aínda non está neste móbil.',
    cacheado: 'Sen cobertura: datos da última vez',
  },
  en: {
    titulo: (n: string) => `${n}'s card`,
    jugador: 'Player',
    vivo: 'Live',
    hace: (m: number) =>
      m < 1 ? 'Just now' : m < 60 ? `${m} min ago` : `${Math.floor(m / 60)} h ago`,
    sin: 'Offline',
    sinVisto: (cuando: string) => `Offline · seen ${cuando.toLowerCase()}`,
    nodos: 'Nodes',
    deTotal: (h: number, t: number) => (t > 0 ? `${h} of ${t}` : `${h}`),
    terminado: 'Finished!',
    tiempo: 'Time',
    irA: 'Go to them',
    saludar: 'Wave',
    cerrar: 'Close',
    gira: 'Swipe to turn',
    sinModelo: 'Their 3D character is not on this phone yet.',
    cacheado: 'No signal: last known data',
  },
} as const

export function idiomaDeFicha(locale: string | null | undefined): IdiomaFicha {
  return locale === 'gl' || locale === 'en' ? locale : 'es'
}

/** El texto de la conexión en el idioma pedido. */
export function textoDeConexion(c: Conexion, idioma: IdiomaFicha): string {
  const t = TEXTOS_FICHA[idioma]
  if (c.tipo === 'vivo') return t.vivo
  if (c.tipo === 'reciente') return c.minutos === null ? t.hace(0) : t.hace(c.minutos)
  return c.minutos === null ? t.sin : t.sinVisto(t.hace(c.minutos))
}

/** El clip de «Saludar» (el mismo gesto que el menú de tocarte). */
export const GESTO_SALUDAR = 'ge__salute'

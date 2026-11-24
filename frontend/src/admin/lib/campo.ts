/**
 * El panel de campo (24/11, dirección B): lo que se decide sin React. Quién va en cada grupo de arriba (en ruta, atención,
 * terminó), los grupos de jugadores en el mapa alejado y cómo se dice cada aviso del antitrampa (gravedad y frase).
 */
import type { AdminPerfilEnVivo, AdminReactOverviewStage, AntiCheatPlayerFlags, AntiCheatSuspicion } from './adminApi'
import { atencionDe, type Atencion } from './estadoDeJugador'
import { etiquetaProximidad } from './etiquetasProximidad'

export type Grupo = 'ruta' | 'atencion' | 'fin'

/** El grupo de arriba al que pertenece cada atención: sin conexión, atascado o señal floja necesitan que lo mires. */
export function grupoDe(a: Atencion): Grupo {
  if (a === 'terminado') return 'fin'
  if (a === 'normal') return 'ruta'
  return 'atencion'
}

export type JugadorDeCampo = {
  id: string
  nombre: string
  iniciales: string
  color: string
  nivel: number
  terminado: boolean
  vivo?: AdminPerfilEnVivo
  atencion: Atencion
  grupo: Grupo
}

export function contarGrupos(jugadores: Pick<JugadorDeCampo, 'grupo'>[]): Record<Grupo, number> {
  const n: Record<Grupo, number> = { ruta: 0, atencion: 0, fin: 0 }
  for (const j of jugadores) n[j.grupo] += 1
  return n
}

export function jugadorDeCampo(o: {
  id: string
  nombre: string
  iniciales: string
  color: string
  nivel: number
  terminado: boolean
  vivo?: AdminPerfilEnVivo
  serverTs: number | null
}): JugadorDeCampo {
  const atencion = atencionDe({ vivo: o.vivo, serverTs: o.serverTs, terminado: o.terminado })
  return { ...o, atencion, grupo: grupoDe(atencion) }
}

/**
 * Dos letras para el círculo del mapa: las iniciales de dos palabras («Marta Rivas» → MR) o las dos primeras de una
 * sola («Faro» → FA). Con una letra, «Lontra» y «Lobo» eran dos L iguales en el mapa.
 */
export function dosLetras(nombre: string, elegidas?: string): string {
  const propias = String(elegidas || '').trim()
  if (propias) return propias.slice(0, 2).toUpperCase()
  const palabras = String(nombre || '').trim().split(/\s+/).filter(Boolean)
  if (palabras.length >= 2) return (palabras[0][0] + palabras[1][0]).toUpperCase()
  return (palabras[0] || '?').slice(0, 2).toUpperCase()
}

/** ¿Tinta clara u oscura sobre este color de fondo? (contraste WCAG; los colores no hexadecimales llevan tinta clara). */
export function tintaClara(fondo: string): boolean {
  const m = /^#([0-9a-f]{6})$/i.exec(String(fondo).trim())
  if (!m) return true
  const v = [0, 2, 4].map((i) => {
    const c = parseInt(m[1].slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  const luz = 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]
  return 1.05 / (luz + 0.05) >= (luz + 0.05) / 0.0566
}

/** Por debajo de este zoom, quien va al mismo nodo se agrupa en un círculo con el número. */
export const ZOOM_PARA_AGRUPAR = 17

export type Punto = { id: string; lat: number; lon: number; nivel: number; terminado: boolean; atencion: Atencion }
export type Racimo = { clave: string; lat: number; lon: number; ids: string[]; peor: Atencion }

const PEOR: Atencion[] = ['sin_conexion', 'atascado', 'senal_floja', 'normal', 'terminado']

/**
 * Agrupa por nodo (y los terminados aparte) cuando el mapa está alejado; un grupo de uno se queda como jugador suelto.
 * El círculo va en el centro de sus posiciones, con el estado del peor (para que un «sin conexión» no se esconda).
 */
export function agruparPorNodo<T extends Punto>(puntos: T[], zoom: number): { sueltos: T[]; racimos: Racimo[] } {
  if (zoom >= ZOOM_PARA_AGRUPAR) return { sueltos: puntos, racimos: [] }
  const grupos = new Map<string, T[]>()
  for (const p of puntos) {
    const clave = p.terminado ? 'fin' : `n${p.nivel}`
    grupos.set(clave, [...(grupos.get(clave) ?? []), p])
  }
  const sueltos: T[] = []
  const racimos: Racimo[] = []
  for (const [clave, lista] of grupos) {
    if (lista.length === 1) {
      sueltos.push(lista[0])
      continue
    }
    racimos.push({
      clave,
      lat: lista.reduce((s, p) => s + p.lat, 0) / lista.length,
      lon: lista.reduce((s, p) => s + p.lon, 0) / lista.length,
      ids: lista.map((p) => p.id),
      peor: lista.map((p) => p.atencion).sort((a, b) => PEOR.indexOf(a) - PEOR.indexOf(b))[0],
    })
  }
  return { sueltos, racimos }
}

/* ---------------------------------------------------------------- avisos */

export type Gravedad = 'alta' | 'media' | 'nota'

/** Lo que casi seguro es trampa o un móvil tocado. El resto de sospechas: media. Las notas (`info`): nota. */
const ALTA = new Set([
  'impossible_travel_speed',
  'completion_faster_than_possible',
  'offline_event_timestamp_in_future',
  'evidence_answer_mismatch',
  'evidence_rounds_mismatch',
  'evidence_qr_mismatch',
  'evidence_missing',
  'evidence_too_fast',
])

export function gravedadDe(s: AntiCheatSuspicion): Gravedad {
  if (s.severity === 'info') return 'nota'
  return ALTA.has(s.reason) ? 'alta' : 'media'
}

export const TEXTO_GRAVEDAD: Record<Gravedad, string> = { alta: 'Alta', media: 'Media', nota: 'Nota' }

const TITULO: Record<string, string> = {
  impossible_travel_speed: 'Demasiado rápido',
  completion_faster_than_possible: 'Juego superado demasiado rápido',
  offline_event_timestamp_in_future: 'Hora del móvil adelantada',
  declared_time_exceeds_observed: 'Declara más tiempo del que pasó',
  proximity_far_from_node: 'Lejos del nodo',
  proximity_no_gps: 'Sin GPS',
  proximity_test_mode: 'Modo prueba',
  manual_position_used: 'Posición manual',
  salio_app: 'Salió de la app',
  left_app_during_minigame: 'Salió de la app',
  opened_app_switcher_during_minigame: 'Abrió otras apps',
  evidence_answer_mismatch: 'La respuesta no cuadra',
  evidence_rounds_mismatch: 'Las rondas no cuadran',
  evidence_penalty_short: 'Penalización recortada',
  evidence_too_fast: 'Respuestas demasiado rápidas',
  evidence_qr_mismatch: 'QR de otro nodo',
  evidence_gps_far_mapa_mudo: 'Mapa mudo lejos del punto',
  evidence_gps_missing: 'Mapa mudo sin GPS',
  evidence_missing: 'Sin la prueba del juego',
  evidence_legacy_client: 'App antigua',
  evidence_unreadable: 'Prueba ilegible',
}

/** Lo que significa cada motivo, dicho entero (la frase de la tarjeta cuando la prueba no trae números). */
const DESCRIPCION: Record<string, string> = {
  proximity_no_gps: 'Avanzó sin dar ninguna posición de GPS (rescate o GPS denegado)',
  proximity_test_mode: 'Avanzó en modo prueba, con la posición simulada',
  manual_position_used: 'Usó la posición manual',
  opened_app_switcher_during_minigame: 'Abrió el selector de apps con un juego abierto',
  evidence_answer_mismatch: 'La respuesta que mandó su móvil no es la que tiene el servidor',
  evidence_rounds_mismatch: 'Las rondas que jugó no son las que tocaban',
  evidence_penalty_short: 'Su móvil se apuntó menos penalización que los fallos que tuvo',
  evidence_too_fast: 'Contestó las rondas más rápido de lo humano',
  evidence_qr_mismatch: 'El QR que leyó es de otro nodo',
  evidence_gps_far_mapa_mudo: 'En el mapa mudo, ningún GPS suyo pasó cerca del punto',
  evidence_gps_missing: 'Completó el mapa mudo sin muestras de GPS',
  evidence_missing: 'Llegó sin la prueba que exige el juego (móvil modificado o app rota)',
  evidence_legacy_client: 'Lo completó con una versión antigua de la app, sin prueba',
  evidence_unreadable: 'La prueba del juego llegó ilegible',
}

function num(v: unknown): number | null {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** «nodo 6» con el número que ve el organizador (posición en la ruta), si se sabe. */
export function nodoDe(nodeId: unknown, stages: Pick<AdminReactOverviewStage, 'id' | 'index'>[]): string {
  if (nodeId === null || nodeId === undefined || nodeId === '') return ''
  const i = stages.findIndex((s) => String(s.id) === String(nodeId))
  return i >= 0 ? `el nodo ${i + 1}` : ''
}

/** El título corto y la frase llana de un aviso, con los números de su prueba. */
export function fraseDeAviso(
  s: AntiCheatSuspicion,
  stages: Pick<AdminReactOverviewStage, 'id' | 'index'>[]
): { titulo: string; frase: string } {
  const e = (s.evidence || {}) as Record<string, unknown>
  const nodo = nodoDe(e.node_id, stages)
  const titulo = TITULO[s.reason] || etiquetaProximidad(s.reason) || 'Aviso del servidor'
  const enNodo = nodo ? ` en ${nodo}` : ''
  switch (s.reason) {
    case 'impossible_travel_speed': {
      const d = num(e.distance_m ?? e.distancia_m)
      const t = num(e.elapsed_s ?? e.segundos)
      const v = num(e.speed_kmh ?? e.velocidad_kmh)
      const partes = [d !== null && t !== null ? `${Math.round(d)} m en ${Math.round(t)} s` : '', v !== null ? `(${Math.round(v)} km/h)` : '']
      return { titulo, frase: `${partes.filter(Boolean).join(' ') || 'Se movió más rápido de lo posible a pie'}.` }
    }
    case 'completion_faster_than_possible': {
      const ms = num(e.time_spent_ms ?? e.ms)
      const umbral = num(e.min_plausible_ms ?? e.umbral_ms)
      if (ms === null) return { titulo, frase: `Lo superó más rápido de lo posible${enNodo}.` }
      return {
        titulo,
        frase: `Lo superó en ${(ms / 1000).toFixed(1)} s${enNodo}${umbral !== null ? ` (mínimo creíble ${Math.round(umbral / 1000)} s)` : ''}.`,
      }
    }
    case 'proximity_far_from_node': {
      const d = num(e.distancia_minima_m)
      const margen = num(e.tolerancia_m)
      const gps = num(e.precision_m)
      const extra = [margen !== null ? `margen ${Math.round(margen)} m` : '', gps !== null ? `GPS ±${Math.round(gps)} m` : '']
        .filter(Boolean)
        .join(', ')
      return {
        titulo,
        frase: `Superó ${nodo || 'el nodo'}${d !== null ? ` a ${Math.round(d)} m` : ' lejos de él'}${extra ? ` (${extra})` : ''}.`,
      }
    }
    case 'offline_event_timestamp_in_future': {
      const ms = num(e.ahead_ms) ?? (num(e.adelanto_s) !== null ? Number(e.adelanto_s) * 1000 : null)
      return { titulo, frase: `Un evento sin red llegó con la hora ${ms !== null ? `${Math.round(ms / 60000)} min ` : ''}adelantada${enNodo}.` }
    }
    case 'declared_time_exceeds_observed': {
      const dec = num(e.declared_ms)
      const obs = num(e.observed_ms)
      return {
        titulo,
        frase: dec !== null && obs !== null ? `Dice ${Math.round(dec / 1000)} s; el servidor vio ${Math.round(obs / 1000)} s${enNodo}.` : `${titulo}${enNodo}.`,
      }
    }
    case 'salio_app':
    case 'left_app_during_minigame':
      return { titulo, frase: `Cambió de aplicación con un juego abierto${enNodo}.` }
    default:
      return { titulo, frase: `${DESCRIPCION[s.reason] || etiquetaProximidad(s.reason) || 'Anotado por el servidor'}${enNodo}.` }
  }
}

export type AvisoDeCampo = {
  clave: string
  profileId: string
  nombre: string
  s: AntiCheatSuspicion & { revisada_en?: number; revisada_como?: string }
  gravedad: Gravedad
  revisado: boolean
}

export type FiltroDeAvisos = 'revisar' | 'notas' | 'revisados'

/** Todos los avisos de todos, del más reciente al más viejo, con su gravedad y si ya se revisaron. */
export function avisosDeCampo(jugadores: AntiCheatPlayerFlags[], revisadosAqui: Set<string> = new Set()): AvisoDeCampo[] {
  const lista: AvisoDeCampo[] = []
  for (const j of jugadores) {
    for (const s of j.suspicions || []) {
      const clave = `${j.user}|${s.at}|${s.reason}`
      const ss = s as AvisoDeCampo['s']
      lista.push({
        clave,
        profileId: j.user,
        nombre: j.display_name || j.user,
        s: ss,
        gravedad: gravedadDe(s),
        revisado: Boolean(ss.revisada_en) || revisadosAqui.has(clave),
      })
    }
  }
  return lista.sort((a, b) => b.s.at - a.s.at)
}

export function filtrarAvisos(lista: AvisoDeCampo[], filtro: FiltroDeAvisos): AvisoDeCampo[] {
  if (filtro === 'notas') return lista.filter((a) => a.gravedad === 'nota' && !a.revisado)
  if (filtro === 'revisados') return lista.filter((a) => a.revisado)
  // Para revisar: alta antes que media; dentro, lo más reciente primero.
  return lista
    .filter((a) => a.gravedad !== 'nota' && !a.revisado)
    .sort((a, b) => (a.gravedad === b.gravedad ? b.s.at - a.s.at : a.gravedad === 'alta' ? -1 : 1))
}

export function contarAvisos(lista: AvisoDeCampo[]): Record<FiltroDeAvisos, number> {
  return {
    revisar: filtrarAvisos(lista, 'revisar').length,
    notas: filtrarAvisos(lista, 'notas').length,
    revisados: filtrarAvisos(lista, 'revisados').length,
  }
}

/** «11:42» con la hora de este móvil. */
export function horaCorta(ms: number): string {
  const d = new Date(ms)
  return Number.isNaN(d.getTime()) ? '' : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** «hace 6 s», «hace 3 min»: cuánto hace de la última respuesta buena del servidor. */
export function haceCuanto(segundos: number): string {
  if (segundos < 60) return `hace ${Math.max(0, Math.round(segundos))} s`
  if (segundos < 3600) return `hace ${Math.round(segundos / 60)} min`
  return `hace ${Math.round(segundos / 3600)} h`
}

/**
 * Cómo está cada jugador, dicho para el organizador (ficha de campo y lista de Jugadores).
 *
 * Puro (sin React): decide qué chips enseñar y quién necesita atención antes. Los datos llegan del sondeo ligero
 * (`estadoEnVivo.ts`); aquí solo se interpretan.
 */
import type { AdminPerfilEnVivo, AdminReactOverviewStage } from './adminApi'
import {
  antiguedadDeLaSenalS,
  estaAtascado,
  minutosEnElNodo,
  textoDeAntiguedad,
} from './estadoEnVivo'

export type Tono = 'ok' | 'aviso' | 'error' | 'neutro' | 'acento'

export type DatosChip = {
  clave: string
  texto: string
  tono: Tono
  /** Punto de estado delante del texto (presencia). */
  punto?: boolean
}

export type Atencion = 'sin_conexion' | 'atascado' | 'senal_floja' | 'normal' | 'terminado'

const ORDEN_DE_ATENCION: Record<Atencion, number> = {
  sin_conexion: 0,
  atascado: 1,
  senal_floja: 2,
  normal: 3,
  terminado: 4,
}

/** GPS que no está dando posición. */
const GPS_MALO = new Set(['unavailable', 'denied', 'error'])

/** Pasada la mitad de esto de error (m) la posición ya no sirve para saber si está en el nodo. */
export const PRECISION_FLOJA_M = 50

export type EntradaDeEstado = {
  vivo?: AdminPerfilEnVivo
  serverTs: number | null
  terminado: boolean
}

/** «Nodo 5 de 13 · Pulso de hierro»; «Terminó los 13 nodos» si acabó. */
export function textoDeNodo(
  nivel: number | null | undefined,
  total: number,
  titulo: string | null | undefined,
  terminado: boolean
): string {
  if (terminado) return total > 0 ? `Terminó los ${total} nodos` : 'Terminó'
  const n = Math.max(0, Number(nivel ?? 0))
  const base = `Nodo ${n + 1} de ${total}`
  return titulo ? `${base} · ${titulo}` : base
}

/** Cuánto hace de su última señal (s), o null si no se sabe. */
export function antiguedadDeJugador(
  vivo: AdminPerfilEnVivo | undefined,
  serverTs: number | null
): number | null {
  return antiguedadDeLaSenalS(vivo?.last_seen ?? null, serverTs)
}

/** Por qué (si hay motivo) este jugador necesita que lo mires. */
export function atencionDe({ vivo, serverTs, terminado }: EntradaDeEstado): Atencion {
  if (terminado) return 'terminado'
  if (!vivo) return 'normal'
  if (vivo.presence === 'offline') return 'sin_conexion'
  if (estaAtascado(vivo, serverTs)) return 'atascado'
  const status = String(vivo.gps_status || '').toLowerCase()
  const precision = Number(vivo.precision_m)
  const imprecisa = Number.isFinite(precision) && precision > PRECISION_FLOJA_M * 2
  if (vivo.presence === 'stale' || GPS_MALO.has(status) || imprecisa) return 'senal_floja'
  return 'normal'
}

export function puntuacionDeAtencion(atencion: Atencion): number {
  return ORDEN_DE_ATENCION[atencion]
}

/** Quién primero: sin conexión, atascado, señal floja, normal y, al final, los que ya terminaron. Estable. */
export function ordenarPorAtencion<T>(filas: T[], atencion: (fila: T) => Atencion): T[] {
  return filas
    .map((fila, indice) => ({ fila, indice, orden: ORDEN_DE_ATENCION[atencion(fila)] }))
    .sort((a, b) => a.orden - b.orden || a.indice - b.indice)
    .map((x) => x.fila)
}

export type ResumenDeLista = {
  jugando: number
  atencion: number
  sinConexion: number
  terminados: number
}

/** Los cuatro números de arriba de la lista. Cada jugador cuenta en uno solo. */
export function resumenDeLista(atenciones: Atencion[]): ResumenDeLista {
  const r: ResumenDeLista = { jugando: 0, atencion: 0, sinConexion: 0, terminados: 0 }
  for (const a of atenciones) {
    if (a === 'terminado') r.terminados += 1
    else if (a === 'sin_conexion') r.sinConexion += 1
    else if (a === 'atascado' || a === 'senal_floja') r.atencion += 1
    else r.jugando += 1
  }
  return r
}

/** Lo que dice el chip de presencia: «En vivo · hace 12 s», «Señal vieja · hace 4 min», «Sin conexión · hace 25 min». */
export function textoDePresencia(
  presence: string | undefined,
  antiguedadS: number | null
): { texto: string; tono: Tono } {
  const cuando = textoDeAntiguedad(antiguedadS)
  if (presence === 'live') {
    return { texto: cuando && cuando !== 'ahora' ? `En vivo · ${cuando}` : 'En vivo', tono: 'ok' }
  }
  if (presence === 'stale')
    return { texto: `Señal vieja${cuando ? ` · ${cuando}` : ''}`, tono: 'aviso' }
  if (presence === 'offline') {
    return {
      texto: antiguedadS === null ? 'Sin conexión' : `Sin conexión · ${cuando}`,
      tono: 'error',
    }
  }
  return { texto: 'Sin datos', tono: 'neutro' }
}

/** El chip del GPS: solo cuando dice algo (precisión conocida o GPS que falla). */
export function chipDeGps(vivo: AdminPerfilEnVivo | undefined): DatosChip | null {
  if (!vivo) return null
  const status = String(vivo.gps_status || '').toLowerCase()
  const precision = Number(vivo.precision_m)
  if (GPS_MALO.has(status))
    return { clave: 'gps', texto: status === 'denied' ? 'GPS denegado' : 'Sin GPS', tono: 'error' }
  if (Number.isFinite(precision) && precision > 0) {
    return {
      clave: 'gps',
      texto: `GPS ±${Math.round(precision)} m`,
      tono: precision > PRECISION_FLOJA_M ? 'aviso' : 'ok',
    }
  }
  if (status === 'searching') return { clave: 'gps', texto: 'Buscando GPS', tono: 'aviso' }
  if (status === 'stale') return { clave: 'gps', texto: 'GPS sin actualizar', tono: 'aviso' }
  return null
}

export type OpcionesDeChips = EntradaDeEstado & {
  tiempoTotalMs?: number | null
  estrellas?: number | null
  /** Texto del total ya formateado («6m 48s»). */
  tiempoTexto?: string
}

/** Los chips de la ficha, en el orden en que se leen: presencia, atasco, GPS, tiempo, estrellas. */
export function chipsDeJugador(o: OpcionesDeChips): DatosChip[] {
  const chips: DatosChip[] = []
  const edad = antiguedadDeJugador(o.vivo, o.serverTs)
  if (o.terminado) {
    chips.push({ clave: 'fin', texto: 'Terminó la ruta', tono: 'acento', punto: true })
  } else {
    const p = textoDePresencia(o.vivo?.presence, edad)
    chips.push({ clave: 'presencia', texto: p.texto, tono: p.tono, punto: true })
    const minutos = minutosEnElNodo(o.vivo, o.serverTs)
    if (minutos !== null && minutos >= 5) {
      chips.push({
        clave: 'nodo',
        texto: `${minutos} min en este nodo`,
        tono: estaAtascado(o.vivo, o.serverTs) ? 'aviso' : 'neutro',
      })
    }
    const gps = chipDeGps(o.vivo)
    if (gps) chips.push(gps)
  }
  if (o.tiempoTexto)
    chips.push({ clave: 'tiempo', texto: `Tiempo ${o.tiempoTexto}`, tono: 'neutro' })
  if (typeof o.estrellas === 'number') {
    chips.push({ clave: 'estrellas', texto: `★ ${o.estrellas}`, tono: 'neutro' })
  }
  return chips
}

/** Chips cortos para una fila de la lista: lo que hace falta para decidir a quién mirar. */
export function chipsDeFila(o: EntradaDeEstado): DatosChip[] {
  if (o.terminado) return [{ clave: 'fin', texto: 'Terminó', tono: 'acento', punto: true }]
  const chips: DatosChip[] = []
  const edad = antiguedadDeJugador(o.vivo, o.serverTs)
  const p = textoDePresencia(o.vivo?.presence, edad)
  chips.push({ clave: 'presencia', texto: p.texto, tono: p.tono, punto: true })
  const minutos = minutosEnElNodo(o.vivo, o.serverTs)
  if (minutos !== null && minutos >= 5) {
    chips.push({
      clave: 'nodo',
      texto: `${minutos} min`,
      tono: estaAtascado(o.vivo, o.serverTs) ? 'aviso' : 'neutro',
    })
  }
  const gps = chipDeGps(o.vivo)
  if (gps && gps.tono !== 'ok') chips.push(gps)
  return chips
}

/**
 * Lo que da un nodo al completarlo, con lo que el panel sabe de él: el objeto del coleccionable y el premio del minijuego.
 * El resumen de nodos no trae todo (los accesorios por reglas no se ven aquí): la respuesta del servidor dice lo que
 * se entregó de verdad.
 */
export function entregaDeNodo(stage: AdminReactOverviewStage | undefined): string[] {
  if (!stage) return []
  const salida: string[] = []
  const vistos = new Set<string>()
  const poner = (id: unknown, etiqueta: unknown) => {
    const clave = String(id || '').trim()
    if (!clave || vistos.has(clave)) return
    vistos.add(clave)
    salida.push(String(etiqueta || clave).trim() || clave)
  }
  if (stage.physical_node_kind === 'collectible' || stage.physical_item_kind === 'collectible') {
    poner(
      stage.physical_item_id || stage.physical_qr?.item_id,
      stage.physical_item_label || stage.physical_qr?.label
    )
  }
  const config = ((stage as unknown as { config?: Record<string, unknown> }).config ||
    {}) as Record<string, unknown>
  poner(config.reward_item_id, config.reward_item_label)
  return salida
}

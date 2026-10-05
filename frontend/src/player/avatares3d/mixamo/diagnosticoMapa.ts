/**
 * Diagnóstico de los avatares del mapa (`?depurar-mapa`): por cada jugador, si se pinta en 3D o en retrato y, si es
 * retrato, POR QUÉ. Lógica pura (sin three.js ni mapa) para poder probarla en Node; el panel que lo enseña está en
 * `panelDepuracion.ts`. Nada de esto aparece sin el parámetro.
 */

export type MotivoDeRetrato =
  | 'zoom_bajo'
  | 'mapa_plano'
  | 'sin_posicion'
  | 'presencia_antigua'
  | 'agrupado'
  | 'fuera_de_pantalla'
  | 'sin_modelo'
  | 'cargando_modelo'
  | 'fallo_de_carga'
  | 'tope_de_calidad'
  | 'sin_cota'

export const TEXTO_DE_MOTIVO: Record<MotivoDeRetrato, string> = {
  zoom_bajo: 'zoom bajo',
  mapa_plano: 'mapa casi plano (inclina el mapa)',
  sin_posicion: 'sin posición',
  presencia_antigua: 'presencia antigua (>10 min sin latido)',
  agrupado: 'agrupado (zoom lejano)',
  fuera_de_pantalla: 'fuera de pantalla',
  sin_modelo: 'sin modelo: no está en el móvil',
  cargando_modelo: 'cargando modelo',
  fallo_de_carga: 'fallo de carga del modelo',
  tope_de_calidad: 'tope de calidad',
  sin_cota: 'sin cota del terreno',
}

export type EstadoDelModelo = 'listo' | 'cargando' | 'no_esta' | 'fallo' | 'pendiente'

export type EntradaDeMotivo = {
  tienePosicion: boolean
  presencia: 'live' | 'recent' | 'offline'
  agrupado: boolean
  /** ¿Zoom e inclinación permiten 3D? (`formaQuePermiteTresD`) */
  zoomAlto: boolean
  inclinado: boolean
  dentroDePantalla: boolean
  modelo: EstadoDelModelo
  /** Lo eligió el reparto por calidad. */
  elegido: boolean
  cotaConocida: boolean
}

/** `null` = va en 3D (o lo hará en el siguiente fotograma). */
export function motivoDeRetrato(e: EntradaDeMotivo): MotivoDeRetrato | null {
  if (!e.tienePosicion) return 'sin_posicion'
  if (e.presencia === 'offline') return 'presencia_antigua'
  if (e.agrupado) return 'agrupado'
  if (!e.zoomAlto) return 'zoom_bajo'
  if (!e.inclinado) return 'mapa_plano'
  if (!e.dentroDePantalla) return 'fuera_de_pantalla'
  if (e.modelo === 'no_esta') return 'sin_modelo'
  if (e.modelo === 'fallo') return 'fallo_de_carga'
  if (e.modelo === 'cargando' || e.modelo === 'pendiente') return 'cargando_modelo'
  if (!e.elegido) return 'tope_de_calidad'
  if (!e.cotaConocida) return 'sin_cota'
  return null
}

export type FilaDeDiagnostico = {
  nombre: string
  /** `character_chosen` tal como llega (null = no vino). */
  elegido: boolean | null
  /** Personaje (Mixamo) cuyo modelo usa. */
  aspecto: string
  tresD: boolean
  motivo: MotivoDeRetrato | null
  esYo?: boolean
}

export type ResumenDeDiagnostico = {
  calidad: string
  tope: number
  fps: number
  zoom: number
  inclinacion: number
}

const cortar = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s)

/** El texto que se copia desde el móvil: una línea por jugador. */
export function textoDeDiagnostico(filas: readonly FilaDeDiagnostico[], r: ResumenDeDiagnostico): string {
  const cab = `calidad=${r.calidad} tope=${r.tope}(+tú) fps=${Math.round(r.fps)} zoom=${r.zoom.toFixed(1)} inclinacion=${Math.round(r.inclinacion)}`
  const lineas = filas.map((f) => {
    const donde = f.tresD ? '3D' : `retrato (${f.motivo ? TEXTO_DE_MOTIVO[f.motivo] : '?'})`
    const eleg = f.elegido === null ? '?' : f.elegido ? 'sí' : 'no'
    return `${f.esYo ? '* ' : ''}${cortar(f.nombre, 18)} | elegido=${eleg} | ${f.aspecto} | ${donde}`
  })
  return [cab, ...lineas].join('\n')
}

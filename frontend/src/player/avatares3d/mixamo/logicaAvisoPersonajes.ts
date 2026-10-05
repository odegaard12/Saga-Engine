/**
 * El aviso del mapa «Faltan personajes por descargar · Descargar».
 *
 * Los modelos 3D se bajan en la PANTALLA DE CARGA. Si alguien pulsó «Entrar igualmente» (o la red falló) y
 * falta el modelo de algún personaje, esa persona ve a los compañeros como retratos sin saber por qué.
 * Este aviso lo dice, y el botón baja lo que falta con una barra a la vista: una acción voluntaria y visible,
 * nunca en silencio mientras se juega. Lógica pura (sin React ni three.js) para poder probarla en Node.
 */

export type FaseDelAviso = 'oculto' | 'faltan' | 'bajando' | 'sinRed' | 'fallo'

export function faseDelAviso(e: {
  faltan: number
  bajando: boolean
  enLinea: boolean
  fallo: boolean
}): FaseDelAviso {
  if (e.bajando) return 'bajando'
  if (e.faltan <= 0) return 'oculto'
  if (!e.enLinea) return 'sinRed'
  return e.fallo ? 'fallo' : 'faltan'
}

export const TEXTO_BOTON_DESCARGAR = 'Descargar'

export function textoDelAviso(fase: FaseDelAviso, progreso: { hecho: number; total: number } = { hecho: 0, total: 0 }): string {
  switch (fase) {
    case 'faltan':
      return 'Faltan personajes por descargar'
    case 'bajando':
      return `Descargando personajes ${Math.min(progreso.hecho, progreso.total)} de ${progreso.total}`
    case 'sinRed':
      return 'Sin conexión: los compañeros se verán como retratos hasta tener red'
    case 'fallo':
      return 'No se pudieron bajar todos los personajes'
    default:
      return ''
  }
}

/** ¿Se enseña el botón? Sólo con red y sin una descarga en curso. */
export const haceFaltaBoton = (fase: FaseDelAviso) => fase === 'faltan' || fase === 'fallo'

export type DependenciasDeBajada<T extends string> = {
  /** Las rutas de ficheros de cada personaje (modelo, agarre, retrato) más las animaciones comunes. */
  rutasDe(mx: T): string[]
  descargar(
    rutas: string[],
    alProgreso: (hecho: number, total: number) => void
  ): Promise<{ guardadas: number; fallidas: string[]; sinEspacio: boolean }>
  /** Tras guardar: que el mapa recoja los modelos (olvidar fallos, pedir fotograma). */
  alTerminar(): Promise<void>
}

/**
 * Baja los modelos de los personajes que faltan y avisa al mapa al terminar (también si algo falló: lo que sí
 * llegó se pinta ya). `fallo` = alguna ruta no llegó; se puede volver a pulsar.
 */
export async function bajarPersonajesQueFaltan<T extends string>(
  mxs: readonly T[],
  dep: DependenciasDeBajada<T>,
  alProgreso: (hecho: number, total: number) => void = () => undefined
): Promise<{ fallo: boolean; sinEspacio: boolean; pedidos: number }> {
  const rutas = [...new Set(mxs.flatMap((mx) => dep.rutasDe(mx)))]
  if (rutas.length === 0) return { fallo: false, sinEspacio: false, pedidos: 0 }
  alProgreso(0, rutas.length)
  const r = await dep.descargar(rutas, alProgreso)
  await dep.alTerminar().catch(() => undefined)
  return { fallo: r.fallidas.length > 0 || r.sinEspacio, sinEspacio: r.sinEspacio, pedidos: rutas.length }
}

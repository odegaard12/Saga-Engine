import type { LayerSpecification, SourceSpecification, StyleSpecification } from 'maplibre-gl'

/**
 * Conmutadores de DIAGNÓSTICO del estilo del mapa: `?mapa=esri,terreno12,…` en la dirección.
 *
 * Para aislar en un móvil de verdad (el iPhone del dueño, que no se puede emular) qué pieza del estilo nuevo deja el
 * mapa borroso, quitándolas de una en una. Sin el parámetro (ni nada guardado) el estilo es EXACTAMENTE el de
 * siempre: `aplicarConmutadores` devuelve el mismo objeto. Se guarda en `sessionStorage` para que sobreviva a
 * las recargas de la PWA (que vuelve a `/` sin la query); `?mapa=` vacío o `?mapa=normal` lo borra.
 */
export const CONMUTADORES_DEL_MAPA = {
  esri: 'satélite de Esri en vez de PNOA',
  terreno12: 'relieve 3D hasta z12 (como 5.51.1)',
  sinterreno: 'sin terreno 3D',
  sinsombra: 'sin sombreado de laderas',
  sincontraste: 'sin contraste, saturación ni brillo',
  fade: 'fundido de teselas por defecto (300 ms)',
  pr2: 'pixelRatio del mapa con tope 2',
  sinedificios: 'sin casas 3D',
} as const

export type ConmutadorDelMapa = keyof typeof CONMUTADORES_DEL_MAPA

export const NOMBRES_DE_CONMUTADORES = Object.keys(CONMUTADORES_DEL_MAPA) as ConmutadorDelMapa[]

export const CLAVE_DE_CONMUTADORES = 'saga:mapa-diagnostico'

type Almacen = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

/** Los nombres válidos de una lista separada por comas, sin repetir y en el orden de `CONMUTADORES_DEL_MAPA`. */
export function interpretarConmutadores(texto: string | null | undefined): ConmutadorDelMapa[] {
  const pedidos = new Set(
    String(texto || '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
  )
  return NOMBRES_DE_CONMUTADORES.filter((n) => pedidos.has(n))
}

export function guardarConmutadores(
  lista: readonly ConmutadorDelMapa[],
  almacen: Almacen | null
): void {
  try {
    if (lista.length) almacen?.setItem(CLAVE_DE_CONMUTADORES, lista.join(','))
    else almacen?.removeItem(CLAVE_DE_CONMUTADORES)
  } catch {
    // Sin almacenamiento (privado): vale sólo para esta carga.
  }
}

/** `?mapa=` manda (y se guarda); sin él, lo guardado de esta sesión; sin nada, ninguno. */
export function leerConmutadores(buscar: string, almacen: Almacen | null): ConmutadorDelMapa[] {
  let parametro: string | null = null
  try {
    parametro = new URLSearchParams(buscar).get('mapa')
  } catch {
    parametro = null
  }
  if (parametro !== null) {
    const lista = interpretarConmutadores(parametro)
    guardarConmutadores(lista, almacen)
    return lista
  }
  try {
    return interpretarConmutadores(almacen?.getItem(CLAVE_DE_CONMUTADORES))
  } catch {
    return []
  }
}

/** `sessionStorage`, o null si el navegador no lo deja tocar. */
export function almacenDeSesion(): Almacen | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage
  } catch {
    return null
  }
}

const PINTURA_DE_COLOR = ['raster-contrast', 'raster-saturation', 'raster-brightness-min'] as const

/**
 * El estilo con los conmutadores aplicados. Sin ninguno, el MISMO objeto (nada cambia). Las capas se reconocen por
 * su tipo (raster, hillshade, fill-extrusion) y el terreno por `terrain.source`, no por su id.
 */
export function aplicarConmutadores(
  estilo: StyleSpecification,
  activos: readonly ConmutadorDelMapa[]
): StyleSpecification {
  if (!activos.length) return estilo
  const on = new Set(activos)
  const sources: Record<string, SourceSpecification> = { ...estilo.sources }
  let layers: LayerSpecification[] = estilo.layers
  let terrain = estilo.terrain
  const fuentesQuitadas = new Set<string>()

  if (on.has('esri')) {
    for (const [id, fuente] of Object.entries(sources)) {
      if (fuente.type !== 'raster' || !fuente.tiles) continue
      sources[id] = {
        ...fuente,
        tiles: fuente.tiles.map((u) => u.replace('/map-tiles/', '/map-tiles/esri/')),
        attribution: 'Imágenes &copy; Esri',
      }
    }
  }
  if (on.has('terreno12') && terrain && sources[terrain.source]) {
    sources[terrain.source] = { ...sources[terrain.source], maxzoom: 12 } as SourceSpecification
  }
  if (on.has('sinterreno') && terrain) {
    fuentesQuitadas.add(terrain.source)
    terrain = undefined
  }
  const quitar = (sobra: (capa: LayerSpecification) => boolean) => {
    for (const capa of layers) if (sobra(capa) && 'source' in capa) fuentesQuitadas.add(String(capa.source))
    layers = layers.filter((capa) => !sobra(capa))
  }
  if (on.has('sinsombra')) quitar((capa) => capa.type === 'hillshade')
  // Sólo las casas (la fuente que se baja de /api/edificios): el volumen de los nodos también es fill-extrusion.
  if (on.has('sinedificios')) {
    quitar((capa) => {
      const fuente = 'source' in capa ? sources[String(capa.source)] : undefined
      return capa.type === 'fill-extrusion' && fuente?.type === 'geojson' && String(fuente.data).includes('/api/edificios')
    })
  }
  if (on.has('sincontraste') || on.has('fade')) {
    layers = layers.map((capa) => {
      if (capa.type !== 'raster' || !capa.paint) return capa
      const paint: Record<string, unknown> = { ...capa.paint }
      if (on.has('sincontraste')) for (const p of PINTURA_DE_COLOR) delete paint[p]
      if (on.has('fade')) delete paint['raster-fade-duration']
      return { ...capa, paint } as LayerSpecification
    })
  }
  // Una fuente que ya no usa nadie, fuera: una GeoJSON sin capa se descargaría igual.
  for (const id of fuentesQuitadas) {
    const enUso = terrain?.source === id || layers.some((c) => 'source' in c && c.source === id)
    if (!enUso) delete sources[id]
  }

  const resultado: StyleSpecification = { ...estilo, sources, layers }
  if (terrain) resultado.terrain = terrain
  else delete resultado.terrain
  return resultado
}

/** `pixelRatio` para el constructor del mapa: sólo con `pr2`; si no, undefined (MapLibre usa el del dispositivo). */
export function pixelRatioDelMapa(
  activos: readonly ConmutadorDelMapa[],
  dpr: number
): number | undefined {
  return activos.includes('pr2') ? Math.min(dpr || 1, 2) : undefined
}

/**
 * 30/10 · MODO AHORRO DE BATERÍA: lo que más gasta el mapa es dibujarlo a la densidad del móvil con casas 3D y laderas.
 * Con la batería por debajo del 20 % (y sin cargar) o activado a mano en Herramientas, el mapa se crea con tope de
 * densidad 2, sin casas 3D y sin sombreado de laderas: el relieve, los nodos y los jugadores siguen igual.
 * `saga:ahorro-bateria` = '1' sí, '0' no (a mano); sin valor = automático según `saga:bateria-baja`.
 * Se aplica al crear el mapa (al abrir la app o volver a él).
 */
export const CLAVE_AHORRO = 'saga:ahorro-bateria'
export const CLAVE_BATERIA_BAJA = 'saga:bateria-baja'
export const CONMUTADORES_DE_AHORRO: readonly ConmutadorDelMapa[] = ['pr2', 'sinedificios', 'sinsombra']

export function ahorroActivo(almacen: Pick<Storage, 'getItem'> | null): boolean {
  try {
    const manual = almacen?.getItem(CLAVE_AHORRO)
    if (manual === '1') return true
    if (manual === '0') return false
    return almacen?.getItem(CLAVE_BATERIA_BAJA) === '1'
  } catch {
    return false
  }
}

/** Los conmutadores de diagnóstico más los del ahorro, sin repetir y en el orden de siempre. */
export function conAhorro(activos: readonly ConmutadorDelMapa[], ahorro: boolean): ConmutadorDelMapa[] {
  if (!ahorro) return [...activos]
  const juntos = new Set<ConmutadorDelMapa>([...activos, ...CONMUTADORES_DE_AHORRO])
  return NOMBRES_DE_CONMUTADORES.filter((n) => juntos.has(n))
}

/** Apunta si la batería está baja (< 20 % y sin cargar), y lo vuelve a apuntar cuando cambia. Sin la API, nada. */
export function vigilarBateria(almacen: Pick<Storage, 'setItem'> | null): void {
  const nav = navigator as Navigator & {
    getBattery?: () => Promise<{ level: number; charging: boolean; addEventListener: (e: string, f: () => void) => void }>
  }
  void nav.getBattery?.()
    .then((b) => {
      const apuntar = () => {
        try {
          almacen?.setItem(CLAVE_BATERIA_BAJA, !b.charging && b.level < 0.2 ? '1' : '0')
        } catch {
          // sin almacenamiento: el ahorro automático no se activa
        }
      }
      apuntar()
      b.addEventListener('levelchange', apuntar)
      b.addEventListener('chargingchange', apuntar)
    })
    .catch(() => undefined)
}

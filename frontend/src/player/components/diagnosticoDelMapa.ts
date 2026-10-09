import * as maplibregl from 'maplibre-gl'
import {
  almacenDeSesion,
  CONMUTADORES_DEL_MAPA,
  guardarConmutadores,
  NOMBRES_DE_CONMUTADORES,
  type ConmutadorDelMapa,
} from './conmutadoresMapa'

/**
 * La sección «Mapa» del panel `?depurar-mapa` y sus botones de conmutadores. Lee piezas INTERNAS de MapLibre
 * (`style.tileManagers`, `terrain`, `painter`) sólo para enseñarlas: si cambian de nombre en otra versión, la línea
 * sale con «?», nunca rompe el mapa. Nada de esto se instala sin el parámetro o un conmutador activo.
 */

type TeselaInterna = {
  state?: string
  tileID?: { overscaledZ?: number; canonical?: { z?: number } }
}
type GestorInterno = {
  getIds?: () => string[]
  getTileByID?: (id: string) => TeselaInterna | undefined
  getVisibleCoordinates?: () => { canonical?: { z?: number } }[]
  getSource?: () => { maxzoom?: number; tileSize?: number }
}
type MapaInterno = {
  style?: {
    tileManagers?: Record<string, GestorInterno>
    sourceCaches?: Record<string, GestorInterno>
  }
  terrain?: { tileManager?: { getRenderableTiles?: () => TeselaInterna[] }; exaggeration?: number }
  painter?: {
    context?: { gl?: WebGLRenderingContext | WebGL2RenderingContext }
    renderToTexture?: { rttSize?: number }
  }
}

const rango = (zs: number[]) => (zs.length ? `z${Math.min(...zs)}-${Math.max(...zs)}` : '-')

function lineaDeFuente(id: string, gestor: GestorInterno | undefined, zoom: number): string {
  if (!gestor?.getIds || !gestor.getTileByID) return `${id}: ?`
  const teselas = gestor
    .getIds()
    .map((t) => gestor.getTileByID!(t))
    .filter(Boolean) as TeselaInterna[]
  const cuenta = (estados: string[]) =>
    teselas.filter((t) => estados.includes(String(t.state))).length
  const cargadas = teselas.filter((t) => t.state === 'loaded')
  const zMax = cargadas.reduce((m, t) => Math.max(m, t.tileID?.canonical?.z ?? -1), -1)
  const visibles = (gestor.getVisibleCoordinates?.() ?? [])
    .map((c) => c.canonical?.z ?? -1)
    .filter((z) => z >= 0)
  const fuente = gestor.getSource?.()
  const maxzoom = fuente?.maxzoom ?? 22
  // Lo que MapLibre querría en el centro: teselas de 256 px -> zoom de cámara + 1, redondeado (raster).
  const ideal = Math.min(maxzoom, Math.round(zoom + Math.log2(512 / (fuente?.tileSize || 512))))
  return (
    `${id}: cargadas=${cargadas.length} pendientes=${cuenta(['loading', 'reloading'])} errores=${cuenta(['errored'])}` +
    ` zMaxCargada=${zMax < 0 ? '-' : zMax} visibles=${visibles.length}(${rango(visibles)}) ideal≈z${ideal} maxzoom=${maxzoom}`
  )
}

function lineasDeGL(gl: WebGLRenderingContext | WebGL2RenderingContext | undefined): string[] {
  if (!gl) return ['gl: ?']
  try {
    const info = gl.getExtension('WEBGL_debug_renderer_info')
    const renderer = info
      ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL)
      : gl.getParameter(gl.RENDERER)
    const webgl2 =
      typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext
    const aniso = gl.getExtension('EXT_texture_filter_anisotropic')
    return [
      `gl: ${webgl2 ? 'webgl2' : 'webgl1'} renderer=${String(renderer)}`,
      `maxTextureSize=${gl.getParameter(gl.MAX_TEXTURE_SIZE)} maxRenderbuffer=${gl.getParameter(gl.MAX_RENDERBUFFER_SIZE)}` +
        ` buffer=${gl.drawingBufferWidth}x${gl.drawingBufferHeight}` +
        ` aniso=${aniso ? gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT) : 'no'}`,
    ]
  } catch (e) {
    return [`gl: error ${e instanceof Error ? e.message : String(e)}`]
  }
}

/** El texto de la sección «Mapa» (también lo que copia «Copiar»). */
export function textoDelMapa(
  mapa: maplibregl.Map | null,
  activos: readonly ConmutadorDelMapa[]
): string {
  const lineas = [
    `— Mapa — conmutadores: ${activos.length ? activos.join(',') : 'ninguno (estilo normal)'}`,
  ]
  if (!mapa) return [...lineas, '(mapa sin montar)'].join('\n')
  const interno = mapa as unknown as MapaInterno
  const zoom = mapa.getZoom()
  const lienzo = mapa.getCanvas()
  const nav = navigator as Navigator & { deviceMemory?: number }
  const memoria = (performance as Performance & { memory?: { jsHeapSizeLimit?: number } }).memory
  lineas.push(
    `MapLibre ${maplibregl.getVersion()} zoom=${zoom.toFixed(2)} pitch=${Math.round(mapa.getPitch())} moviendose=${mapa.isMoving() ? 'sí' : 'no'}`,
    `pixelRatio mapa=${mapa.getPixelRatio()} dispositivo=${window.devicePixelRatio} lienzo=${lienzo.width}x${lienzo.height} css=${lienzo.clientWidth}x${lienzo.clientHeight}`,
    `memoria: deviceMemory=${nav.deviceMemory ?? '?'} núcleos=${nav.hardwareConcurrency ?? '?'} heap=${memoria?.jsHeapSizeLimit ? Math.round(memoria.jsHeapSizeLimit / 1048576) + 'MB' : '?'}`,
    ...lineasDeGL(interno.painter?.context?.gl)
  )
  const terreno = mapa.getTerrain()
  const rtt = interno.terrain?.tileManager?.getRenderableTiles?.() ?? []
  lineas.push(
    terreno
      ? `terreno: sí fuente=${terreno.source} exageración=${terreno.exaggeration ?? 1} teselasRTT=${rtt.length}(${rango(rtt.map((t) => t.tileID?.canonical?.z ?? 0))}) rttSize=${interno.painter?.renderToTexture?.rttSize ?? '?'}`
      : 'terreno: no'
  )
  const gestores = interno.style?.tileManagers ?? interno.style?.sourceCaches ?? {}
  for (const [id, fuente] of Object.entries(mapa.getStyle()?.sources ?? {})) {
    if (fuente.type === 'raster' || fuente.type === 'raster-dem')
      lineas.push(lineaDeFuente(id, gestores[id], zoom))
  }
  return lineas.join('\n')
}

/** Cambia los conmutadores y recarga: el `?mapa=` de la dirección se quita para que no pise lo elegido. */
export function recargarCon(lista: readonly ConmutadorDelMapa[]): void {
  guardarConmutadores(lista, almacenDeSesion())
  try {
    const url = new URL(window.location.href)
    url.searchParams.delete('mapa')
    window.history.replaceState(window.history.state, '', url.toString())
  } catch {
    // Sin history: recarga igual (si la dirección trae `?mapa=`, ésa manda).
  }
  window.location.reload()
}

/** Un botón por conmutador (encendido = relleno) y «Normal» para quitarlos todos. */
export function controlesDeConmutadores(activos: readonly ConmutadorDelMapa[]): HTMLElement {
  const caja = document.createElement('div')
  caja.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;margin-top:5px'
  const boton = (texto: string, encendido: boolean, titulo: string, alPulsar: () => void) => {
    const b = document.createElement('button')
    b.type = 'button'
    b.textContent = texto
    b.title = titulo
    b.setAttribute('aria-pressed', String(encendido))
    b.style.cssText =
      'font:600 11px system-ui;padding:6px 8px;border-radius:6px;min-height:32px;border:1px solid #7dd3fc;' +
      (encendido ? 'background:#7dd3fc;color:#000' : 'background:transparent;color:#e5e7eb')
    b.addEventListener('click', alPulsar)
    caja.appendChild(b)
  }
  for (const nombre of NOMBRES_DE_CONMUTADORES) {
    const encendido = activos.includes(nombre)
    boton(nombre, encendido, CONMUTADORES_DEL_MAPA[nombre], () =>
      recargarCon(encendido ? activos.filter((n) => n !== nombre) : [...activos, nombre])
    )
  }
  boton('Normal', activos.length === 0, 'Quitar todos los conmutadores', () => recargarCon([]))
  return caja
}

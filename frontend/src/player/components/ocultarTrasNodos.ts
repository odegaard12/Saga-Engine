import * as THREE from 'three'
import * as maplibregl from 'maplibre-gl'
import type { ComplementoDeCapa, ContextoDeFotograma } from './nodosTresD'

/**
 * 25/10: un muñeco 3D DETRÁS de un nodo se pintaba encima de él (Oscar: «personajes encima de nodo... mal»).
 *
 * Los nodos no son 3D: son imágenes horneadas en capas de símbolo de MapLibre, y los cuerpos van en la capa three.js
 * que se pinta después, así que no hay profundidad entre los dos. Aquí, por cada nodo a la vista, se escribe en la
 * profundidad (sin color) su SILUETA: la misma imagen, en su rectángulo exacto de pantalla, sobre un plano vertical
 * en el nodo, de cara a la cámara. Un cuerpo más lejano falla la prueba de profundidad donde la imagen es opaca y se
 * ve el nodo que MapLibre ya pintó debajo; uno más cercano sigue delante. Vertical y no plano a la profundidad del
 * suelo: el cuerpo, escalado para verse, mide decenas de metros, y con la cámara inclinada su cabeza «se acercaba» y
 * volvía a asomar por encima de la moneda.
 */

/** Un nodo con chincheta: su punto y las propiedades de su elemento (los nombres de sus imágenes). */
export type SiluetaDeNodo = { lat: number; lon: number; props: Record<string, unknown> }

/** Los nodos que pinta la capa de símbolos (sin los de mapa mudo). Lo llena MapSurfaceGL. */
export const siluetasDeNodos: SiluetaDeNodo[] = []

const VERTICES = /* glsl */ `
uniform vec4 rect;
uniform vec4 profundidad;
varying vec2 vUv;
void main() {
  vUv = vec2(position.x, 1.0 - position.y);
  // Esquinas: 0 abajo-izquierda, 1 abajo-derecha, 2 arriba-izquierda, 3 arriba-derecha.
  float z = mix(mix(profundidad.x, profundidad.y, position.x), mix(profundidad.z, profundidad.w, position.x), position.y);
  gl_Position = vec4(mix(rect.x, rect.z, position.x), mix(rect.y, rect.w, position.y), z, 1.0);
}`
const FRAGMENTOS = /* glsl */ `
uniform sampler2D imagen;
varying vec2 vUv;
void main() {
  if (texture2D(imagen, vUv).a < 0.5) discard;
  gl_FragColor = vec4(0.0);
}`

/** El tamaño del icono a este zoom, leído de la propia capa: ['interpolate', ['exponential', b], ['zoom'], z0, ['*', s0, …], z1, ['*', s1, …]]. */
export function tamanoDelIcono(expresion: unknown, zoom: number): number {
  if (typeof expresion === 'number') return expresion
  if (!Array.isArray(expresion) || expresion[0] !== 'interpolate') return 1
  const curva = expresion[1] as unknown[]
  const base = Array.isArray(curva) && curva[0] === 'exponential' ? Number(curva[1]) : 1
  const valor = (v: unknown) => (typeof v === 'number' ? v : Array.isArray(v) && v[0] === '*' ? Number(v[1]) : 1)
  const paradas: [number, number][] = []
  for (let i = 3; i + 1 < expresion.length; i += 2) paradas.push([Number(expresion[i]), valor(expresion[i + 1])])
  if (!paradas.length) return 1
  if (zoom <= paradas[0][0]) return paradas[0][1]
  for (let i = 1; i < paradas.length; i += 1) {
    const [z0, s0] = paradas[i - 1]
    const [z1, s1] = paradas[i]
    if (zoom > z1) continue
    const t = base === 1 ? (zoom - z0) / (z1 - z0) : (Math.pow(base, zoom - z0) - 1) / (Math.pow(base, z1 - z0) - 1)
    return s0 + (s1 - s0) * t
  }
  return paradas[paradas.length - 1][1]
}

/** La clave de la imagen de una capa (`['get', clave]`) o null. */
function claveDeImagen(expresion: unknown): string | null {
  return Array.isArray(expresion) && expresion[0] === 'get' && typeof expresion[1] === 'string' ? expresion[1] : null
}

export function crearOcultadoresDeNodos(opciones: { capaIconos: string; capaMoneda: string; alturaM: number }): ComplementoDeCapa {
  const grupo = new THREE.Group()
  const geometria = new THREE.BufferGeometry()
  geometria.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0], 3))
  geometria.setIndex([0, 1, 2, 2, 1, 3])
  const texturas = new Map<string, THREE.DataTexture>()
  const mallas: THREE.Mesh[] = []
  const inversa = new THREE.Matrix4()
  let proyeccionActual = new THREE.Matrix4()
  const _a = new THREE.Vector4()
  const _b = new THREE.Vector4()

  function textura(mapa: maplibregl.Map, id: string): { t: THREE.DataTexture; ancho: number; alto: number } | null {
    const imagen = mapa.getImage(id) as unknown as { data?: { width: number; height: number; data: Uint8Array }; pixelRatio?: number } | undefined
    if (!imagen?.data?.data) return null
    let t = texturas.get(id)
    if (!t || t.image.width !== imagen.data.width) {
      t?.dispose()
      t = new THREE.DataTexture(new Uint8Array(imagen.data.data), imagen.data.width, imagen.data.height, THREE.RGBAFormat)
      t.needsUpdate = true
      texturas.set(id, t)
    }
    const pr = imagen.pixelRatio || 1
    return { t, ancho: imagen.data.width / pr, alto: imagen.data.height / pr }
  }

  function malla(i: number): THREE.Mesh {
    let m = mallas[i]
    if (!m) {
      m = new THREE.Mesh(
        geometria,
        new THREE.ShaderMaterial({
          vertexShader: VERTICES,
          fragmentShader: FRAGMENTOS,
          uniforms: { rect: { value: new THREE.Vector4() }, profundidad: { value: new THREE.Vector4() }, imagen: { value: null } },
          colorWrite: false,
          depthWrite: true,
          depthTest: true,
          side: THREE.DoubleSide,
        })
      )
      // Antes que cualquier cuerpo (los opacos se pintan por renderOrder).
      m.renderOrder = -100
      m.frustumCulled = false
      mallas[i] = m
      grupo.add(m)
    }
    return m
  }

  /** Profundidad (z/w) del punto del plano vertical del nodo que cae en ese punto de la pantalla (NDC). */
  function profundidadEn(x: number, y: number, p: THREE.Vector3, n: THREE.Vector3): number {
    _a.set(x, y, -1, 1).applyMatrix4(inversa)
    _b.set(x, y, 1, 1).applyMatrix4(inversa)
    const ax = _a.x / _a.w, ay = _a.y / _a.w, az = _a.z / _a.w
    const dx = _b.x / _b.w - ax, dy = _b.y / _b.w - ay, dz = _b.z / _b.w - az
    const den = n.x * dx + n.y * dy + n.z * dz
    const s = Math.abs(den) < 1e-12 ? 0 : (n.x * (p.x - ax) + n.y * (p.y - ay) + n.z * (p.z - az)) / den
    const q = new THREE.Vector4(ax + dx * s, ay + dy * s, az + dz * s, 1).applyMatrix4(proyeccionActual)
    return q.w > 0 ? Math.min(1, Math.max(-1, q.z / q.w)) : 1
  }

  return {
    grupo,
    activo: () => siluetasDeNodos.length > 0,
    hayQueDibujar: () => false,
    esperaHastaElSiguiente: () => null,
    alRenderizar(ctx: ContextoDeFotograma) {
      const mapa = ctx.mapa
      // Qué pinta ahora cada capa: imagen, desplazamiento y (la moneda) cuánto ha subido.
      const partes: { clave: string; oy: number; tx: number; ty: number; tamano: unknown }[] = []
      try {
        for (const [id, esMoneda] of [[opciones.capaIconos, false], [opciones.capaMoneda, true]] as const) {
          if (!mapa.getLayer(id) || mapa.getLayoutProperty(id, 'visibility') === 'none') continue
          const clave = claveDeImagen(mapa.getLayoutProperty(id, 'icon-image'))
          if (!clave) continue
          const off = mapa.getLayoutProperty(id, 'icon-offset') as number[] | undefined
          const tr = esMoneda ? (mapa.getPaintProperty(id, 'icon-translate') as number[] | undefined) : undefined
          partes.push({ clave, oy: off?.[1] ?? 0, tx: tr?.[0] ?? 0, ty: tr?.[1] ?? 0, tamano: mapa.getLayoutProperty(id, 'icon-size') })
        }
      } catch {
        partes.length = 0
      }
      proyeccionActual = ctx.proyeccion
      inversa.copy(ctx.proyeccion).invert()
      const lienzo = mapa.getCanvas()
      const ancho = lienzo.clientWidth || 1
      const alto = lienzo.clientHeight || 1
      // Normal del plano: hacia donde mira la cámara, en horizontal (Mercator: x al este, y al sur).
      const n = new THREE.Vector3(Math.sin(ctx.rumbo), -Math.cos(ctx.rumbo), 0)
      let usadas = 0
      for (const nodo of siluetasDeNodos) {
        const el = ctx.conTerreno ? mapa.queryTerrainElevation({ lng: nodo.lon, lat: nodo.lat }) : 0
        if (typeof el !== 'number' || !Number.isFinite(el)) continue
        const mc = maplibregl.MercatorCoordinate.fromLngLat([nodo.lon, nodo.lat], el + opciones.alturaM)
        const p = new THREE.Vector3(mc.x - ctx.origen.x, mc.y - ctx.origen.y, mc.z)
        const v = new THREE.Vector4(p.x, p.y, p.z, 1).applyMatrix4(ctx.proyeccion)
        if (v.w <= 0) continue
        // El ancla (abajo, en el centro de la imagen) en píxeles CSS.
        const ax = (0.5 + v.x / v.w / 2) * ancho
        const ay = (0.5 - v.y / v.w / 2) * alto
        for (const parte of partes) {
          const id = nodo.props[parte.clave]
          if (typeof id !== 'string') continue
          const img = textura(mapa, id)
          if (!img) continue
          const k = tamanoDelIcono(parte.tamano, ctx.zoom)
          const w = img.ancho * k
          const h = img.alto * k
          const abajo = ay + parte.oy * k + parte.ty
          const x0 = ax - w / 2 + parte.tx
          const ndc = (x: number, y: number) => [(x / ancho) * 2 - 1, 1 - (y / alto) * 2] as const
          const [nx0, ny0] = ndc(x0, abajo)
          const [nx1, ny1] = ndc(x0 + w, abajo - h)
          if (nx1 < -1.2 || nx0 > 1.2 || ny1 < -1.2 || ny0 > 1.2) continue
          const m = malla(usadas)
          usadas += 1
          const u = (m.material as THREE.ShaderMaterial).uniforms
          u.rect.value.set(nx0, ny0, nx1, ny1)
          u.profundidad.value.set(
            profundidadEn(nx0, ny0, p, n),
            profundidadEn(nx1, ny0, p, n),
            profundidadEn(nx0, ny1, p, n),
            profundidadEn(nx1, ny1, p, n)
          )
          u.imagen.value = img.t
          m.visible = true
        }
      }
      for (let i = usadas; i < mallas.length; i += 1) mallas[i].visible = false
    },
  }
}

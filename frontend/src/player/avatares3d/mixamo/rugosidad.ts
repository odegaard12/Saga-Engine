import * as THREE from 'three'
import { cloneModel } from './motor/stage'

/**
 * 22/11: lo que `cloneModel` (motor/stage.ts, generado) convierte en el hilo principal la primera vez que monta un
 * personaje —el mapa de brillo a rugosidad, 2048² píxel a píxel—, hecho antes en un worker (rugosidad.worker.ts) y
 * dejado en su propia memoria (`cloneModel._rug`), donde lo busca primero. Los mismos píxeles: se ve igual. Sin worker
 * ni OffscreenCanvas (o si falla), no se adelanta nada y `cloneModel` lo hace como siempre.
 */
type Resultado = { id: number; ancho?: number; alto?: number; datos?: ArrayBuffer; error?: string }

let trabajador: Worker | null | undefined
let siguienteId = 0
const esperando = new Map<number, (r: Resultado | null) => void>()
const ESPERA_MAXIMA_MS = 8000

function elTrabajador(): Worker | null {
  if (trabajador !== undefined) return trabajador
  trabajador = null
  if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined') return null
  try {
    const w = new Worker(new URL('./rugosidad.worker.ts', import.meta.url), { type: 'module' })
    w.onmessage = (ev: MessageEvent<Resultado>) => {
      const listo = esperando.get(ev.data.id)
      esperando.delete(ev.data.id)
      listo?.(ev.data.error ? null : ev.data)
    }
    w.onerror = () => {
      for (const listo of esperando.values()) listo(null)
      esperando.clear()
      w.terminate()
      trabajador = null
    }
    trabajador = w
  } catch {
    trabajador = null
  }
  return trabajador
}

async function convertir(t: THREE.Texture): Promise<THREE.Texture | null> {
  const w = elTrabajador()
  const img = t.image as (ImageBitmapSource & { width?: number }) | undefined
  if (!w || !img?.width) return null
  const imagen = await createImageBitmap(img)
  // 22/11 (auditoría): si el worker no contesta, a los 8 s null = `cloneModel` lo convierte en el hilo principal (sin
  // esto el personaje no se registraba nunca). Una respuesta tardía ya no encuentra a nadie esperando y se ignora.
  const r = await new Promise<Resultado | null>((ok) => {
    const id = ++siguienteId
    const reloj = setTimeout(() => {
      esperando.delete(id)
      ok(null)
    }, ESPERA_MAXIMA_MS)
    esperando.set(id, (res) => {
      clearTimeout(reloj)
      ok(res)
    })
    w.postMessage({ id, imagen }, [imagen])
  })
  if (!r?.datos || !r.ancho || !r.alto) return null
  // Como la CanvasTexture de stage.ts: RGBA de 8 bits, con mipmaps y filtro lineal, y el resto copiado del original.
  const out = new THREE.DataTexture(new Uint8Array(r.datos), r.ancho, r.alto)
  out.flipY = t.flipY
  out.wrapS = t.wrapS
  out.wrapT = t.wrapT
  out.channel = t.channel
  out.colorSpace = THREE.NoColorSpace
  out.generateMipmaps = true
  out.minFilter = THREE.LinearMipmapLinearFilter
  out.magFilter = THREE.LinearFilter
  out.needsUpdate = true
  return out
}

/** Antes de registrar el modelo de un personaje: sus mapas de brillo ya convertidos, con el mismo criterio que stage.ts. */
export async function prepararRugosidades(modelo: THREE.Object3D): Promise<void> {
  const memoria = cloneModel as unknown as { _rug?: WeakMap<THREE.Texture, THREE.Texture> }
  const rug = (memoria._rug ??= new WeakMap())
  const texturas = new Set<THREE.Texture>()
  modelo.traverse((n) => {
    const malla = n as THREE.SkinnedMesh
    if (!malla.isSkinnedMesh) return
    for (const m of ([] as THREE.Material[]).concat(malla.material)) {
      const mapa = (m as THREE.MeshStandardMaterial).roughnessMap
      if (mapa && !/lash|hair|beard|brow/i.test(`${malla.name} ${m.name}`) && !rug.has(mapa)) texturas.add(mapa)
    }
  })
  for (const t of texturas) {
    const out = await convertir(t).catch(() => null)
    if (out) rug.set(t, out)
  }
}

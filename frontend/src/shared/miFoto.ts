/**
 * 23/11 («ahí pone foto avatar pero no la mía»): LA FOTO DEL JUGADOR en este móvil.
 *
 * La foto que ves en el login es la de su ficha del servidor (`avatar_url` incrustada, o `avatar_ref` =
 * `/api/player-avatar/<id>?v=huella`). La bienvenida, en cambio, sólo la sacaba de la copia guardada de la configuración
 * (que puede faltar o venir sin ficha) o de la partida (que llega tarde): sin ninguna de las dos pintaba la inicial sobre
 * el color de acento, que parece un avatar de relleno. Ahora cada móvil guarda SU copia de la foto (una miniatura de ~10 KB,
 * ya decodificable sin red):
 *
 *   1. al elegir jugador en el login (o al abrir el login con jugador recordado) se copia la que ahí se ve;
 *   2. al pintarse en la bienvenida desde el servidor se refresca la copia si cambió;
 *   3. si ni el servidor tiene foto (purgada o nunca subida), él la pone con «Poner mi foto» y vive sólo en este móvil.
 *
 * Nunca es la cara de un personaje 3D ni una imagen de catálogo: sólo una foto raster del servidor (`/api/player-avatar/`),
 * una incrustada JPEG/PNG/WebP, o la que él mismo eligió. Sin React ni red propia: se prueba en Node (tests/js/mi_foto_23_11.cjs).
 */

const PREFIJO = 'saga_mi_foto:'
/** Una miniatura de perfil pesa ~10 KB; por encima de esto no es una foto de perfil y no se guarda (cuota de localStorage). */
export const MAX_COPIA_BYTES = 150_000
const RASTER = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/

/** `u`: de qué URL del servidor salió la copia; '' = la eligió él en este móvil. `d`: la imagen (data URL). */
export type CopiaDeFoto = { u: string; d: string }

/** ¿Es una foto de perfil nuestra? Del servidor (`/api/player-avatar/…`) o incrustada JPEG/PNG/WebP (nunca SVG ni otra cosa). */
export function esFotoDePerfil(url: unknown): url is string {
  const texto = String(url || '').trim()
  if (!texto) return false
  if (texto.startsWith('/api/player-avatar/')) return !texto.includes('//') && texto.length < 400
  return texto.length <= 2_000_000 && RASTER.test(texto)
}

export function leerMiFoto(id: string | null | undefined): CopiaDeFoto | null {
  if (!id || typeof localStorage === 'undefined') return null
  try {
    const crudo = localStorage.getItem(PREFIJO + id)
    if (!crudo) return null
    const copia = JSON.parse(crudo) as Partial<CopiaDeFoto>
    return typeof copia.d === 'string' && RASTER.test(copia.d) ? { u: String(copia.u || ''), d: copia.d } : null
  } catch {
    return null
  }
}

export function guardarMiFoto(id: string, copia: CopiaDeFoto): boolean {
  if (!id || !RASTER.test(copia.d) || typeof localStorage === 'undefined') return false
  try {
    localStorage.setItem(PREFIJO + id, JSON.stringify(copia))
    return true
  } catch {
    return false // cuota llena o sin almacenamiento: se sigue con la del servidor
  }
}

/**
 * Qué foto enseñar: la del servidor si la hay y la copia es de otra (o la puso él y ahora el servidor ya tiene una);
 * si no, la copia (instantánea y sin red); si no hay copia, la del servidor; si no hay nada, null (la inicial).
 */
export function elegirFoto(copia: CopiaDeFoto | null, servidor: string | null): string | null {
  if (copia && (copia.u !== '' || !servidor)) return copia.d
  return servidor
}

type Dependencias = {
  buscar?: (url: string) => Promise<{ ok: boolean; blob(): Promise<Blob> }>
  leer?: (blob: Blob) => Promise<string>
}

function leerComoDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const lector = new FileReader()
    lector.onload = () => resolve(String(lector.result || ''))
    lector.onerror = () => reject(lector.error)
    lector.readAsDataURL(blob)
  })
}

/**
 * Guarda la copia de la foto que se está viendo (`url`: la del servidor o una incrustada). Si ya hay copia de esa misma URL no
 * hace nada. Nunca lanza: sin red o con una respuesta rara, se queda como estaba.
 */
export async function recordarMiFoto(id: string, url: unknown, deps: Dependencias = {}): Promise<boolean> {
  try {
    if (!id || !esFotoDePerfil(url)) return false
    if (leerMiFoto(id)?.u === url) return true
    if (url.startsWith('data:')) return guardarMiFoto(id, { u: 'incrustada', d: url })
    const buscar = deps.buscar ?? ((direccion: string) => fetch(direccion, { credentials: 'same-origin' }))
    const respuesta = await buscar(url)
    if (!respuesta.ok) return false
    const blob = await respuesta.blob()
    if (blob.size > MAX_COPIA_BYTES || !/^image\/(?:jpeg|png|webp)$/.test(blob.type)) return false
    return guardarMiFoto(id, { u: url, d: await (deps.leer ?? leerComoDataUrl)(blob) })
  } catch {
    return false
  }
}

/** La foto elegida en este móvil → JPEG cuadrado de 256 px (recortada al centro). Lanza si no es una imagen. */
export async function fotoDeArchivo(archivo: Blob, lado = 256): Promise<string> {
  const direccion = URL.createObjectURL(archivo)
  try {
    const imagen = new Image()
    imagen.src = direccion
    await imagen.decode()
    const corto = Math.min(imagen.naturalWidth, imagen.naturalHeight)
    if (!corto) throw new Error('imagen vacía')
    const lienzo = document.createElement('canvas')
    lienzo.width = lienzo.height = lado
    const ctx = lienzo.getContext('2d')
    if (!ctx) throw new Error('sin lienzo')
    ctx.drawImage(imagen, (imagen.naturalWidth - corto) / 2, (imagen.naturalHeight - corto) / 2, corto, corto, 0, 0, lado, lado)
    return lienzo.toDataURL('image/jpeg', 0.85)
  } finally {
    URL.revokeObjectURL(direccion)
  }
}

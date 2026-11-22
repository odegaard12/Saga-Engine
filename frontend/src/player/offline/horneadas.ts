import { abrirBaseConLimite } from './missionPack'

/**
 * 22/11: imágenes horneadas en el móvil que se guardan entre aperturas: las bolas 3D de los nodos (bolaRenderizada.ts) y
 * las imágenes fijas de los personajes (fotoDePersonaje.ts). Medido con la ruta de 10 nodos y CPU ×4: las bolas costaban
 * 6,9 s de CPU en CADA arranque y las imágenes fijas montaban un personaje entero cada una. Ahora se hornean una vez por
 * versión de la app y aspecto, y después se leen.
 *
 * - Los píxeles tal cual (RGBA), comprimidos sin pérdida si el navegador sabe (gzip): se ven exactamente igual.
 * - IndexedDB y no Cache Storage: el service worker recorre todas las cachés de la app en cada búsqueda (sw.js).
 * - Lo de otra versión se borra al leer: una versión nueva puede dibujar distinto.
 * - Todo es opcional: sin IndexedDB, o si falla, se hornea como antes.
 */
const BASE = 'saga-horneadas'
const ALMACEN = 'imagenes'
const VERSION_APP = typeof __SAGA_VERSION__ === 'string' ? __SAGA_VERSION__ : ''

type Fila = { id: string; ancho: number; alto: number; gz: boolean; datos: ArrayBuffer }
export type Horneada = { ancho: number; alto: number; datos: Uint8ClampedArray<ArrayBuffer> }

function abrir(): Promise<IDBDatabase> {
  return abrirBaseConLimite(BASE, 1, (db) => {
    if (!db.objectStoreNames.contains(ALMACEN)) db.createObjectStore(ALMACEN, { keyPath: 'id' })
  })
}

const prefijo = (tipo: string) => `${VERSION_APP}|${tipo}|`

async function transformar(datos: BufferSource, flujo: CompressionStream | DecompressionStream): Promise<ArrayBuffer> {
  return new Response(new Blob([datos]).stream().pipeThrough(flujo)).arrayBuffer()
}

/** Todas las guardadas de este tipo (y de esta versión), por su clave. Borra las de otras versiones. */
export async function leerHorneadas(tipo: string): Promise<Map<string, Horneada>> {
  const salida = new Map<string, Horneada>()
  const db = await abrir()
  try {
    const filas = await new Promise<Fila[]>((ok, no) => {
      const tx = db.transaction(ALMACEN, 'readwrite')
      const almacen = tx.objectStore(ALMACEN)
      const todas = almacen.getAll() as IDBRequest<Fila[]>
      todas.onsuccess = () => {
        for (const f of todas.result) if (!f.id.startsWith(`${VERSION_APP}|`)) almacen.delete(f.id)
      }
      tx.oncomplete = () => ok(todas.result.filter((f) => f.id.startsWith(prefijo(tipo))))
      tx.onerror = () => no(tx.error)
      tx.onabort = () => no(tx.error)
    })
    for (const f of filas) {
      try {
        const crudos = f.gz ? await transformar(f.datos, new DecompressionStream('gzip')) : f.datos
        if (crudos.byteLength !== f.ancho * f.alto * 4) continue
        salida.set(f.id.slice(prefijo(tipo).length), { ancho: f.ancho, alto: f.alto, datos: new Uint8ClampedArray(crudos) })
      } catch {
        // una fila rota: se vuelve a hornear
      }
    }
  } finally {
    db.close()
  }
  return salida
}

/** La guarda para la próxima apertura. No espera ni falla: si no se puede, la próxima vez se hornea otra vez. */
export function guardarHorneada(tipo: string, clave: string, ancho: number, alto: number, pixeles: Uint8Array | Uint8ClampedArray): void {
  void (async () => {
    const copia = new Uint8Array(pixeles.byteLength)
    copia.set(pixeles)
    const gz = typeof CompressionStream !== 'undefined'
    const datos = gz ? await transformar(copia, new CompressionStream('gzip')) : copia.buffer
    const db = await abrir()
    try {
      await new Promise<void>((ok, no) => {
        const tx = db.transaction(ALMACEN, 'readwrite')
        tx.objectStore(ALMACEN).put({ id: prefijo(tipo) + clave, ancho, alto, gz, datos } satisfies Fila)
        tx.oncomplete = () => ok()
        tx.onerror = () => no(tx.error)
        tx.onabort = () => no(tx.error)
      })
    } finally {
      db.close()
    }
  })().catch(() => undefined)
}

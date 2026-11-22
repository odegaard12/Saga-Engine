/**
 * 22/11: el mapa de brillo de Mixamo pasado a rugosidad (la cuenta de `rugosidadDeBrillo` en motor/stage.ts), fuera del
 * hilo principal. En el hilo principal eran un `getImageData` de 2048² y cuatro millones de vueltas por personaje: una
 * tarea larga de cientos de ms (CPU ×4) cada vez que aparecía un personaje nuevo en el mapa.
 */
type Pedido = { id: number; imagen: ImageBitmap }

type Ambito = {
  onmessage: ((evento: MessageEvent<Pedido>) => void) | null
  postMessage: (mensaje: unknown, transferir?: Transferable[]) => void
}

const ambito = self as unknown as Ambito

ambito.onmessage = (evento) => {
  const { id, imagen } = evento.data
  try {
    const lienzo = new OffscreenCanvas(imagen.width, imagen.height)
    const g = lienzo.getContext('2d')
    if (!g) throw new Error('sin 2d')
    g.drawImage(imagen, 0, 0)
    imagen.close()
    const p = g.getImageData(0, 0, lienzo.width, lienzo.height).data
    // La misma cuenta que motor/stage.ts (generado: no se toca).
    for (let i = 0; i < p.length; i += 4) {
      const b = p[i + 1] / 255
      const v = 255 * (1 - 0.85 * b * b * b)
      p[i] = p[i + 1] = p[i + 2] = v
    }
    ambito.postMessage({ id, ancho: lienzo.width, alto: lienzo.height, datos: p.buffer }, [p.buffer])
  } catch (e) {
    ambito.postMessage({ id, error: String(e) })
  }
}

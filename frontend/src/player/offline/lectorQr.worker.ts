/**
 * El worker del escáner: jsQR fuera del hilo de la interfaz.
 *
 * Una pasada de jsQR sobre 640×640 cuesta 20-60 ms en un portátil y, con
 * grano de sensor, puede irse a segundos (cada mota es un candidato a patrón
 * de posición). En el hilo principal eso congelaba la cámara, el cronómetro y
 * los botones; aquí sólo tarda la lectura.
 *
 * Va en el paquete del jugador (Vite lo emite como fichero aparte y la lista
 * de precarga recoge todo `assets/`), así que funciona sin cobertura.
 */
import jsQR from 'jsqr'
import {
  aGris,
  ESTRATEGIAS,
  leerConEstrategias,
  medirLuz,
  type Estrategia,
  type FuncionJsQr,
} from './qrNucleo'

type Pedido = {
  id: number
  ancho: number
  alto: number
  datos: ArrayBuffer
  estrategias: Estrategia[]
}

type Ambito = {
  onmessage: ((evento: MessageEvent<Pedido>) => void) | null
  postMessage: (mensaje: unknown) => void
}

const ambito = self as unknown as Ambito
const validas = new Set<string>(ESTRATEGIAS)

ambito.onmessage = (evento) => {
  const { id, ancho, alto, datos, estrategias } = evento.data
  const arranque = performance.now()
  try {
    const gris = aGris(new Uint8ClampedArray(datos), ancho, alto)
    const lista = (estrategias || []).filter((e) => validas.has(e))
    const resultado = leerConEstrategias(gris, lista, jsQR as unknown as FuncionJsQr)
    ambito.postMessage({
      id,
      texto: resultado?.texto ?? null,
      estrategia: resultado?.estrategia ?? null,
      luz: resultado ? null : medirLuz(gris),
      ms: performance.now() - arranque,
    })
  } catch {
    ambito.postMessage({
      id,
      texto: null,
      estrategia: null,
      luz: null,
      ms: performance.now() - arranque,
    })
  }
}

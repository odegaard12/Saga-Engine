import { useEffect } from 'react'

/**
 * «Algo tapa el mapa ahora mismo.»
 *
 * El mapa late: el trazado, los halos de los nodos, la moneda que flota y la
 * guía cambian de opacidad diez veces por segundo, y con relieve cada cambio
 * hace que MapLibre repinte el terreno entero. En un móvil de gama baja eso es
 * lo que más pesa, y es trabajo tirado cuando lo que tienes delante es un
 * minijuego a pantalla completa o una hoja con el fondo desenfocado.
 *
 * Quien tapa el mapa (`InteractionSheet`, `SwipeableSheet`, la pantalla final,
 * la cámara, el visor de fotos…) lo declara con `useCubreElMapa`; el mapa
 * (`MapSurfaceGL`) mira `mapaCubierto()` y se queda quieto mientras haya algo
 * encima. Es un almacén pequeño y aparte, no una prop, porque el mapa y las
 * hojas los monta `PlayerApp` por separado y ninguno conoce al otro.
 *
 * Con cuenta: dos hojas a la vez (un minijuego y encima la historia) no
 * destapan el mapa hasta que se cierran las dos.
 */

type Oyente = (cubierto: boolean) => void

let cubriendo = 0
const oyentes = new Set<Oyente>()

export function mapaCubierto(): boolean {
  return cubriendo > 0
}

/** Avisa cuando el mapa pasa de descubierto a cubierto o al revés. Devuelve cómo dejar de avisar. */
export function alCambiarCoberturaDelMapa(oyente: Oyente): () => void {
  oyentes.add(oyente)
  return () => {
    oyentes.delete(oyente)
  }
}

/** Declara que algo tapa el mapa. Devuelve la función que lo destapa. */
export function cubrirMapa(): () => void {
  cubriendo += 1
  if (cubriendo === 1) oyentes.forEach((oyente) => oyente(true))

  let soltado = false
  return () => {
    if (soltado) return
    soltado = true
    cubriendo = Math.max(0, cubriendo - 1)
    if (cubriendo === 0) oyentes.forEach((oyente) => oyente(false))
  }
}

/** Declara, mientras `cubre` sea cierto, que este componente tapa el mapa. */
export function useCubreElMapa(cubre: boolean) {
  useEffect(() => {
    if (!cubre) return undefined
    return cubrirMapa()
  }, [cubre])
}

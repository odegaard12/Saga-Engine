import { createContext, useContext, useEffect } from 'react'

/**
 * «Ahora mismo no hay ningún reto en pantalla.»
 *
 * Lo declara cada minijuego con pantallas de reglas o de resultado
 * (`useSinRetoEnPantalla(phase === 'ready')`) y lo recoge la hoja del reto
 * (`InteractionSheet`), que se lo pasa al anti-trampas: salir de la app en la
 * pantalla de reglas -o en la de «has ganado»- no es hacer trampa, no hay nada
 * que memorizar fuera. Sólo se cuenta una salida mientras el reto está delante.
 *
 * Un contexto y no una prop por familia: son trece juegos, cargados cada uno en
 * su propio paquete, y así ninguno tiene que saber quién lo escucha. Sin
 * proveedor (el banco de pruebas, por ejemplo) no hace nada.
 *
 * Un juego que no declara nada cuenta como «reto delante» todo el rato, que es
 * lo que había antes.
 */

export const SinRetoContext = createContext<((sinReto: boolean) => void) | null>(null)

export function useSinRetoEnPantalla(sinReto: boolean) {
  const declarar = useContext(SinRetoContext)

  useEffect(() => {
    if (!declarar) return undefined
    declarar(sinReto)
    // Al desmontarse (el juego se rearma tras una salida, o se cierra la hoja)
    // deja de declarar nada: quien venga detrás declarará lo suyo.
    return () => declarar(false)
  }, [declarar, sinReto])
}

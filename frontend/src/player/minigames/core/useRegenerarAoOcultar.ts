import { useEffect, useRef } from 'react'

/**
 * Antitrampas: "captura el patrón, sal de la app, resuélvelo con calma".
 *
 * Los minijuegos de patrón -circuitMatrix, sequenceCode, placeMosaic,
 * tiltMaze- enseñan algo que hay que memorizar y luego reproducir. Sin
 * esto, la trampa es trivial: hacer una captura de pantalla del patrón,
 * salir de la app (o del móvil entero) a mirarla con calma, y volver ya
 * sabiendo la respuesta. El reloj del nodo sigue corriendo mientras tanto
 * -no hace falta descontarle nada aparte-, así que la única defensa real
 * es que la captura deje de servir: al volver, el patrón YA NO ES el
 * mismo.
 *
 * No es un "descuento de tiempo": es que la trampa deja de funcionar. El
 * jugador vuelve a la pantalla de "Comenzar" con un patrón nuevo, como si
 * hubiera perdido el intento -que es justo lo que pasó, salir cuenta como
 * abandonar el intento en marcha-.
 *
 * Solo dispara mientras `activo` es cierto -el llamador decide qué fases
 * cuentan como "hay algo que memorizar en pantalla ahora mismo"-, para no
 * penalizar a quien sale en la pantalla de reglas o tras haber ganado.
 */
export function useRegenerarAoOcultar(activo: boolean, alOcultar: () => void) {
  const alOcultarRef = useRef(alOcultar)
  alOcultarRef.current = alOcultar

  useEffect(() => {
    if (!activo) return undefined

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') alOcultarRef.current()
    }

    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [activo])
}

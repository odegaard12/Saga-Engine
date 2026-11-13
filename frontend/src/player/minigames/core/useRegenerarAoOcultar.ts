import { useEffect, useRef } from 'react'
import { esSalidaDeliberada, SALIDA_MINIMA_MS, vigilarInteraccion } from '../../hooks/salidasDeLaApp'

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
 *
 * Y sólo dispara si el jugador SE FUE, no si el móvil se apagó solo: con el
 * autobloqueo puesto, un móvil que nadie toca durante 30 s en pleno laberinto
 * -se juega inclinándolo, no tocándolo- dejaba la página oculta y el intento
 * se daba por perdido sin que el jugador hubiera hecho nada. La regla (ni la
 * propia app pidiendo un permiso, ni una pantalla sin tocar hace más de 10 s)
 * es la misma que usa `useAntiTrampas`: ver `hooks/salidasDeLaApp.ts`.
 *
 * 14/11: el patrón se rehace AL VOLVER y solo si la salida duró `SALIDA_MINIMA_MS` (6 s), la misma regla con la
 * que `useAntiTrampas` cobra los +30 s. Antes se rehacía al ocultarse, sin mirar cuánto: una llamada que se rechaza
 * en 3 s reiniciaba el reto SIN penalización, y una salida de más de 6 s se cobraba. Al volver a una página que ya
 * lleva el patrón nuevo, la captura sigue sin servir: lo importante es que no esté el viejo delante.
 */
export function useRegenerarAoOcultar(activo: boolean, alOcultar: () => void) {
  const alOcultarRef = useRef(alOcultar)
  alOcultarRef.current = alOcultar

  useEffect(() => {
    if (!activo) return undefined

    const dejarDeVigilarToques = vigilarInteraccion()

    let desde: number | null = null
    const onVisibility = () => {
      if (document.visibilityState === 'hidden' && esSalidaDeliberada()) {
        desde = Date.now()
        return
      }
      if (document.visibilityState !== 'visible' || desde === null) return
      const fuera = Date.now() - desde
      desde = null
      if (fuera >= SALIDA_MINIMA_MS) alOcultarRef.current()
    }

    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      dejarDeVigilarToques()
    }
  }, [activo])
}

import { useEffect, useState } from 'react'

/**
 * Los permisos que la ruta necesita: cámara y movimiento.
 *
 * Salido de `PlayerApp.tsx` como tercera tajada.
 *
 * ⚠️ **Cada uno por su lado, y esto ya costó una tarde.** Iban juntos: se pedían
 * los dos de golpe y sólo se daban por buenos si los dos salían bien. Conceder
 * el movimiento no quitaba la fila porque la cámara había fallado, y encima
 * saltaba un aviso arriba diciendo que faltaba la cámara cuando lo que acababas
 * de conceder era el movimiento. Separados, cada uno se pide con su botón y se
 * apaga en cuanto está.
 *
 * El de movimiento sólo existe en iOS. En Android y en escritorio no hay nada
 * que pedir, así que se da por concedido y se avisa al mapa para que enganche la
 * brújula; si no, en Android la brújula no arrancaba nunca porque esperaba un
 * permiso que ese sistema no pide.
 */

export type EstadoPermiso = 'idle' | 'pidiendo' | 'ok' | 'error'

/** El mapa engancha la brújula al oír esto. */
const AVISO_MOVIMIENTO = 'saga:motion-granted'

function iosPideMovimiento(): boolean {
  const Orientacion = window.DeviceOrientationEvent as
    | { requestPermission?: unknown }
    | undefined

  return typeof Orientacion?.requestPermission === 'function'
}

/**
 * Lo que el jugador ya concedió se recuerda en el móvil.
 *
 * En iPhone no hay forma de preguntar si la cámara está concedida sin
 * pedirla, y el permiso de movimiento exige un toque en cada sesión: la
 * tarjeta de "antes de salir" salía SIEMPRE, con todo concedido, y el
 * jugador tenía que volver a pulsar "Permitir" cada vez que abría la app.
 * Con la memoria, lo concedido una vez se da por concedido; si el sistema
 * lo retiró, el uso real (hacer la foto, la brújula) lo volverá a pedir.
 */
const CLAVE_CAMARA = 'saga:permiso:camara'
const CLAVE_MOVIMIENTO = 'saga:permiso:movimiento'

/**
 * La memoria dura lo que dure la sesión, no para siempre.
 *
 * Con memoria permanente la tarjeta de "antes de salir" dejó de aparecer
 * nunca: se entraba al juego sin que nadie pidiera nada, y si el sistema
 * había retirado la cámara no se sabía hasta estar en el monte con el
 * cronómetro corriendo. Con `sessionStorage`, cada vez que se abre la app
 * se piden una vez —sin ventana del sistema si ya estaban dados, porque el
 * móvil resuelve en silencio lo que ya concedió— y las recargas dentro de
 * la misma sesión no molestan.
 */
function recordado(clave: string): boolean {
  try {
    return window.sessionStorage.getItem(clave) === 'ok'
  } catch {
    return false
  }
}

function olvidar(clave: string) {
  try {
    window.sessionStorage.removeItem(clave)
  } catch {
    // Sin almacenamiento: no había nada que olvidar.
  }
}

function recordar(clave: string) {
  try {
    window.sessionStorage.setItem(clave, 'ok')
  } catch {
    // Sin almacenamiento (modo privado): se pedirá otra vez, sin más.
  }
}

export function usePermisos() {
  const [camara, setCamara] = useState<EstadoPermiso>('idle')
  const [movimiento, setMovimiento] = useState<EstadoPermiso>('idle')

  /**
   * "No que ponga cuatro y despues ponga dos."
   *
   * `camara` y `movimiento` arrancan en `idle` -que cuenta como pendiente- y
   * el chequeo de si YA estaban concedidos es asincrono: la primera pintura
   * los contaba a los dos como pendientes, y un instante despues -a veces un
   * solo fotograma, a veces unos milisegundos- se corregian a "ok" si ya
   * estaban dados. Eso es exactamente el parpadeo "4 permisos, luego 2".
   *
   * `comprobado` se queda en falso hasta que la comprobacion ha terminado.
   * Quien pinta la tarjeta espera a esto para su primer render, asi que
   * cuando aparece ya sabe la cuenta de verdad y no hay nada que corregir
   * despues.
   */
  const [comprobado, setComprobado] = useState(false)

  /** El jugador cerró la tarjeta de preparación: no vuelve a salir sola. */
  const [prepCerrada, setPrepCerrada] = useState(false)

  async function pedirCamara() {
    setCamara('pidiendo')

    try {
      const stream = await navigator.mediaDevices?.getUserMedia({
        video: { facingMode: 'environment' },
      })

      if (!stream) throw new Error('sin cámara')

      // Sólo se quería el permiso: la cámara se suelta en el acto. Dejarla
      // abierta gasta batería y deja el piloto encendido, que asusta.
      stream.getTracks().forEach((track) => track.stop())
      setCamara('ok')
      recordar(CLAVE_CAMARA)
    } catch {
      setCamara('error')
    }
  }

  async function pedirMovimiento() {
    setMovimiento('pidiendo')

    const Orientacion = window.DeviceOrientationEvent as
      | (typeof DeviceOrientationEvent & { requestPermission?: () => Promise<string> })
      | undefined

    // Android y escritorio: no hay permiso que pedir, va directo.
    if (!Orientacion || typeof Orientacion.requestPermission !== 'function') {
      setMovimiento('ok')
      window.dispatchEvent(new CustomEvent(AVISO_MOVIMIENTO))
      return
    }

    try {
      const concedido = (await Orientacion.requestPermission()) === 'granted'
      setMovimiento(concedido ? 'ok' : 'error')
      if (concedido) {
        recordar(CLAVE_MOVIMIENTO)
        window.dispatchEvent(new CustomEvent(AVISO_MOVIMIENTO))
      }
    } catch {
      setMovimiento('error')
    }
  }

  // Si ya estaban concedidos de antes, no se molesta al jugador.
  useEffect(() => {
    let cancelado = false

    async function comprobar() {
      // Donde no hace falta permiso de movimiento se da por hecho y se engancha.
      if (!iosPideMovimiento() && !cancelado) {
        setMovimiento('ok')
        window.dispatchEvent(new CustomEvent(AVISO_MOVIMIENTO))
      } else if (recordado(CLAVE_MOVIMIENTO) && !cancelado) {
        /**
         * iPhone con el movimiento ya concedido otra vez: se da por bueno
         * sin tarjeta, y la petición real -que iOS exige hacer desde un
         * toque- se cuela en el PRIMER toque del jugador en cualquier
         * sitio. Ya concedido, iOS la resuelve sin preguntar nada.
         */
        setMovimiento('ok')
        const alPrimerToque = () => {
          window.removeEventListener('pointerdown', alPrimerToque)
          const Orientacion = window.DeviceOrientationEvent as
            | (typeof DeviceOrientationEvent & { requestPermission?: () => Promise<string> })
            | undefined
          Orientacion?.requestPermission?.()
            .then((estado) => {
              if (estado === 'granted') window.dispatchEvent(new CustomEvent(AVISO_MOVIMIENTO))
            })
            .catch(() => {
              // Si lo retiraron, la brújula lo pedirá cuando se use.
            })
        }
        window.addEventListener('pointerdown', alPrimerToque, { once: true })
      }

      // Cámara recordada: no se molesta. Si el sistema la retiró, la foto
      // la volverá a pedir en su momento.
      if (recordado(CLAVE_CAMARA) && !cancelado) setCamara('ok')

      if (typeof navigator === 'undefined' || !navigator.permissions?.query) return

      try {
        const estado = await navigator.permissions.query({ name: 'camera' as PermissionName })
        if (cancelado) return
        if (estado.state === 'granted') {
          setCamara('ok')
        } else {
          // El navegador dice que NO está concedida: la memoria mentía.
          olvidar(CLAVE_CAMARA)
          setCamara('idle')
        }
      } catch {
        // Navegador sin Permissions API para la cámara: se queda pendiente y
        // se pedirá con el botón. No es un error.
      }
    }

    comprobar().finally(() => {
      if (!cancelado) setComprobado(true)
    })

    return () => {
      cancelado = true
    }
  }, [])

  return {
    camara,
    movimiento,
    comprobado,
    prepCerrada,
    setPrepCerrada,
    pedirCamara,
    pedirMovimiento,
  }
}

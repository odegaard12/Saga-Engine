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

export function usePermisos() {
  const [camara, setCamara] = useState<EstadoPermiso>('idle')
  const [movimiento, setMovimiento] = useState<EstadoPermiso>('idle')

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
      if (concedido) window.dispatchEvent(new CustomEvent(AVISO_MOVIMIENTO))
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
      }

      if (typeof navigator === 'undefined' || !navigator.permissions?.query) return

      try {
        const estado = await navigator.permissions.query({ name: 'camera' as PermissionName })
        if (!cancelado && estado.state === 'granted') setCamara('ok')
      } catch {
        // Navegador sin Permissions API para la cámara: se queda pendiente y
        // se pedirá con el botón. No es un error.
      }
    }

    void comprobar()

    return () => {
      cancelado = true
    }
  }, [])

  return {
    camara,
    movimiento,
    prepCerrada,
    setPrepCerrada,
    pedirCamara,
    pedirMovimiento,
  }
}

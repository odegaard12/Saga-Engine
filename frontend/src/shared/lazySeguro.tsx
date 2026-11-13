import { lazy, useEffect, useState, type ComponentType, type CSSProperties } from 'react'
import { getLocale } from '../i18n'
import { textosDePantallasDe } from '../player/components/textosDePantallas'

/**
 * `React.lazy`, pero que no tumba la partida si la pieza no se puede bajar.
 *
 * Revisión 19/10 (prueba con navegador real): quien entra con «Entrar igualmente» antes de que se guarden todas las
 * piezas de la app y luego se queda sin cobertura, al necesitar una de ellas (la clasificación, una hoja, un
 * minijuego) veía «SAGA Engine no pudo cargarse correctamente»: el fallo de la importación subía hasta el
 * ErrorBoundary de arriba y se llevaba la app entera. Ahora en su lugar no se pinta nada (en un minijuego, la hoja
 * sigue ofreciendo el código de respaldo) y se reintenta sola al volver la red y cada 30 s.
 *
 * 14/11 (auditoría de antifallos): sin salida, un mapa o una hoja que no bajaba se quedaba en blanco para siempre
 * (Chrome y Safari recuerdan el fallo de un `import()` hasta recargar la página, así que reintentar el mismo no sirve).
 * Tras `MAX_FALLOS` intentos seguidos que fallan se deja de insistir cada 30 s y se enseña «No se pudo cargar esta
 * parte» con un botón para recargar. Al volver la red se sigue intentando una vez (no es un bucle: un evento por vuelta).
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- igual que `React.lazy`: vale para cualquier componente */
type Cargador<T extends ComponentType<any>> = () => Promise<{ default: T }>

export function lazySeguro<T extends ComponentType<any>>(cargar: Cargador<T>) {
  return lazy<T>(async () => {
    try {
      return await cargar()
    } catch {
      return { default: piezaQueReintenta(cargar) as unknown as T }
    }
  })
}

/** Con el primer fallo (el que crea la pieza pendiente) y un reintento fallido ya son dos: se deja de insistir. */
export const MAX_FALLOS = 2

const avisoPerdida: CSSProperties = {
  display: 'grid',
  gap: 8,
  padding: '12px 14px',
  margin: 12,
  borderRadius: 'var(--theme-radius-card)',
  border: '1px solid var(--theme-hairline)',
  background: 'var(--theme-card)',
  color: 'var(--theme-text)',
  fontSize: 14,
}

function AvisoDePiezaPerdida() {
  const t = textosDePantallasDe(getLocale()).ui.errorLocal
  return (
    <div role="alert" style={avisoPerdida}>
      <strong>{t.piezaPerdidaTitulo}</strong>
      <span>{t.piezaPerdidaCuerpo}</span>
      {/* Recarga directa: es un toque del jugador y su partida está guardada en el móvil. `recargarCuandoSeaSeguro` esperaría
          a que se cierre la hoja, justo la que no se puede mostrar. */}
      <button
        type="button"
        onClick={() => window.location.reload()}
        style={{
          justifySelf: 'start',
          minHeight: 44,
          padding: '8px 16px',
          borderRadius: 999,
          border: '1px solid var(--theme-hairline)',
          background: 'transparent',
          color: 'inherit',
          font: 'inherit',
          cursor: 'pointer',
        }}
      >
        {t.recargar}
      </button>
    </div>
  )
}

function piezaQueReintenta(cargar: Cargador<ComponentType<any>>): ComponentType<any> {
  let cargada: ComponentType<any> | null = null

  return function PiezaPendiente(props: any) {
    const [Pieza, setPieza] = useState<ComponentType<any> | null>(() => cargada)
    // El primer fallo ya ocurrió (por eso existe esta pieza).
    const [fallos, setFallos] = useState(1)

    useEffect(() => {
      if (Pieza) return undefined
      let viva = true
      const intentar = () => {
        if (typeof navigator !== 'undefined' && navigator.onLine === false) return
        cargar()
          .then((m) => {
            cargada = m.default
            if (viva) setPieza(() => m.default)
          })
          .catch(() => {
            if (viva) setFallos((n) => n + 1)
          })
      }
      window.addEventListener('online', intentar)
      // Cada 30 s solo mientras queden intentos: después, el aviso con su botón y nada de bucle.
      const reloj = fallos < MAX_FALLOS ? window.setInterval(intentar, 30_000) : undefined
      return () => {
        viva = false
        window.removeEventListener('online', intentar)
        if (reloj !== undefined) window.clearInterval(reloj)
      }
    }, [Pieza, fallos])

    if (Pieza) return <Pieza {...props} />
    return fallos >= MAX_FALLOS ? <AvisoDePiezaPerdida /> : null
  }
}

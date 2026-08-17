import { useEffect, useState, type CSSProperties } from 'react'

/**
 * El juego se juega en vertical. Siempre.
 *
 * Hasta ahora lo único que lo pedía era `orientation: portrait` en el
 * manifiesto, y eso sólo lo respeta Android con la aplicación instalada desde
 * la pantalla de inicio. En iOS no existe, y en un navegador normal tampoco:
 * quien jugara con el móvil desbloqueado veía los minijuegos girados y
 * descuadrados, porque todos están pensados para vertical —el laberinto de
 * inclinación mide el eje corto, y el mosaico reparte la foto en columnas.
 *
 * Aquí se hacen las dos cosas que se pueden hacer:
 *
 *  1. Pedir el bloqueo por API donde exista. Sólo funciona a pantalla completa
 *     y en algunos navegadores; se intenta y si no, no pasa nada.
 *  2. Donde no exista, tapar la pantalla y pedir que giren el móvil. No es tan
 *     elegante, pero es lo único que funciona en iOS y es honesto: dice qué
 *     hacer y desaparece solo al hacerlo.
 *
 * El aviso NO sale en pantallas grandes: un portátil en horizontal es un uso
 * legítimo —el panel de administración, las pruebas— y taparlo sería absurdo.
 */

/** Por debajo de esto es un móvil, y ahí el horizontal no vale. */
const ANCHO_DE_MOVIL = 900

function estaTumbado(): boolean {
  if (typeof window === 'undefined') return false

  const ancho = window.innerWidth
  const alto = window.innerHeight

  // Con el teclado abierto la altura se desploma y la ventana parece apaisada
  // sin que nadie haya girado nada. Por eso se mira también el lado corto: un
  // móvil tumbado tiene el lado corto pequeño de verdad.
  const apaisado = ancho > alto
  const ladoCorto = Math.min(ancho, alto)

  return apaisado && ladoCorto < ANCHO_DE_MOVIL
}

/** Pide el bloqueo por API. Silencioso: donde no se puede, no se puede. */
async function pedirBloqueo() {
  if (typeof window === 'undefined') return

  const orientacion = window.screen?.orientation as
    | (ScreenOrientation & { lock?: (o: string) => Promise<void> })
    | undefined

  try {
    await orientacion?.lock?.('portrait')
  } catch {
    // Lo normal: casi ningún navegador lo permite fuera de pantalla completa,
    // y iOS no lo trae. Para eso está el aviso.
  }
}

export function BloqueoVertical() {
  const [tumbado, setTumbado] = useState(estaTumbado)

  useEffect(() => {
    void pedirBloqueo()

    const mirar = () => setTumbado(estaTumbado())

    /**
     * Se escucha por cuatro sitios porque ninguno vale en todos los móviles.
     *
     * `orientationchange` está en desuso y iOS lo dispara tarde. `resize` no
     * siempre llega: comprobado, hay entornos donde la ventana cambia de tamaño
     * y no se emite. `matchMedia` sobre la orientación es el que mejor se porta
     * y el único que iOS respeta siempre. Escuchar de más no cuesta nada;
     * quedarse esperando un evento que no llega deja el aviso puesto encima del
     * juego, que es peor que no tenerlo.
     */
    const apaisado = window.matchMedia?.('(orientation: landscape)')

    window.addEventListener('resize', mirar)
    window.addEventListener('orientationchange', mirar)
    window.screen?.orientation?.addEventListener?.('change', mirar)
    apaisado?.addEventListener?.('change', mirar)

    return () => {
      window.removeEventListener('resize', mirar)
      window.removeEventListener('orientationchange', mirar)
      window.screen?.orientation?.removeEventListener?.('change', mirar)
      apaisado?.removeEventListener?.('change', mirar)
    }
  }, [])

  if (!tumbado) return null

  return (
    <div style={capa} role="alertdialog" aria-label="Gira el móvil">
      <div style={icono} aria-hidden="true">
        <svg viewBox="0 0 64 64" width="64" height="64" fill="none">
          <rect x="20" y="4" width="24" height="42" rx="4" stroke="#3fbe83" strokeWidth="2.5" />
          <rect x="27.5" y="8.5" width="9" height="1.6" rx="0.8" fill="#3fbe83" />
          <path
            d="M14 52 A 22 22 0 0 0 50 52"
            stroke="#3fbe83"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <path d="M50 52 l-1 -6 M50 52 l6 -1" stroke="#3fbe83" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      </div>
      <div style={titulo}>Gira el móvil</div>
      <div style={texto}>SAGA se juega en vertical.</div>
    </div>
  )
}

const capa: CSSProperties = {
  position: 'fixed',
  inset: 0,
  // Por encima de todo, incluidos los minijuegos y la cámara.
  zIndex: 2147483000,
  background: '#0b1512',
  color: '#ffffff',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 14,
  padding: 24,
  textAlign: 'center',
  fontFamily: 'Inter, Segoe UI, system-ui, sans-serif',
}

const icono: CSSProperties = {
  opacity: 0.95,
}

const titulo: CSSProperties = {
  fontSize: 22,
  fontWeight: 800,
  letterSpacing: '0.02em',
}

const texto: CSSProperties = {
  fontSize: 15,
  color: 'rgba(255,255,255,0.72)',
}

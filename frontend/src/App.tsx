import type { ReactNode } from 'react'
import { Suspense, lazy, useEffect, useState } from 'react'
import { BienvenidaSiToca } from './player/components/Bienvenida'
import { getPlayerNameFromLocation } from './shared/playerRoute'
import { BuildInfoBadge } from './shared/BuildInfoBadge'
import PuertaDeMision, { PortadaDeArranque } from './shared/PuertaDeMision'
import { lazySeguro } from './shared/lazySeguro'
import { bloquearGestosDeZoom, fijarViewport } from './player/utils/sinZoomDePagina'
import { instalarVistaTrasTeclado } from './player/utils/vistaTrasTeclado'

/**
 * El panel de administración se carga aparte, sólo al entrar en él.
 *
 * Estaba importado de forma normal, así que iba dentro del mismo paquete que el
 * juego: cada jugador se descargaba el editor de mapas, el estudio de tarjetas
 * QR, los editores de nodos y la librería de comprimir, para no abrirlos jamás.
 * Eso es peso de descarga en el punto de salida, con la cobertura que haya, y
 * espacio ocupado en el móvil para siempre.
 */
/** La pantalla de elegir jugador: el jugador que ya tiene su enlace no la necesita. */
const LoginApp = lazy(() => import('./login/LoginApp'))

const AdminApp = lazy(() => import('./admin/AdminApp'))

/**
 * Banco de pruebas del mapa, aparte del juego.
 *
 * Va suelto y cargado sólo al entrar: no es una pantalla de jugador y no
 * tiene por qué viajar en el paquete que se descarga en el punto de salida.
 */
const BancoMapa = lazy(() => import('./banco/BancoMapa'))

/**
 * La pantalla del jugador, también en su propio paquete (mejora 5, 21/11): la entrada se queda en lo que hace falta
 * para pintar la portada y la puerta de la misión, y el juego llega detrás. Va con `lazySeguro`: sin red y sin el
 * paquete guardado no tumba la app, enseña «No se pudo cargar esta parte». Su paquete está en player-precache.json
 * (el plugin sigue también los import() dinámicos) y el service worker lo guarda al pedirlo, como el del mapa.
 */
const PlayerApp = lazySeguro(() => import('./player/PlayerApp'))

function ensurePlayerQueryParam(user: string): void {
  if (typeof window === 'undefined') return
  if (!window.location.pathname.startsWith('/player/')) return

  const params = new URLSearchParams(window.location.search)
  if (params.get('user') === user) return

  params.set('user', user)
  const nextSearch = params.toString()
  const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash}`
  window.history.replaceState(window.history.state, '', nextUrl)
}

/** Mientras llega el paquete del panel. Se ve un instante y sólo en admin. */
function PantallaCargandoAdmin() {
  return (
    <div
      style={{
        display: 'grid',
        placeItems: 'center',
        minHeight: '100dvh',
        background: '#0f172a',
        color: 'rgba(226,232,240,.72)',
        font: '600 14px/1.4 system-ui, sans-serif',
        letterSpacing: '.04em',
      }}
    >
      Cargando control de misión…
    </div>
  )
}

export default function App() {
  const [currentPath, setCurrentPath] = useState(() => window.location.pathname)

  useEffect(() => {
    const handleNavigation = () => {
      setCurrentPath(window.location.pathname)
    }

    window.addEventListener('popstate', handleNavigation)
    window.addEventListener('saga:navigate', handleNavigation)

    return () => {
      window.removeEventListener('popstate', handleNavigation)
      window.removeEventListener('saga:navigate', handleNavigation)
    }
  }, [])

  // 24/11: `/admin` ya no redirige; si un build sin admin.html sirve esta página ahí, también es el panel.
  const isAdmin = currentPath === '/admin' || currentPath === '/admin-react' || currentPath.startsWith('/admin-react/')
  // La app del jugador nunca se amplía (campos a 16 px, meta y gestos); el panel sí puede.
  useEffect(() => {
    fijarViewport(!isAdmin)
  }, [isAdmin])
  useEffect(() => bloquearGestosDeZoom(), [])
  // iPhone: al cerrar el teclado la pantalla vuelve a su sitio (no se queda «subida»).
  useEffect(() => (isAdmin ? undefined : instalarVistaTrasTeclado()), [isAdmin])
  const esBancoDeMapa = currentPath === '/banco-mapa'
  let content: ReactNode
  let showFloatingBuildInfo = true

  if (esBancoDeMapa) {
    /**
     * El banco NO pasa por la pantalla del jugador a propósito.
     *
     * Esa pantalla sólo se abre en vertical, pide elegir jugador y se pasa
     * cuarenta y cinco segundos descargando la misión. En un escritorio ni
     * siquiera llega a montar el mapa: enseña el aviso de girar el móvil.
     * Con todo eso delante, revisar un cambio de mapa era imposible.
     */
    content = (
      <Suspense fallback={<PantallaCargandoAdmin />}>
        <BancoMapa />
      </Suspense>
    )
    showFloatingBuildInfo = false
  } else if (isAdmin) {
    content = (
      <Suspense fallback={<PantallaCargandoAdmin />}>
        <AdminApp />
      </Suspense>
    )
  } else {
    const user = getPlayerNameFromLocation()
    // Con clave de misión puesta y sin desbloquear, la puerta pide el código
    // antes de enseñar el login o el juego (ver shared/PuertaDeMision.tsx).
    if (!user) {
      content = (
        <PuertaDeMision>
          <Suspense fallback={<PortadaDeArranque />}>
            <LoginApp />
          </Suspense>
        </PuertaDeMision>
      )
    } else {
      ensurePlayerQueryParam(user)
      content = (
        <PuertaDeMision>
          {/* Mientras llega el paquete del juego, la misma portada que la puerta: nunca una pantalla vacía. */}
          <Suspense fallback={<PortadaDeArranque />}>
            <PlayerApp />
          </Suspense>
          <BienvenidaSiToca usuario={user} />
        </PuertaDeMision>
      )
      showFloatingBuildInfo = false
    }
  }

  return (
    <>
      {content}
      {showFloatingBuildInfo ? <BuildInfoBadge /> : null}
    </>
  )
}

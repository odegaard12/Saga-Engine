import type { ReactNode } from 'react'
import { Suspense, lazy, useEffect, useState } from 'react'
import LoginApp from './login/LoginApp'
import PlayerApp from './player/PlayerApp'
import { getPlayerNameFromLocation } from './shared/playerRoute'
import { BuildInfoBadge } from './shared/BuildInfoBadge'

/**
 * El panel de administración se carga aparte, sólo al entrar en él.
 *
 * Estaba importado de forma normal, así que iba dentro del mismo paquete que el
 * juego: cada jugador se descargaba el editor de mapas, el estudio de tarjetas
 * QR, los editores de nodos y la librería de comprimir, para no abrirlos jamás.
 * Eso es peso de descarga en el punto de salida, con la cobertura que haya, y
 * espacio ocupado en el móvil para siempre.
 */
const AdminApp = lazy(() => import('./admin/AdminApp'))

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

  const isAdmin = currentPath === '/admin-react' || currentPath.startsWith('/admin-react/')
  let content: ReactNode
  let showFloatingBuildInfo = true

  if (isAdmin) {
    content = (
      <Suspense fallback={<PantallaCargandoAdmin />}>
        <AdminApp />
      </Suspense>
    )
  } else {
    const user = getPlayerNameFromLocation()
    if (!user) {
      content = <LoginApp />
    } else {
      ensurePlayerQueryParam(user)
      content = <PlayerApp />
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

import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import AdminApp from './admin/AdminApp'
import LoginApp from './login/LoginApp'
import PlayerApp from './player/PlayerApp'
import { getPlayerNameFromLocation } from './shared/playerRoute'
import { BuildInfoBadge } from './shared/BuildInfoBadge'

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
    content = <AdminApp />
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

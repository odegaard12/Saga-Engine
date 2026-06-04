import AdminApp from './admin/AdminApp'
import LoginApp from './login/LoginApp'
import PlayerApp from './player/PlayerApp'
import { ErrorBoundary } from './shared/ErrorBoundary'
import { getPlayerNameFromLocation } from './shared/playerRoute'

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
  const path = window.location.pathname

  if (path === '/admin-react' || path.startsWith('/admin-react/')) {
    return <ErrorBoundary surface="Panel admin"><AdminApp /></ErrorBoundary>
  }

  const user = getPlayerNameFromLocation()
  if (!user) return <ErrorBoundary surface="Login"><LoginApp /></ErrorBoundary>

  ensurePlayerQueryParam(user)
  return <ErrorBoundary surface="Player"><PlayerApp /></ErrorBoundary>
}

import AdminApp from './admin/AdminApp'
import LoginApp from './login/LoginApp'
import PlayerApp from './player/PlayerApp'
import { getPlayerNameFromLocation } from './shared/playerRoute'

export default function App() {
  const path = window.location.pathname

  if (path === '/admin-react' || path.startsWith('/admin-react/')) {
    return <AdminApp />
  }

  const user = getPlayerNameFromLocation()
  return user ? <PlayerApp /> : <LoginApp />
}

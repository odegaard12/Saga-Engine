import LoginApp from './login/LoginApp'
import PlayerApp from './player/PlayerApp'

function getUserFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search)
  return params.get('user')
}

export default function App() {
  const user = getUserFromUrl()
  return user ? <PlayerApp /> : <LoginApp />
}

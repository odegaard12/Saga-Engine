import LoginApp from './login/LoginApp'
import PlayerApp from './player/PlayerApp'
import { getPlayerNameFromLocation } from './shared/playerRoute'

export default function App() {
  const user = getPlayerNameFromLocation()
  return user ? <PlayerApp /> : <LoginApp />
}

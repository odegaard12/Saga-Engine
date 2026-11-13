import { recordarJugador } from './jugadorRecordado'

export function getPlayerNameFromLocation(): string | null {
  const params = new URLSearchParams(window.location.search)
  const queryUser = params.get('user')

  if (queryUser && queryUser.trim()) {
    const clean = queryUser.trim()
    recordarJugador(clean)
    return clean
  }

  const match = window.location.pathname.match(/^\/player\/(.+)$/)
  if (match?.[1]) {
    try {
      const decoded = decodeURIComponent(match[1].replace(/\+/g, ' ')).trim()
      if (decoded) {
        recordarJugador(decoded)
        return decoded
      }
    } catch {
      if (match[1].trim()) {
        recordarJugador(match[1].trim())
        return match[1].trim()
      }
    }
  }

  return null
}

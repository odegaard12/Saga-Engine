export function getPlayerNameFromLocation(): string | null {
  const params = new URLSearchParams(window.location.search)
  const queryUser = params.get('user')

  if (queryUser && queryUser.trim()) {
    const clean = queryUser.trim()
    try {
      localStorage.setItem('saga_remembered_player', clean)
    } catch {}
    return clean
  }

  const match = window.location.pathname.match(/^\/player\/(.+)$/)
  if (match?.[1]) {
    try {
      const decoded = decodeURIComponent(match[1].replace(/\+/g, ' ')).trim()
      if (decoded) {
        try {
          localStorage.setItem('saga_remembered_player', decoded)
        } catch {}
        return decoded
      }
    } catch {
      if (match[1].trim()) {
        try {
          localStorage.setItem('saga_remembered_player', match[1].trim())
        } catch {}
        return match[1].trim()
      }
    }
  }

  return null
}

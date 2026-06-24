export function getPlayerNameFromLocation(): string | null {
  const params = new URLSearchParams(window.location.search)
  const queryUser = params.get('user')

  if (queryUser && queryUser.trim()) {
    return queryUser.trim()
  }

  const match = window.location.pathname.match(/^\/player\/(.+)$/)
  if (!match?.[1]) return null

  try {
    return decodeURIComponent(match[1].replace(/\+/g, ' ')).trim() || null
  } catch {
    return match[1].trim() || null
  }
}

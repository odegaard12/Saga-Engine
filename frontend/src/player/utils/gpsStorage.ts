const FIRST_RUN_KEY = 'saga_first_run_done'
const GPS_KEY = 'saga_gps_granted'

export function shouldShowIntro(): boolean {
  return true // siempre mostrar intro — el FirstRunGate decide internamente qué mostrar
}

export function markIntroDone(): void {
  if (typeof window === 'undefined') return
  try { window.localStorage.setItem(FIRST_RUN_KEY, '1') } catch { /* ignore */ }
}

export function rememberGpsReady(): void {
  if (typeof window === 'undefined') return
  try { window.localStorage.setItem(GPS_KEY, '1') } catch { /* ignore */ }
}

export function hasRememberedGpsReady(): boolean {
  if (typeof window === 'undefined') return false
  try { return window.localStorage.getItem(GPS_KEY) === '1' } catch { return false }
}

export function isFirstRunForPlayer(user: string): boolean {
  if (typeof window === 'undefined') return true
  try {
    return window.localStorage.getItem(`saga_player_init_${user}`) !== '1'
  } catch { return true }
}

export function markFirstRunCompleteForPlayer(user: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(`saga_player_init_${user}`, '1')
  } catch { /* ignore */ }
}

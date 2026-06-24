import { getLocale, setLocale, t, type Locale } from './index'

const MENU_ID = 'saga-admin-settings-language-menu'

function isAdminRoute() {
  return window.location.pathname.startsWith('/admin-react')
}

function findSettingsPanel(): HTMLElement | null {
  const candidates = Array.from(document.querySelectorAll<HTMLElement>('aside, section, div'))
    .filter((element) => {
      if (element.id === MENU_ID || element.closest(`#${MENU_ID}`)) return false

      const text = (element.textContent || '').replace(/\s+/g, ' ').trim()
      const hasSettings =
        text.includes('Mission settings') ||
        text.includes('Ajustes de misión') ||
        text.includes('Settings') ||
        text.includes('Ajustes')

      const hasSave =
        text.includes('Save settings') ||
        text.includes('Guardar ajustes') ||
        text.includes('Site name') ||
        text.includes('Nombre del sitio')

      return hasSettings && hasSave
    })
    .sort((a, b) => (a.textContent || '').length - (b.textContent || '').length)

  return candidates[0] || null
}

function renderMenu(root: HTMLElement) {
  const locale = getLocale()

  root.innerHTML = `
    <span>${t('common.language', locale)}</span>
    <div>
      <button type="button" data-locale="en" class="${locale === 'en' ? 'active' : ''}">EN</button>
      <button type="button" data-locale="es" class="${locale === 'es' ? 'active' : ''}">ES</button>
    </div>
  `

  root.querySelectorAll<HTMLButtonElement>('button[data-locale]').forEach((button) => {
    button.addEventListener('click', () => {
      setLocale(button.dataset.locale as Locale)
      renderMenu(root)
    })
  })
}

function syncAdminSettingsLanguageMenu() {
  const existing = document.getElementById(MENU_ID)

  if (!isAdminRoute()) {
    existing?.remove()
    return
  }

  const panel = findSettingsPanel()
  if (!panel) {
    existing?.remove()
    return
  }

  let root = existing as HTMLElement | null
  if (!root) {
    root = document.createElement('div')
    root.id = MENU_ID
    root.className = 'saga-admin-settings-language-menu'
  }

  renderMenu(root)

  if (!root.parentElement) {
    panel.insertBefore(root, panel.firstChild)
  }
}

let installed = false
let scheduled = false

function scheduleSync() {
  if (scheduled) return
  scheduled = true
  window.requestAnimationFrame(() => {
    scheduled = false
    syncAdminSettingsLanguageMenu()
  })
}

export function setupAdminSettingsLanguageMenu() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  if (installed) return
  installed = true

  const observer = new MutationObserver(scheduleSync)
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  })

  window.addEventListener('saga:locale-change', scheduleSync)
  window.addEventListener('popstate', scheduleSync)
  window.setInterval(scheduleSync, 800)

  scheduleSync()
}

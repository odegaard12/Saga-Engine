import { getLocale, setLocale, t, type Locale } from './index'

const TOGGLE_ID = 'saga-admin-locale-toggle'

function render(root: HTMLElement) {
  const locale = getLocale()

  root.innerHTML = `
    <span class="saga-locale-label">${t('common.language', locale)}</span>
    <button type="button" data-locale="en" class="${locale === 'en' ? 'active' : ''}">EN</button>
    <button type="button" data-locale="es" class="${locale === 'es' ? 'active' : ''}">ES</button>
  `

  root.querySelectorAll<HTMLButtonElement>('button[data-locale]').forEach((button) => {
    button.addEventListener('click', () => {
      const nextLocale = button.dataset.locale as Locale
      setLocale(nextLocale)
      render(root)
    })
  })
}

export function setupAdminLocaleToggle() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  if (!window.location.pathname.startsWith('/admin-react')) return
  if (document.getElementById(TOGGLE_ID)) return

  const root = document.createElement('div')
  root.id = TOGGLE_ID
  root.className = 'saga-admin-locale-toggle'
  root.setAttribute('aria-label', 'SAGA language selector')

  document.body.appendChild(root)
  render(root)
}

import { useState, useEffect } from 'react'
import { getLocale, t, type TranslationKey, type Locale } from './index'

export function useI18n() {
  const [locale, setLocaleState] = useState<Locale>(getLocale())

  useEffect(() => {
    function handleLocaleChange(event: Event) {
      const detail = (event as CustomEvent).detail
      if (detail && detail.locale) {
        setLocaleState(detail.locale as Locale)
      }
    }

    window.addEventListener('saga:locale-change', handleLocaleChange)
    return () => window.removeEventListener('saga:locale-change', handleLocaleChange)
  }, [])

  return {
    locale,
    t: (key: TranslationKey) => t(key, locale),
  }
}

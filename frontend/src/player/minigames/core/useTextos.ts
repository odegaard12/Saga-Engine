import { useI18n } from '../../../i18n/useI18n'
import { textosDe, type Textos } from './textos'

/**
 * Los textos del jugador en el idioma de ahora. Se rehace solo cuando el
 * jugador (o la misión) cambia de idioma: `useI18n` escucha `saga:locale-change`.
 */
export function useTextos(): Textos {
  const { locale } = useI18n()
  return textosDe(locale)
}

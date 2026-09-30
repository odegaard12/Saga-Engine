import { useI18n } from '../../i18n/useI18n'
import { textosDePantallasDe, type TextosDePantallas } from './textosDePantallas'

/** Los textos de las pantallas del jugador en el idioma de ahora (ver `textosDePantallas.ts`). */
export function useTextosDePantallas(): TextosDePantallas {
  const { locale } = useI18n()
  return textosDePantallasDe(locale)
}

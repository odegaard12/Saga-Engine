import { getLocale, type Locale } from '../../i18n'

/**
 * Motivos de la proximidad en el servidor (backend/app/runtime/proximidad.py),
 * en los tres idiomas de la app. Son avisos para revisar: no penalizan.
 */
const TEXTOS: Record<string, Record<Locale, string>> = {
  proximity_far_from_node: {
    es: 'Avance lejos del nodo (GPS real)',
    gl: 'Avance lonxe do nodo (GPS real)',
    en: 'Advance far from the node (real GPS)',
  },
  proximity_test_mode: {
    es: 'Avance en modo prueba (posición manual o simulada)',
    gl: 'Avance en modo proba (posición manual ou simulada)',
    en: 'Advance in test mode (manual or simulated position)',
  },
  proximity_no_gps: {
    es: 'Avance sin GPS (rescate o GPS denegado)',
    gl: 'Avance sen GPS (rescate ou GPS denegado)',
    en: 'Advance without GPS (rescue or GPS denied)',
  },
}

export const MOTIVOS_PROXIMIDAD: Record<string, string> = Object.fromEntries(
  Object.keys(TEXTOS).map((clave) => [clave, TEXTOS[clave].es])
)

/** El texto del motivo en el idioma actual; undefined si no es de proximidad. */
export function etiquetaProximidad(
  clave: string,
  locale: Locale = getLocale()
): string | undefined {
  return TEXTOS[clave]?.[locale] ?? TEXTOS[clave]?.es
}

const VEREDICTO: Record<string, Record<Locale, string>> = {
  lejos: { es: 'lejos del nodo', gl: 'lonxe do nodo', en: 'far from node' },
  modo_prueba: { es: 'modo prueba', gl: 'modo proba', en: 'test mode' },
  sin_gps: { es: 'sin GPS', gl: 'sen GPS', en: 'no GPS' },
}

export function etiquetaVeredicto(
  valor: string | null | undefined,
  locale: Locale = getLocale()
): string {
  if (!valor) return ''
  return VEREDICTO[valor]?.[locale] ?? valor
}

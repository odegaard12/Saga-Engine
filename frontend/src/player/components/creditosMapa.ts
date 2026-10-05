/**
 * Créditos del mapa. Las licencias de las fuentes obligan a citarlas; ya no hay botón «i» sobre el mapa:
 * se muestran, discretos, al pie de la pantalla de carga (`PantallaDeCarga`) y están en el README.
 * El mapa con PNOA/IGN y Catastro añade aquí sus líneas.
 */
export const CREDITOS_DEL_MAPA = {
  es: 'Créditos del mapa: imágenes © Esri; relieve: Terrain Tiles (Mapzen, AWS Open Data).',
  gl: 'Créditos do mapa: imaxes © Esri; relevo: Terrain Tiles (Mapzen, AWS Open Data).',
  en: 'Map credits: imagery © Esri; terrain: Terrain Tiles (Mapzen, AWS Open Data).',
} as const

export function creditosDelMapa(locale: string): string {
  return locale === 'gl' ? CREDITOS_DEL_MAPA.gl : locale === 'en' ? CREDITOS_DEL_MAPA.en : CREDITOS_DEL_MAPA.es
}

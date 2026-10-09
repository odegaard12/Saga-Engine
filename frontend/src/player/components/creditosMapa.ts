/**
 * Créditos del mapa. Las licencias de las fuentes obligan a citarlas; ya no hay botón «i» sobre el mapa:
 * se muestran, discretos, al pie de la pantalla de carga (`PantallaDeCarga`) y están en el README.
 *
 * 5.55: como en 5.51.1, satélite Esri y relieve Terrarium. El MDT05 del IGN y los edificios del Catastro están
 * apagados (se veía borroso el fondo en el iPhone); si se vuelven a encender, hay que citarlos aquí otra vez.
 */
export const CREDITOS_DEL_MAPA = {
  es: 'Créditos del mapa: imágenes © Esri; relieve: Terrain Tiles (Mapzen, AWS Open Data).',
  gl: 'Créditos do mapa: imaxes © Esri; relevo: Terrain Tiles (Mapzen, AWS Open Data).',
  en: 'Map credits: imagery © Esri; terrain: Terrain Tiles (Mapzen, AWS Open Data).',
} as const

export function creditosDelMapa(locale: string): string {
  return locale === 'gl' ? CREDITOS_DEL_MAPA.gl : locale === 'en' ? CREDITOS_DEL_MAPA.en : CREDITOS_DEL_MAPA.es
}

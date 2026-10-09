/**
 * Créditos del mapa. Las licencias de las fuentes obligan a citarlas; ya no hay botón «i» sobre el mapa:
 * se muestran, discretos, al pie de la pantalla de carga (`PantallaDeCarga`) y están en el README.
 *
 * El MDT05 del IGN es CC BY 4.0; los edificios, de la Dirección General del Catastro, se pueden usar citándola.
 * El satélite es Esri (5.54: la PNOA de 5.52 se veía borrosa en el iPhone) y Terrarium es el relieve fuera de la
 * zona preparada.
 */
export const CREDITOS_DEL_MAPA = {
  es: 'Créditos del mapa: relieve MDT05 © IGN (CC BY 4.0); edificios © Dirección General del Catastro; imágenes © Esri; relieve: Terrain Tiles (Mapzen, AWS Open Data).',
  gl: 'Créditos do mapa: relevo MDT05 © IGN (CC BY 4.0); edificios © Dirección General del Catastro; imaxes © Esri; relevo: Terrain Tiles (Mapzen, AWS Open Data).',
  en: 'Map credits: MDT05 terrain © IGN (CC BY 4.0); buildings © Dirección General del Catastro; imagery © Esri; terrain: Terrain Tiles (Mapzen, AWS Open Data).',
} as const

export function creditosDelMapa(locale: string): string {
  return locale === 'gl' ? CREDITOS_DEL_MAPA.gl : locale === 'en' ? CREDITOS_DEL_MAPA.en : CREDITOS_DEL_MAPA.es
}

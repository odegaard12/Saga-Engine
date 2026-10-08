/**
 * Créditos del mapa. Las licencias de las fuentes obligan a citarlas; ya no hay botón «i» sobre el mapa:
 * se muestran, discretos, al pie de la pantalla de carga (`PantallaDeCarga`) y están en el README.
 *
 * PNOA (IGN / Xunta) y el MDT05 del IGN son CC BY 4.0; los edificios, de la Dirección General del Catastro, se
 * pueden usar citándola. Esri (satélite a zoom bajo y fuera de España) y Terrarium (relieve fuera de la zona
 * preparada) siguen como respaldo.
 */
export const CREDITOS_DEL_MAPA = {
  es: 'Créditos del mapa: ortofoto PNOA © IGN / Xunta (CC BY 4.0); relieve MDT05 © IGN (CC BY 4.0); edificios © Dirección General del Catastro; imágenes © Esri; relieve: Terrain Tiles (Mapzen, AWS Open Data).',
  gl: 'Créditos do mapa: ortofoto PNOA © IGN / Xunta (CC BY 4.0); relevo MDT05 © IGN (CC BY 4.0); edificios © Dirección General del Catastro; imaxes © Esri; relevo: Terrain Tiles (Mapzen, AWS Open Data).',
  en: 'Map credits: PNOA orthophoto © IGN / Xunta (CC BY 4.0); MDT05 terrain © IGN (CC BY 4.0); buildings © Dirección General del Catastro; imagery © Esri; terrain: Terrain Tiles (Mapzen, AWS Open Data).',
} as const

export function creditosDelMapa(locale: string): string {
  return locale === 'gl' ? CREDITOS_DEL_MAPA.gl : locale === 'en' ? CREDITOS_DEL_MAPA.en : CREDITOS_DEL_MAPA.es
}

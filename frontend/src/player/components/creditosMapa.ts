/**
 * Créditos del mapa. Las licencias de las fuentes obligan a citarlas; ya no hay botón «i» sobre el mapa:
 * se muestran, discretos, al pie de la pantalla de carga (`PantallaDeCarga`) y están en el README.
 *
 * 5.55: como en 5.51.1, satélite Esri y relieve Terrarium. El MDT05 del IGN y los edificios del Catastro están
 * apagados (se veía borroso el fondo en el iPhone); si se vuelven a encender, hay que citarlos aquí otra vez.
 *
 * 5.59: las casas del Catastro volvieron en 5.57, así que se citan; y la previsión por horas (Open-Meteo, CC BY)
 * se cita aquí en vez de en la tarjeta del tiempo, que ya sólo dice «servido por MeteoCatoira».
 */
export const CREDITOS_DEL_MAPA = {
  es: 'Créditos: imágenes © Esri; relieve: Terrain Tiles (Mapzen, AWS Open Data); edificios © Dirección General del Catastro; previsión: Open-Meteo.',
  gl: 'Créditos: imaxes © Esri; relevo: Terrain Tiles (Mapzen, AWS Open Data); edificios © Dirección Xeral do Catastro; previsión: Open-Meteo.',
  en: 'Credits: imagery © Esri; terrain: Terrain Tiles (Mapzen, AWS Open Data); buildings © Dirección General del Catastro; forecast: Open-Meteo.',
} as const

export function creditosDelMapa(locale: string): string {
  return locale === 'gl' ? CREDITOS_DEL_MAPA.gl : locale === 'en' ? CREDITOS_DEL_MAPA.en : CREDITOS_DEL_MAPA.es
}

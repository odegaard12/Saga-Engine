import { MX_IDS, type MxId } from './catalogo'
import manifiesto from './manifiesto.json'

/**
 * Dónde están los modelos de los avatares 3D (personajes y animaciones de Mixamo,
 * descargados con la cuenta de Adobe del dueño).
 *
 * NO están en el repositorio: su licencia no permite redistribuirlos. Viven en la carpeta
 * `assets_privados/avatares/` del equipo del dueño, se copian a las Pis con
 * `scripts/desplegar_avatares.ps1` y el servidor los sirve en `/assets/avatares/<nombre>`
 * desde `SAGA_AVATAR_DIR`. Lo versionado es `manifiesto.json` (los NOMBRES, con la huella del
 * contenido; lo escribe `frontend/scripts/preparar-avatares.mjs`).
 *
 * Van en `player-precache.json` (ver `listaDePaquetesDelJugador` en vite.config.ts), de modo
 * que se bajan en la PANTALLA DE CARGA —parte «App»— y no de fondo mientras se juega, y el
 * service worker los guarda «caché primero». Son OPCIONALES: sin ellos la app sigue con el
 * retrato de la cara (o la inicial) en el mapa.
 */

export const DIRECTORIO_AVATARES = '/assets/avatares/'

type Manifiesto = {
  anims: string
  personajes: Partial<Record<MxId, string>>
  agarres: Partial<Record<MxId, string>>
  caras: Partial<Record<MxId, string>>
}
const M = manifiesto as Manifiesto

export const urlDeAnimaciones = () => DIRECTORIO_AVATARES + M.anims
export const urlDePersonaje = (id: MxId) => DIRECTORIO_AVATARES + (M.personajes[id] ?? `${id}.glb`)
export const urlDeAgarre = (id: MxId) => DIRECTORIO_AVATARES + (M.agarres[id] ?? `hold-${id}.glb`)
/** El retrato de la cara de un personaje (redondo en el mapa y en la tienda); `null` si no hay. */
export const urlDeCara = (id: MxId): string | null =>
  M.caras[id] ? DIRECTORIO_AVATARES + M.caras[id] : null

/** Todo lo que hay que tener en el móvil para ver avatares 3D (modelos, agarres y retratos). */
export function rutasDeAvatares(): string[] {
  return [
    urlDeAnimaciones(),
    ...MX_IDS.map((id) => urlDePersonaje(id)),
    ...MX_IDS.map((id) => urlDeAgarre(id)),
    ...MX_IDS.flatMap((id) => {
      const c = urlDeCara(id)
      return c ? [c] : []
    }),
  ]
}

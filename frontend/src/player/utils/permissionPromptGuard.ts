/**
 * Ventana de perdón para los avisos de permiso que pide la PROPIA app.
 *
 * Cámara, movimiento (`DeviceMotionEvent.requestPermission`) y geolocalización
 * pueden, en algunos navegadores móviles, quitarle el foco a la pestaña
 * mientras muestran su aviso nativo -o incluso disparar `visibilitychange`
 * si el aviso ocupa toda la pantalla-. Eso no es que el jugador se haya ido
 * a mirar algo: es la propia aplicación pidiendo permiso.
 *
 * Quien pide el permiso llama a `avisarPeticionDePermisoPropia()` justo antes
 * de `requestPermission()`/`getUserMedia()`/`getCurrentPosition()`. El
 * anti-trampas del cliente (`useAntiTrampas.ts`) comprueba
 * `fueDentroDeUnaPeticionDePermisoPropia()` antes de contar una salida: si el
 * blur/hidden llega dentro de esta ventana, se ignora entero.
 *
 * ⚠️ No distingue "el sistema tardó en resolver el permiso" de "el jugador
 * aprovechó el aviso para irse a otra app": ampliar la ventana more allá de lo
 * que tarda un diálogo de permiso real cambiaría eso. Por eso es corta.
 */

const VENTANA_PERDON_PERMISO_MS = 2500

let ultimaPeticionPropiaEnMs = 0

export function avisarPeticionDePermisoPropia() {
  ultimaPeticionPropiaEnMs = Date.now()
}

export function fueDentroDeUnaPeticionDePermisoPropia(): boolean {
  return Date.now() - ultimaPeticionPropiaEnMs < VENTANA_PERDON_PERMISO_MS
}

/**
 * Ajustes de la misión y jugadores: qué se manda y cómo se comprueba que el
 * servidor lo guardó.
 *
 * `saveAdminConfig` probaba tres formas de la petición y el servidor contestaba
 * «ok» a las dos equivocadas SIN guardar nada (informe A3); además, el panel
 * mandaba `0` cuando el zoom o el centro del mapa estaban vacíos (A18), y mandaba
 * la configuración ENTERA (jugadores incluidos) aunque solo se tocara un ajuste,
 * con lo que un panel con datos viejos pisaba lo que otra persona acababa de
 * guardar. Aquí queda todo en funciones puras: leer bien los números, mandar solo
 * lo tocado y comparar después con lo que el servidor devuelve.
 */

type Registro = Record<string, unknown>

/** Número de un campo de texto. Vacío o no numérico → null (NUNCA 0). */
export function parseNumberField(valor: unknown): number | null {
  const texto = String(valor ?? '')
    .trim()
    .replace(',', '.')
  if (!texto) return null
  const numero = Number(texto)
  return Number.isFinite(numero) ? numero : null
}

export type MapSettings = {
  center?: [number, number]
  zoom?: number
  error?: string
}

/**
 * Centro y zoom del mapa desde los campos de texto del panel.
 * - Todo vacío → no se manda nada (el servidor conserva lo que tiene).
 * - Algo escrito pero absurdo o incompleto → `error`, y no se guarda.
 */
export function readMapSettings(borrador: {
  map_center_lat?: string
  map_center_lon?: string
  map_zoom?: string
}): MapSettings {
  const lat = parseNumberField(borrador.map_center_lat)
  const lon = parseNumberField(borrador.map_center_lon)
  const zoom = parseNumberField(borrador.map_zoom)
  const salida: MapSettings = {}

  const hayLat = String(borrador.map_center_lat ?? '').trim() !== ''
  const hayLon = String(borrador.map_center_lon ?? '').trim() !== ''

  if (hayLat || hayLon) {
    if (lat === null || lon === null) {
      return { error: 'El centro del mapa necesita latitud Y longitud, con números.' }
    }
    if (lat < -90 || lat > 90) {
      return { error: 'La latitud del centro del mapa tiene que estar entre -90 y 90.' }
    }
    if (lon < -180 || lon > 180) {
      return { error: 'La longitud del centro del mapa tiene que estar entre -180 y 180.' }
    }
    salida.center = [lat, lon]
  }

  const hayZoom = String(borrador.map_zoom ?? '').trim() !== ''
  if (hayZoom) {
    if (zoom === null || zoom < 1 || zoom > 22) {
      return { error: 'El zoom del mapa tiene que ser un número entre 1 y 22.' }
    }
    // El servidor guarda un entero (`int(zoom)`): se manda ya redondeado para que
    // lo guardado y lo enviado coincidan al comparar.
    salida.zoom = Math.round(zoom)
  }

  return salida
}

const CLAVES_DE_TEXTO = [
  'site_name',
  'admin_title',
  'admin_subtitle',
  'login_title',
  'login_subtitle',
  'login_instructions',
  'prologue_title',
  'prologue_subtitle',
  'prologue_body',
  'prologue_image_url',
  'mapbox_token',
  'mapbox_style',
  'player_theme',
]

function distintoTexto(a: unknown, b: unknown) {
  return String(a ?? '').trim() !== String(b ?? '').trim()
}

/**
 * Compara lo que se mandó con lo que el servidor devuelve DESPUÉS de guardar.
 * Devuelve una frase por cada ajuste que no coincide (vacío = todo bien).
 * `publica` es la configuración pública releída: trae la fecha de salida, que la
 * vista de administración no incluye.
 */
export function verifyMissionSettingsSaved(
  enviado: Registro,
  visto: Registro | undefined,
  publica?: Registro | null
): string[] {
  const errores: string[] = []
  if (!visto) return ['el servidor no devolvió los ajustes para comprobarlos']

  for (const clave of CLAVES_DE_TEXTO) {
    if (clave in enviado && distintoTexto(enviado[clave], visto[clave])) {
      errores.push(clave)
    }
  }

  if (Array.isArray(enviado.map_center)) {
    const [lat, lon] = enviado.map_center as number[]
    const visto2 = Array.isArray(visto.map_center) ? (visto.map_center as number[]) : []
    if (Math.abs(Number(visto2[0]) - lat) > 1e-9 || Math.abs(Number(visto2[1]) - lon) > 1e-9) {
      errores.push('map_center')
    }
  }

  if (typeof enviado.map_zoom === 'number' && Number(visto.map_zoom) !== enviado.map_zoom) {
    errores.push('map_zoom')
  }

  if ('mission_launch_at' in enviado && publica) {
    const enviada = String(enviado.mission_launch_at || '').trim()
    const guardada = String(publica.mission_launch_at || '').trim()
    if (Boolean(enviada) !== Boolean(guardada) || (enviada && Date.parse(enviada) !== Date.parse(guardada))) {
      errores.push('mission_launch_at')
    }
  }

  return errores
}

function texto(valor: unknown) {
  return String(valor ?? '').trim()
}

/** Igual que el anterior, para la lista de jugadores. */
export function verifyPlayersSaved(
  enviados: Registro[],
  vistos: Registro[] | undefined
): string[] {
  if (!Array.isArray(vistos)) return ['el servidor no devolvió la lista de jugadores para comprobarla']

  const errores: string[] = []
  if (enviados.length !== vistos.length) {
    errores.push(`jugadores enviados ${enviados.length}, guardados ${vistos.length}`)
  }

  enviados.forEach((jugador, indice) => {
    const guardado = vistos[indice]
    if (!guardado) return
    const nombre = texto(jugador.display_name || jugador.id)

    if (texto(jugador.id).slice(0, 120) !== texto(guardado.id)) {
      errores.push(`ID de «${nombre}»`)
      return
    }
    if (texto(jugador.display_name).slice(0, 120) !== texto(guardado.display_name)) {
      errores.push(`nombre de «${nombre}»`)
    }
    if (texto(jugador.mode) !== texto(guardado.mode)) {
      errores.push(`modo de «${nombre}»`)
    }
    if (texto(jugador.avatar_url) !== texto(guardado.avatar_url)) {
      errores.push(`foto de «${nombre}»`)
    }
  })

  return errores
}

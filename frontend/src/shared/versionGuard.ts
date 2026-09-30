import { fetchConLimite } from '../player/offline/peticiones'
import { recargarCuandoSeaSeguro } from '../player/offline/recargaSegura'

/**
 * Que el móvil no se quede jugando con una versión vieja.
 *
 * La app se guarda entera en el teléfono para poder jugar sin cobertura, y eso
 * tiene una cara mala: al reabrirla sigue ejecutando el JavaScript que tenía
 * guardado. El service worker se actualiza por detrás, pero la pantalla que
 * está delante del jugador es la de antes hasta que se recargue de verdad.
 *
 * Ha pasado: se desplegaban arreglos, el servidor los servía, y en el móvil no
 * se veía ninguno. Y peor que no ver un arreglo es jugar con una versión que ya
 * no se corresponde con lo que el servidor espera.
 *
 * Aquí se compara la versión con la que se compiló esta pantalla con la que
 * dice el servidor. Si no coinciden, se prepara la versión nueva Y SE CAMBIA a
 * ella, una vez.
 *
 * ⚠️ Antes se BORRABA todo el armazón (`saga-player-shell`, con la copia de la
 * lista de paquetes) y se recargaba a ciegas. Con la red a medias la recarga
 * llegaba sin nada que servir y salía «SAGA offline shell is not cached yet»:
 * un jugador con la aplicación funcionando se quedaba sin ella. Ahora no se borra
 * nada: primero se baja la página nueva y los paquetes con los que arranca, se
 * comprueba que son lo que dicen ser, se guarda la página nueva y SÓLO ENTONCES
 * se recarga. Si algo falla no se cambia nada y se reintenta al siguiente
 * arranque. Los ficheros llevan su hash en el nombre, así que la versión vieja y
 * la nueva conviven en la caché sin pisarse.
 */

const CLAVE = 'saga:version-recargada'

/** Igual que en public/sw.js y pwaShell.ts. */
const CACHE_DEL_SHELL = 'saga-player-shell'

/** Los ficheros con los que arranca una página: sus `<script>` y sus hojas de estilo. */
export function rutasDeArranque(html: string): string[] {
  const rutas = new Set<string>()
  const patron = /(?:src|href)\s*=\s*["'](\/assets\/[^"'?#]+\.(?:mjs|js|css))(?:\?[^"']*)?["']/gi
  for (const encontrado of html.matchAll(patron)) rutas.add(encontrado[1])
  return Array.from(rutas)
}

// Un paquete o una hoja de estilo NO puede ser la página de salida del servidor
// (un 200 con HTML para una ruta que no existe). El tipo exacto varía según el servidor.
function tipoCuadra(_ruta: string, tipo: string): boolean {
  return !tipo.toLowerCase().includes('text/html')
}

/** Los ficheros que esta página tiene cargados ahora mismo. */
function rutasEnUso(): Set<string> {
  const enUso = new Set<string>()
  try {
    document.querySelectorAll<HTMLScriptElement>('script[src]').forEach((s) => {
      enUso.add(new URL(s.src, window.location.origin).pathname)
    })
    document.querySelectorAll<HTMLLinkElement>('link[href]').forEach((l) => {
      enUso.add(new URL(l.href, window.location.origin).pathname)
    })
  } catch {
    // Sin DOM que mirar: se considera que no hay nada en uso.
  }
  return enUso
}

/**
 * Baja la página nueva y sus paquetes de arranque, y SÓLO si todo está bien la
 * deja como la que sirve el service worker sin red.
 *
 * Devuelve `hayNovedad`: si la página nueva trae ficheros que esta no tiene
 * cargados. Sin novedad, recargar no cambiaría nada (el servidor dice otra
 * versión pero sirve lo mismo, por ejemplo una caché de por medio).
 */
export async function prepararVersionNueva(): Promise<
  { listo: false } | { listo: true; hayNovedad: boolean }
> {
  if (typeof caches === 'undefined') return { listo: false }

  try {
    const pagina = await fetchConLimite('/', { cache: 'reload', credentials: 'same-origin' }, 8000)
    if (!pagina.ok) return { listo: false }
    if (!(pagina.headers.get('content-type') || '').toLowerCase().includes('text/html')) {
      return { listo: false }
    }

    const html = await pagina.clone().text()
    const arranque = rutasDeArranque(html)
    // Una página sin ningún paquete no es la aplicación: no se pone en su lugar.
    if (arranque.length === 0) return { listo: false }

    const cache = await caches.open(CACHE_DEL_SHELL)

    for (const ruta of arranque) {
      if (await cache.match(ruta, { ignoreSearch: true })) continue

      const respuesta = await fetchConLimite(ruta, { cache: 'reload', credentials: 'same-origin' }, 20000)
      if (!respuesta.ok || !tipoCuadra(ruta, respuesta.headers.get('content-type') || '')) {
        return { listo: false }
      }
      await cache.put(ruta, respuesta.clone())
    }

    // El punto de cambio, lo ÚLTIMO: hasta aquí no se ha tocado lo que sirve la caché.
    await cache.put('/', pagina.clone())
    const aqui = window.location.pathname
    if (aqui && aqui !== '/') await cache.put(aqui, pagina.clone())

    // La misma página guardada con otra query (`?user=…`, que es la que tiene la
    // URL tras abrir la app) se cambia también. Con `ignoreSearch` sin red gana
    // la primera que encuentra, y una variante vieja sirve una página cuyos
    // trozos no están: «Failed to fetch dynamically imported module».
    if (aqui) {
      for (const clave of await cache.keys()) {
        const url = new URL(clave.url)
        if (url.origin === window.location.origin && url.pathname === aqui && url.search) {
          await cache.put(clave, pagina.clone())
        }
      }
    }

    const enUso = rutasEnUso()
    return { listo: true, hayNovedad: arranque.some((ruta) => !enUso.has(ruta)) }
  } catch {
    // Sin red a medias, sin sitio...: no se cambia nada.
    return { listo: false }
  }
}

export async function vixiarVersion(): Promise<void> {
  if (typeof window === 'undefined') return

  // Sin conexión no hay nada que comparar, y no se toca nada.
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return

  const miVersion = String(__SAGA_VERSION__ || '').trim()
  if (!miVersion) return

  let doServidor = ''

  try {
    const resposta = await fetchConLimite('/api/version', { cache: 'no-store' }, 5000)
    if (!resposta.ok) return
    const datos = (await resposta.json()) as { version?: string }
    doServidor = String(datos.version || '').trim()
  } catch {
    // Servidor caído o red a medias: se sigue con lo que hay, que para eso
    // está pensada la app.
    return
  }

  if (!doServidor || doServidor === miVersion) return

  // Una sola recarga por versión: si algo fuese mal, esto no puede convertirse
  // en un bucle que deje el teléfono dando vueltas en mitad del monte.
  let xaRecargada = ''
  try {
    xaRecargada = String(window.sessionStorage.getItem(CLAVE) || '')
  } catch {
    xaRecargada = ''
  }

  if (xaRecargada === doServidor) return

  // Se prepara la versión nueva SIN tocar la vieja. Si no sale, no se marca nada
  // y se reintenta la próxima vez que se abra.
  const preparada = await prepararVersionNueva()
  if (!preparada.listo) return

  try {
    window.sessionStorage.setItem(CLAVE, doServidor)
  } catch {
    /* modo privado: se recargará otra vez, tampoco pasa nada */
  }

  try {
    const rexistros = await navigator.serviceWorker?.getRegistrations?.()
    await Promise.all((rexistros || []).map((rexistro) => rexistro.update()))
  } catch {
    /* nada */
  }

  // Sin novedad en los ficheros no hay nada que cambiar: sólo se apunta.
  if (!preparada.hayNovedad) return

  // Y se recarga cuando no estorbe: aquí no se corta un minijuego a nadie.
  recargarCuandoSeaSeguro({ soloOculta: false })
}

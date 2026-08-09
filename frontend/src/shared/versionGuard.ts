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
 * dice el servidor. Si no coinciden, se tira lo guardado y se recarga UNA vez.
 */

const CLAVE = 'saga:version-recargada'

export async function vixiarVersion(): Promise<void> {
  if (typeof window === 'undefined') return

  // Sin conexión no hay nada que comparar, y no se toca nada.
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return

  const miVersion = String(__SAGA_VERSION__ || '').trim()
  if (!miVersion) return

  let doServidor = ''

  try {
    const resposta = await fetch('/api/version', { cache: 'no-store' })
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

  try {
    window.sessionStorage.setItem(CLAVE, doServidor)
  } catch {
    /* modo privado: se recargará otra vez, tampoco pasa nada */
  }

  // El mapa y las misiones guardadas NO se tocan: sólo el armazón de la app,
  // que es lo que lleva el código viejo.
  try {
    const nomes = await caches.keys()
    await Promise.all(
      nomes.filter((nome) => nome.includes('player-shell')).map((nome) => caches.delete(nome))
    )
  } catch {
    /* sin caches: adelante igual */
  }

  try {
    const rexistros = await navigator.serviceWorker?.getRegistrations?.()
    await Promise.all((rexistros || []).map((rexistro) => rexistro.update()))
  } catch {
    /* nada */
  }

  window.location.reload()
}

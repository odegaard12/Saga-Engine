/**
 * "Pruébalo tú mismo, a que veas los saltos."
 *
 * No abre un navegador ni monta React: ejecuta la MISMA función que se
 * mandó a producción (`deslizarMarcadores`, copiada tal cual de
 * MapSurface.tsx -no reimplementada a mano-, con `requestAnimationFrame`
 * sustituido por su equivalente de Node) contra dos puntos GPS reales,
 * cronometrado de verdad. La pregunta no es "¿el código parece correcto?"
 * -eso ya se dio por bueno tres veces con este mismo tipo de bug y seguía
 * fallando-, es "¿el marcador pasa por puntos intermedios, o salta?".
 */

// --- requestAnimationFrame de Node: mismo contrato, sin navegador. ---
let rafId = 0
const rafCallbacks = new Map()
function requestAnimationFrame(cb) {
  const id = ++rafId
  rafCallbacks.set(id, setTimeout(() => cb(performance.now()), 16))
  return id
}
function cancelAnimationFrame(id) {
  const t = rafCallbacks.get(id)
  if (t) clearTimeout(t)
  rafCallbacks.delete(id)
}

// --- Copiado literal de frontend/src/player/components/MapSurface.tsx ---
// (getDistanceMeters, easeOutCubic, deslizarMarcadores, las constantes).
// Si el fichero fuente cambia esta función, esta copia hay que traerla de
// nuevo: es a propósito, para no fingir que se prueba algo que ya no existe.

function getDistanceMeters(a, b) {
  const toRad = (deg) => (deg * Math.PI) / 180
  const earthRadius = 6371000
  const dLat = toRad(b.lat - a.lat)
  const dLon = toRad(b.lon - a.lon)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const sinLat = Math.sin(dLat / 2)
  const sinLon = Math.sin(dLon / 2)
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon
  return 2 * earthRadius * Math.asin(Math.sqrt(h))
}

const DURACION_DESLIZAR_MARCADOR_MS = 450
const SALTO_MAXIMO_DESLIZABLE_M = 60

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3)
}

function deslizarMarcadores(animRef, elementos, hasta) {
  if (animRef.current !== null) {
    cancelAnimationFrame(animRef.current)
    animRef.current = null
  }
  if (!elementos.length) return

  const desde = elementos.map((el) => el.getLatLng())
  const distancia = Math.max(
    ...desde.map((punto) =>
      getDistanceMeters({ lat: punto.lat, lon: punto.lng }, { lat: hasta.lat, lon: hasta.lng })
    )
  )

  if (distancia <= 0.3 || distancia > SALTO_MAXIMO_DESLIZABLE_M) {
    elementos.forEach((el) => el.setLatLng(hasta))
    return
  }

  const inicio = performance.now()

  const paso = (ahora) => {
    const t = Math.min(1, (ahora - inicio) / DURACION_DESLIZAR_MARCADOR_MS)
    const suavizado = easeOutCubic(t)
    elementos.forEach((el, i) => {
      const origen = desde[i]
      el.setLatLng({
        lat: origen.lat + (hasta.lat - origen.lat) * suavizado,
        lng: origen.lng + (hasta.lng - origen.lng) * suavizado,
      })
    })
    if (t < 1) {
      animRef.current = requestAnimationFrame(paso)
    } else {
      animRef.current = null
    }
  }
  animRef.current = requestAnimationFrame(paso)
}

// --- El experimento ---

function marcadorFalso(inicial) {
  const historial = [{ ...inicial, t: 0 }]
  let actual = { ...inicial }
  const t0 = performance.now()
  return {
    getLatLng: () => actual,
    setLatLng: (ll) => {
      actual = ll
      historial.push({ ...ll, t: Math.round(performance.now() - t0) })
    },
    historial,
  }
}

function esperar(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

export async function run() {
  const fallos = []
  const medidas = {}
  const anotar = (nombre, ok, detalle) => {
    medidas[nombre] = detalle
    if (!ok) fallos.push(`${nombre}: ${detalle}`)
  }

  // Caso 1: paso normal andando -unos 8 metros entre dos fijas de GPS,
  // separación típica caminando a paso ligero con el GPS actualizando cada
  // pocos segundos-. Esto es justo lo que se veía saltar.
  {
    const origen = { lat: 42.363961111572415, lng: -8.67579893825645 }
    const destino = { lat: 42.36403, lng: -8.67579893825645 } // ~8.1m al norte
    const marcador = marcadorFalso(origen)
    const animRef = { current: null }

    deslizarMarcadores(animRef, [marcador], destino)
    await esperar(600)

    const pasos = marcador.historial.length - 1
    const intermedios = marcador.historial.filter(
      (p) => p.lat !== origen.lat && p.lat !== destino.lat
    ).length
    const llego = marcador.historial[marcador.historial.length - 1]
    const llegoBien =
      Math.abs(llego.lat - destino.lat) < 1e-9 && Math.abs(llego.lng - destino.lng) < 1e-9

    anotar(
      'paso_normal.desliza',
      pasos >= 5 && intermedios >= 5,
      `${pasos} llamadas a setLatLng, ${intermedios} con valores intermedios (no origen ni destino exactos)`
    )
    anotar('paso_normal.llegaAlDestino', llegoBien, llegoBien ? 'sí, con precisión de coma flotante' : 'NO llegó al punto exacto')
    anotar(
      'paso_normal.duracion',
      llego.t >= 400 && llego.t <= 550,
      `el último paso llegó a los ${llego.t}ms (se espera ~450ms)`
    )

    // La prueba real de "no salta": el primer paso posterior al inicio no
    // puede estar ya en destino -eso SERÍA el salto reportado-.
    const primerPaso = marcador.historial[1]
    const primerPasoEsSalto =
      primerPaso && primerPaso.lat === destino.lat && primerPaso.lng === destino.lng
    anotar(
      'paso_normal.primerFotogramaNoEsElSalto',
      !primerPasoEsSalto,
      primerPasoEsSalto
        ? 'BUG: el primer fotograma ya está en el destino -esto es el salto original-'
        : `el primer fotograma está a medio camino (lat ${primerPaso?.lat})`
    )
  }

  // Caso 2: salto grande -reabrir la app en otro sitio, 300m-. Tiene que
  // PLANTARSE, no deslizarse: deslizar despacio 300m del mapa confunde más
  // que un salto limpio.
  {
    const origen = { lat: 42.363961111572415, lng: -8.67579893825645 }
    const destino = { lat: 42.3667, lng: -8.67579893825645 } // ~300m al norte
    const marcador = marcadorFalso(origen)
    const animRef = { current: null }

    deslizarMarcadores(animRef, [marcador], destino)
    await esperar(600)

    anotar(
      'salto_grande.sePlantaEnUnPaso',
      marcador.historial.length === 2,
      `${marcador.historial.length - 1} llamadas a setLatLng (se espera 1: instantáneo)`
    )
  }

  // Caso 3: ruido de GPS quieto -menos de 30cm entre dos fijas, típico
  // estando parado-. No debería animar nada: sería movimiento fantasma.
  {
    const origen = { lat: 42.363961111572415, lng: -8.67579893825645 }
    const destino = { lat: 42.363961111572415 + 0.0000005, lng: -8.67579893825645 } // ~5.5cm
    const marcador = marcadorFalso(origen)
    const animRef = { current: null }

    deslizarMarcadores(animRef, [marcador], destino)
    await esperar(100)

    anotar(
      'ruido_quieto.noAnima',
      marcador.historial.length === 2,
      `${marcador.historial.length - 1} llamadas a setLatLng (se espera 1: plantado, sin animar ruido)`
    )
  }

  return { fallos, medidas }
}

// `run.mjs verificar-deslizamiento-gps` (o `node scenarios/....mjs` directo)
// lo lanzan igual: sin navegador ni servidor que arrancar, esto corre en
// milisegundos.
const esLlamadaDirecta = process.argv[1] && process.argv[1].endsWith('verificar-deslizamiento-gps.mjs')
if (esLlamadaDirecta) {
  const resultado = await run()
  console.log(JSON.stringify(resultado, null, 2))
  if (resultado.fallos.length) process.exit(1)
}

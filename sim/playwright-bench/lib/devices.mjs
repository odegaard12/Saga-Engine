// Perfiles de dispositivo y de red para el arnés Playwright.
//
// Por qué Chromium para los dos (iPhone incluido): el throttling de red de
// verdad -latencia, ancho de banda, offline duro- se controla por CDP
// (`Network.emulateNetworkConditions`), y CDP solo existe en Chromium.
// Playwright también trae WebKit (Safari de verdad), más fiel para un
// iPhone, pero SIN throttling por CDP -solo serviría para "buena". Para la
// pregunta que nos importa ahora -cómo se comporta bajo mala cobertura o un
// corte- Chromium con el viewport/UA de iPhone es el compromiso correcto.
// Queda anotado como mejora futura: un segundo modo "fidelidad de Safari"
// sin throttling, para bugs específicos de WebKit.

import { devices } from 'playwright'

export const PERFILES_DISPOSITIVO = {
  iphone: {
    ...devices['iPhone 14'],
    // Import warning: devices['iPhone 14'] ya trae isMobile/hasTouch/viewport.
  },
  android: {
    ...devices['Pixel 7'],
  },
}

export function elegirDispositivo(perfil, indice) {
  if (perfil === 'mixed') {
    perfil = indice % 2 === 0 ? 'iphone' : 'android'
  }
  return PERFILES_DISPOSITIVO[perfil] || PERFILES_DISPOSITIVO.android
}

// Mismos nombres y mismas franjas que backend/app/runtime/simulation_bench.py
// (PERFILES_RED) — un "corte" ahí es una franja de la RUTA sin cobertura; aquí,
// al ser un navegador de verdad en tiempo real, es una VENTANA DE TIEMPO: el
// contexto se pone offline entre `cortarA` y `cortarB` segundos desde que
// arranca el escenario, y vuelve a la condición base después.
export const PERFILES_RED = {
  buena: { latencyMs: 40, downloadKbps: 8000, uploadKbps: 4000, corte: null },
  mala: { latencyMs: 900, downloadKbps: 400, uploadKbps: 200, corte: null },
  inestable: { latencyMs: 1800, downloadKbps: 200, uploadKbps: 100, corte: null },
  sin_cobertura: { latencyMs: 40, downloadKbps: 8000, uploadKbps: 4000, corte: [0, Infinity] },
}

/** Aplica un perfil de red por CDP. Solo funciona en Chromium. */
export async function aplicarPerfilRed(page, perfil) {
  const session = await page.context().newCDPSession(page)
  await session.send('Network.enable')
  await ponerCondicionBase(session, perfil)
  return session
}

async function ponerCondicionBase(session, perfil) {
  await session.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: perfil.latencyMs,
    downloadThroughput: (perfil.downloadKbps * 1024) / 8,
    uploadThroughput: (perfil.uploadKbps * 1024) / 8,
  })
}

/** Corta la cobertura -offline de verdad, no solo lento- durante `ms`. */
export async function cortarCobertura(session, ms) {
  await session.send('Network.emulateNetworkConditions', {
    offline: true,
    latency: 0,
    downloadThroughput: 0,
    uploadThroughput: 0,
  })
  await new Promise((resolve) => setTimeout(resolve, ms))
}

export async function restaurarRed(session, perfil) {
  await ponerCondicionBase(session, perfil)
}

// Ritmo de paseo humano: mismo valor y mismo motivo que PASO_HUMANO_MPS en
// backend/app/runtime/simulation_bench.py (1.3 m/s, ~4.7 km/h, la media
// citada para adultos en llano). Antes de esto, cada escenario ponía la
// geolocalización del contexto UNA vez al crearlo -un salto instantáneo al
// nodo, nunca un paseo- así que nada que dependiera de leer varios
// heartbeats en tránsito (o de la posición en vivo del mapa del admin
// mientras alguien "camina") se probaba de verdad.
export const PASO_HUMANO_MPS = 1.3

/** Haversine, en metros. Misma fórmula que simulation_bench.distancia_metros. */
export function distanciaMetros(lat1, lon1, lat2, lon2) {
  const radioTierraM = 6_371_000
  const toRad = (x) => (x * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return radioTierraM * 2 * Math.asin(Math.min(1, Math.sqrt(a)))
}

/**
 * Mueve la geolocalización del contexto de `desde` a `hasta` en varios pasos
 * intermedios -no un salto-, al ritmo de un paseo humano comprimido por
 * `factorVelocidad` (25x por defecto, igual que el banco de Python: un
 * paseo real de minutos se queda en segundos de prueba). `pasosPorSegundo`
 * fija cuántas posiciones intermedias se mandan por segundo DE PRUEBA -más
 * pasos, movimiento más suave en el mapa en vivo, más llamadas a
 * setGeolocation-.
 *
 * Devuelve la duración real que ha tardado (ms), por si el escenario quiere
 * usarla para calcular cuándo mirar el siguiente latido.
 */
export async function andarHasta(
  context,
  desde,
  hasta,
  { factorVelocidad = 25, pasosPorSegundo = 2 } = {}
) {
  const distancia = distanciaMetros(desde.lat, desde.lon, hasta.lat, hasta.lon)
  const duracionRealS = distancia / PASO_HUMANO_MPS
  const duracionPruebaMs = Math.max(0, (duracionRealS / factorVelocidad) * 1000)

  const pasos = Math.max(1, Math.round((duracionPruebaMs / 1000) * pasosPorSegundo))
  const intervaloMs = duracionPruebaMs / pasos

  const t0 = Date.now()
  for (let i = 1; i <= pasos; i += 1) {
    const fraccion = i / pasos
    await context.setGeolocation({
      latitude: desde.lat + (hasta.lat - desde.lat) * fraccion,
      longitude: desde.lon + (hasta.lon - desde.lon) * fraccion,
    })
    if (i < pasos) {
      await new Promise((resolve) => setTimeout(resolve, intervaloMs))
    }
  }

  return Date.now() - t0
}

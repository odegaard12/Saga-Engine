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

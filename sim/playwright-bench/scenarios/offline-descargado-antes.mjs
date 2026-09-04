// Escenario: "descargado antes" — la forma realista en que alguien juega sin
// cobertura. Nadie instala la PWA en mitad del monte sin señal: se prepara
// EN CASA, con wifi, y luego sale. Lo que nunca se había probado de verdad es
// justo la costura: ¿el móvil, cerrado y reabierto YA sin ninguna cobertura,
// vuelve a arrancar desde su caché, o se queda en blanco? ¿se puede jugar un
// nodo entero -código de respaldo incluido- sin que salga ni una petición de
// red? ¿y al recuperar cobertura, sincroniza solo lo que quedó pendiente?
//
// Un móvil de verdad (Playwright + CDP), no httpx: aquí lo que importa es la
// app tal cual la ve el jugador -el service worker, la caché del navegador,
// el evento 'online'-, no solo que el servidor acepte la petición.

import { chromium } from 'playwright'
import { SagaClient } from '../lib/sagaClient.mjs'
import { PERFILES_DISPOSITIVO, PERFILES_RED, aplicarPerfilRed, andarHasta } from '../lib/devices.mjs'

const BASE_URL = process.env.SAGA_BASE_URL || 'http://127.0.0.1:8791'
const ADMIN_PASS = process.env.SAGA_ADMIN_PASS
const HEADLESS = process.env.HEADLESS !== '0'
const OUT_DIR = new URL('../out/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')

function log(...args) {
  console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...args)
}

async function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function coordsDe(stage) {
  const loc = stage.location && typeof stage.location === 'object' ? stage.location : stage
  if (typeof loc.lat !== 'number' || typeof loc.lon !== 'number') return null
  return { lat: loc.lat, lon: loc.lon }
}

/** El código real del nodo -para el "código de respaldo", no para el minijuego
 * en sí: automatizar cada uno de los 10 minijuegos por UI es otro proyecto.
 * Un punto de control (sin success.conditions con kind "answer") se abre con
 * "OK", igual que hace el propio cliente (PlayerApp.tsx::proceedToInteraction). */
function codigoDe(stage) {
  const condiciones = stage?.success?.conditions
  if (Array.isArray(condiciones)) {
    const respuesta = condiciones.find((c) => c && c.kind === 'answer' && c.value)
    if (respuesta) return String(respuesta.value)
  }
  return 'OK'
}

export async function run() {
  if (!ADMIN_PASS) {
    throw new Error('Falta SAGA_ADMIN_PASS en el entorno.')
  }

  const client = new SagaClient(BASE_URL)
  log('Entrando como admin en', BASE_URL)
  await client.login(ADMIN_PASS)

  log('Leyendo la ruta real...')
  const stages = await client.getStages()
  const conCoords = stages.filter((s) => coordsDe(s))
  if (conCoords.length < 2) {
    throw new Error(
      `Hacen falta al menos 2 nodos con coordenadas para andar entre ellos; hay ${conCoords.length}.`
    )
  }
  const nodoA = conCoords[0]
  const nodoB = conCoords[1]
  const coordsA = coordsDe(nodoA)
  const coordsB = coordsDe(nodoB)
  const codigoA = codigoDe(nodoA)
  log(`Nodo A: "${nodoA.title}" (${coordsA.lat}, ${coordsA.lon}), código de respaldo "${codigoA}"`)
  log(`Nodo B: "${nodoB.title}" (${coordsB.lat}, ${coordsB.lon}) — hasta aquí se anda offline`)

  log('Abriendo la puerta para 1 jugador de mentira (SIM_01)...')
  const sesion = await client.startBrowserSession(1)
  const jugador = sesion.players[0]

  const browser = await chromium.launch({ headless: HEADLESS })
  const resultado = { nodoA: nodoA.title, nodoB: nodoB.title, pasos: [] }

  try {
    const context = await browser.newContext({
      ...PERFILES_DISPOSITIVO.iphone,
      geolocation: coordsA,
      permissions: ['geolocation'],
    })
    await context.addCookies([{ name: sesion.cookie_name, value: jugador.token, url: BASE_URL }])
    const page = await context.newPage()
    const cdp = await aplicarPerfilRed(page, PERFILES_RED.buena)

    page.on('pageerror', (err) => log('[pageerror]', err.message))

    let peticionesDeRed = 0
    page.on('request', () => {
      peticionesDeRed += 1
    })

    log('1/6 — Con cobertura buena: abriendo la app y descargando la misión...')
    await page.goto(`${BASE_URL}/player/${jugador.name}`, { waitUntil: 'load' })
    await esperar(3000)
    await page.screenshot({ path: `${OUT_DIR}offline-01-antes-de-descargar.png` })

    const botonDescargar = page.locator('button', { hasText: 'Descargar' }).first()
    if (await botonDescargar.isVisible().catch(() => false)) {
      await botonDescargar.click()
      // 'Descargando…' -> 'Descargar' desaparece del panel cuando ya está.
      await page
        .locator('button', { hasText: 'Descargar' })
        .first()
        .waitFor({ state: 'hidden', timeout: 20000 })
        .catch(() => log('  (el botón de descarga no desapareció solo en 20s, se sigue igual)'))
    } else {
      log('  (el panel de descarga no apareció — puede que este perfil ya tenga la misión)')
    }
    await page.screenshot({ path: `${OUT_DIR}offline-02-descargada.png` })
    resultado.pasos.push({ etapa: 'descargada_online', peticiones_hasta_aqui: peticionesDeRed })

    log('2/6 — Cortando la cobertura DEL TODO, sin fecha de vuelta...')
    await cdp.send('Network.emulateNetworkConditions', {
      offline: true,
      latency: 0,
      downloadThroughput: 0,
      uploadThroughput: 0,
    })

    const peticionesAntesDeRecargar = peticionesDeRed
    log('3/6 — Recargando la página offline: ¿vuelve la app, o pantalla en blanco?')
    await page.reload({ waitUntil: 'load' }).catch((err) => {
      throw new Error(`la página NO recargó offline: ${err.message}`)
    })
    await esperar(3000)
    await page.screenshot({ path: `${OUT_DIR}offline-03-recargada-sin-cobertura.png` })

    const textoTrasRecargar = await page.evaluate(() => document.body.innerText || '')
    const cargoAlgo = textoTrasRecargar.trim().length > 20
    resultado.pasos.push({
      etapa: 'recargada_offline',
      cargo_contenido: cargoAlgo,
      peticiones_durante_recarga: peticionesDeRed - peticionesAntesDeRecargar,
      muestra_dom: textoTrasRecargar.slice(0, 120),
    })
    log(
      `  DOM tras recargar (${cargoAlgo ? 'con contenido' : 'VACÍO'}):`,
      JSON.stringify(textoTrasRecargar.slice(0, 120))
    )
    if (!cargoAlgo) {
      throw new Error('La app quedó en blanco al recargar sin cobertura — el shell no se sirvió desde caché.')
    }

    log('4/6 — Andando de verdad hasta el nodo B, todavía sin cobertura...')
    const anduvoMs = await andarHasta(context, coordsA, coordsB, { factorVelocidad: 20 })
    log(`  Paseo simulado en ${Math.round(anduvoMs)} ms de prueba.`)
    await page.screenshot({ path: `${OUT_DIR}offline-04-tras-andar.png` })

    log('5/6 — Intentando completar el nodo A con el código de respaldo, sin red...')
    const peticionesAntesDeJugar = peticionesDeRed
    const botonPrincipal = page.locator('[data-saga-player-hud="bottom"] button').first()
    await botonPrincipal.click({ timeout: 5000 }).catch(() => log('  (botón principal no encontrado o ya dentro del nodo)'))
    await esperar(800)

    // La historia del nodo, si toca verla, tapa el reto hasta que se cierra.
    const botonContinuarHistoria = page.locator('button', { hasText: /Continuar|Rexistrar/i }).first()
    if (await botonContinuarHistoria.isVisible().catch(() => false)) {
      await botonContinuarHistoria.click()
      await esperar(500)
    }

    const botonCodigoRespaldo = page.locator('button', { hasText: '¿Atascado?' }).first()
    let nodoCompletadoOffline = false
    if (await botonCodigoRespaldo.isVisible().catch(() => false)) {
      await botonCodigoRespaldo.click()
      const input = page.locator('input[placeholder="Escribe el código..."]').first()
      await input.fill(codigoA)
      await input.press('Enter')
      await esperar(1200)
      nodoCompletadoOffline = true
    } else {
      log('  (no apareció el código de respaldo — puede que el nodo sea un punto de control, ya resuelto solo)')
    }
    await page.screenshot({ path: `${OUT_DIR}offline-05-nodo-intentado-offline.png` })
    resultado.pasos.push({
      etapa: 'nodo_intentado_offline',
      uso_codigo_de_respaldo: nodoCompletadoOffline,
      peticiones_durante_el_intento: peticionesDeRed - peticionesAntesDeJugar,
    })
    log(
      `  Peticiones de red mientras se jugaba offline: ${peticionesDeRed - peticionesAntesDeJugar} (debería ser 0)`
    )

    log('6/6 — Recuperando cobertura y esperando la sincronización automática...')
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: PERFILES_RED.buena.latencyMs,
      downloadThroughput: (PERFILES_RED.buena.downloadKbps * 1024) / 8,
      uploadThroughput: (PERFILES_RED.buena.uploadKbps * 1024) / 8,
    })
    await esperar(6000)
    await page.screenshot({ path: `${OUT_DIR}offline-06-tras-recuperar-cobertura.png` })

    await context.close()

    const estado = await fetch(`${BASE_URL}/api/state/${jugador.name}`).then((r) => r.json())
    resultado.nivel_final_en_servidor = estado.level
    log('Nivel final que ve el SERVIDOR tras sincronizar:', estado.level)
  } finally {
    await browser.close()
    await client.stopBrowserSession()
    await client.cleanupTrace()
  }

  return resultado
}

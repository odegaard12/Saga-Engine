// Escenario: ¿de verdad funciona "Relevo de equipo" cuando uno de los dos
// jugadores se queda sin cobertura justo al llegar al punto de encuentro?
//
// Dos móviles de verdad (Playwright, no httpx) convergen en el mismo nodo
// team_relay. SIM_01 tiene cobertura buena todo el rato. A SIM_02 se le
// corta la cobertura -offline de verdad, por CDP- durante una ventana justo
// cuando llega. Se comprueba lo que ve CADA UNO en su propia pantalla -no
// el servidor: si el mecanismo de latido no llega, el jugador no lo sabe
// aunque el otro esté al lado-.
//
// Esto responde de forma medida, no adivinada, a la pregunta que se
// contestó a ojo en plan-de-mejora.md 0.4/0.6: "necesita cobertura de los
// dos a la vez" — aquí se ve el efecto real en pantalla, con capturas.

import { chromium } from 'playwright'
import { SagaClient } from '../lib/sagaClient.mjs'
import { PERFILES_DISPOSITIVO, PERFILES_RED, aplicarPerfilRed, cortarCobertura, restaurarRed } from '../lib/devices.mjs'

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

async function estadoRelevo(page) {
  // "Compañeros aquí: N / M" — lo que de verdad ve el jugador, no lo que
  // sabe el servidor.
  try {
    const texto = await page.locator('text=/Compañeros aquí/').first().textContent({ timeout: 2000 })
    const match = /(\d+)\s*\/\s*(\d+)/.exec(texto || '')
    return match ? { activos: Number(match[1]), necesarios: Number(match[2]), crudo: texto.trim() } : { crudo: texto?.trim() }
  } catch {
    return null
  }
}

export async function run() {
  if (!ADMIN_PASS) {
    throw new Error('Falta SAGA_ADMIN_PASS en el entorno.')
  }

  const client = new SagaClient(BASE_URL)
  log('Entrando como admin en', BASE_URL)
  await client.login(ADMIN_PASS)

  log('Buscando el nodo team_relay en la misión real...')
  const stages = await client.getStages()
  const nodo = stages.find((s) => s.config && s.config.game_id === 'team_relay')
  if (!nodo) {
    throw new Error(
      'No hay ningún nodo team_relay en la misión activa. Sembrar uno antes de correr este escenario ' +
        '(ver sim/playwright-bench/README.md).'
    )
  }
  log(`Nodo encontrado: "${nodo.title}" en (${nodo.lat}, ${nodo.lon}), radio ${nodo.radius} m`)

  log('Abriendo la puerta para 2 jugadores de mentira (SIM_01, SIM_02)...')
  const sesion = await client.startBrowserSession(2)
  const [jugadorA, jugadorB] = sesion.players

  const browser = await chromium.launch({ headless: HEADLESS })
  const resultado = { nodo, pasos: [] }

  try {
    const contextos = await Promise.all(
      [jugadorA, jugadorB].map(async (jugador, indice) => {
        const dispositivo = indice === 0 ? PERFILES_DISPOSITIVO.iphone : PERFILES_DISPOSITIVO.android
        const context = await browser.newContext({
          ...dispositivo,
          geolocation: { latitude: nodo.lat, longitude: nodo.lon },
          permissions: ['geolocation'],
        })
        await context.addCookies([
          { name: sesion.cookie_name, value: jugador.token, url: BASE_URL },
        ])
        const page = await context.newPage()
        const cdp = await aplicarPerfilRed(page, PERFILES_RED.buena)
        return { jugador, context, page, cdp, dispositivo: indice === 0 ? 'iPhone' : 'Android' }
      })
    )

    log('Navegando los dos móviles a su pantalla de jugador...')
    // No 'networkidle': el latido (/api/heartbeat) sondea cada pocos segundos
    // sin parar, así que la red nunca queda "quieta" y el timeout salta
    // siempre. 'load' + una espera fija para que la PWA arranque de verdad.
    await Promise.all(
      contextos.map(({ page, jugador }) => page.goto(`${BASE_URL}/player/${jugador.name}`, { waitUntil: 'load' }))
    )
    await esperar(5000) // primer latido + primera resolución de nodo

    for (const { page, jugador, dispositivo } of contextos) {
      await page.screenshot({ path: `${OUT_DIR}${jugador.name}-01-llegada.png` })
    }
    resultado.pasos.push({ etapa: 'llegada', A: await estadoRelevo(contextos[0].page), B: await estadoRelevo(contextos[1].page) })
    log('Al llegar (los dos con cobertura buena):', JSON.stringify(resultado.pasos[0]))

    log('Cortando la cobertura de SIM_02 (Android) 15 s...')
    const corteB = cortarCobertura(contextos[1].cdp, 15000)
    await esperar(6000)

    for (const { page, jugador } of contextos) {
      await page.screenshot({ path: `${OUT_DIR}${jugador.name}-02-durante-corte.png` })
    }
    resultado.pasos.push({
      etapa: 'durante_corte_de_B',
      A: await estadoRelevo(contextos[0].page),
      B: await estadoRelevo(contextos[1].page),
    })
    log('Durante el corte de B:', JSON.stringify(resultado.pasos[1]))

    await corteB
    await restaurarRed(contextos[1].cdp, PERFILES_RED.buena)
    log('Cobertura de SIM_02 restaurada. Esperando al siguiente latido...')
    await esperar(7000)

    for (const { page, jugador } of contextos) {
      await page.screenshot({ path: `${OUT_DIR}${jugador.name}-03-tras-recuperar.png` })
    }
    resultado.pasos.push({
      etapa: 'tras_recuperar_B',
      A: await estadoRelevo(contextos[0].page),
      B: await estadoRelevo(contextos[1].page),
    })
    log('Tras recuperar cobertura:', JSON.stringify(resultado.pasos[2]))

    for (const { context } of contextos) {
      await context.close()
    }
  } finally {
    await browser.close()
    await client.stopBrowserSession()
    await client.cleanupTrace()
  }

  return resultado
}

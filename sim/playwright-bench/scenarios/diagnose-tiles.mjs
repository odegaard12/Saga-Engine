// Diagnóstico puntual: qué está pasando de verdad en la precarga de
// teselas -no adivinar desde una captura, leer los números reales del DOM
// y de la caché del navegador.

import { chromium } from 'playwright'
import { SagaClient } from '../lib/sagaClient.mjs'
import { PERFILES_DISPOSITIVO } from '../lib/devices.mjs'

const BASE_URL = process.env.SAGA_BASE_URL || 'http://127.0.0.1:8791'
const ADMIN_PASS = process.env.SAGA_ADMIN_PASS

export async function run() {
  const client = new SagaClient(BASE_URL)
  await client.login(ADMIN_PASS)
  const sesion = await client.startBrowserSession(1)
  const jugador = sesion.players[0]

  const browser = await chromium.launch({ headless: true })
  try {
    const context = await browser.newContext({ ...PERFILES_DISPOSITIVO.iphone })
    await context.addCookies([{ name: sesion.cookie_name, value: jugador.token, url: BASE_URL }])
    const page = await context.newPage()

    page.on('console', (msg) => {
      console.log(`[console.${msg.type()}]`, msg.text())
    })
    page.on('pageerror', (err) => {
      console.log('[pageerror]', err.message)
    })

    const requests = { total: 0, tiles: 0, tileOk: 0, tileFail: 0 }
    page.on('response', (res) => {
      const url = res.url()
      requests.total += 1
      if (url.includes('/map-tiles/')) {
        requests.tiles += 1
        if (res.ok()) requests.tileOk += 1
        else requests.tileFail += 1
      }
    })

    await page.goto(`${BASE_URL}/player/${jugador.name}`, { waitUntil: 'load' })

    for (let i = 0; i < 3; i++) {
      await new Promise((r) => setTimeout(r, 10000))
      const texto = await page.evaluate(() => document.body.innerText)
      console.log(`\n--- t=${(i + 1) * 15}s ---`)
      console.log('DOM texto:', JSON.stringify(texto.slice(0, 200)))
      console.log('peticiones:', JSON.stringify(requests))
    }
  } finally {
    await browser.close()
    await client.stopBrowserSession()
    await client.cleanupTrace()
  }
}

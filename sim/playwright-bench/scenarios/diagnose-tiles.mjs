// Diagnóstico puntual: qué está pasando de verdad en la precarga de
// teselas -no adivinar desde una captura, leer los números reales del DOM
// y de la caché del navegador.
//
// Encontró el bug real de plan-de-mejora.md §1.1 (arreglado en su momento
// con `key={pctFino}` en SplashScreen.tsx): el porcentaje se congelaba en
// el DOM aunque React seguía calculando el valor correcto por dentro. Se
// deja aquí -sondeando cada 3 s- porque es la forma de comprobar, en
// segundos y no adivinando, que la pantalla de carga avanza de verdad.

import { chromium } from 'playwright'
import { SagaClient } from '../lib/sagaClient.mjs'
import { PERFILES_DISPOSITIVO } from '../lib/devices.mjs'

const BASE_URL = process.env.SAGA_BASE_URL || 'http://127.0.0.1:8791'
const ADMIN_PASS = process.env.SAGA_ADMIN_PASS
const VUELTAS = Number(process.env.VUELTAS || 8)
const INTERVALO_MS = Number(process.env.INTERVALO_MS || 3000)

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

    page.on('pageerror', (err) => console.log('[pageerror]', err.message))

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

    const lecturas = []
    for (let i = 0; i < VUELTAS; i++) {
      await new Promise((r) => setTimeout(r, INTERVALO_MS))
      const texto = await page.evaluate(() => document.body.innerText)
      const t = Math.round(((i + 1) * INTERVALO_MS) / 1000)
      lecturas.push({ t, dom: texto.slice(0, 60) })
      console.log(`t=${t}s  DOM: ${JSON.stringify(texto.slice(0, 60))}  peticiones: ${JSON.stringify(requests)}`)
    }

    return { lecturas, requests }
  } finally {
    await browser.close()
    await client.stopBrowserSession()
    await client.cleanupTrace()
  }
}

// Utilidad rápida: un jugador, una captura. No es un escenario de prueba de
// verdad -no comprueba nada-, es para verificar visualmente algo puntual
// (aquí: la pantalla de carga en el tema real) sin montar todo el lío de
// dos jugadores conviviendo.

import { chromium } from 'playwright'
import { SagaClient } from '../lib/sagaClient.mjs'
import { PERFILES_DISPOSITIVO } from '../lib/devices.mjs'

const BASE_URL = process.env.SAGA_BASE_URL || 'http://127.0.0.1:8791'
const ADMIN_PASS = process.env.SAGA_ADMIN_PASS
const OUT_DIR = new URL('../out/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const ESPERA_MS = Number(process.env.ESPERA_MS || 1500)
const NOMBRE_SALIDA = process.env.NOMBRE_SALIDA || 'solo'

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
    await page.goto(`${BASE_URL}/player/${jugador.name}`, { waitUntil: 'load' })
    await new Promise((r) => setTimeout(r, ESPERA_MS))
    const path = `${OUT_DIR}${NOMBRE_SALIDA}.png`
    await page.screenshot({ path })
    console.log('Captura guardada en', path)
  } finally {
    await browser.close()
    await client.stopBrowserSession()
    await client.cleanupTrace()
  }
}

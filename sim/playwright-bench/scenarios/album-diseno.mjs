/**
 * Album del diseño: una captura de CADA pantalla del jugador, en un movil real.
 *
 * No es una prueba que pase o falle: es la evidencia visual de como esta la
 * interfaz ahora mismo. Se lanza despues de tocar diseño para poder mirar las
 * nueve pantallas de golpe en vez de ir abriendolas a mano una a una -que es
 * como se colaron un boton de 0x0 y una fila de telemetria durante semanas-.
 */
import { chromium } from 'playwright'
import { SagaClient } from '../lib/sagaClient.mjs'

const BASE_URL = process.env.SAGA_BASE_URL
const OUT = process.env.SHOT_DIR || 'out'

export async function run() {
  const client = new SagaClient(BASE_URL)
  await client.login(process.env.SAGA_ADMIN_PASS)
  const sesion = await client.startBrowserSession(1)
  const jugador = sesion.players[0]
  const browser = await chromium.launch({ headless: process.env.HEADLESS !== '0' })
  const problemas = []

  try {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      geolocation: { latitude: 42.363961111572415, longitude: -8.67579893825645 },
      permissions: ['geolocation'],
    })
    await ctx.addCookies([{ name: sesion.cookie_name, value: jugador.token, url: BASE_URL }])
    const page = await ctx.newPage()
    page.on('pageerror', (e) => problemas.push(`JS: ${e}`))
    page.on('console', (m) => { if (m.type() === 'error') problemas.push(`consola: ${m.text().slice(0, 120)}`) })

    const foto = async (n) => { await page.screenshot({ path: `${OUT}/album-${n}.png` }) }
    const esperar = (ms) => new Promise((r) => setTimeout(r, ms))

    await page.goto(`${BASE_URL}/player/${jugador.name}`, { waitUntil: 'load' })
    await esperar(5000)
    await foto('01-carga')

    for (let i = 0; i < 60; i++) {
      await esperar(2000)
      const t = await page.evaluate(() => document.body.innerText)
      if (!t.includes('Preparando') && !t.includes('Calculando') && !t.includes('Misión')) break
    }
    await esperar(900)
    await foto('02-prologo')

    const cerrarPrologo = page.locator('button', { hasText: /comezar a travesía/i }).first()
    if (await cerrarPrologo.count()) { await cerrarPrologo.click().catch(() => {}); await esperar(800) }
    await foto('03-antes-de-salir')

    const seguir = page.locator('button', { hasText: /seguir sen iso/i }).first()
    if (await seguir.count()) { await seguir.click().catch(() => {}); await esperar(900) }
    await foto('04-principal')

    const abrir = async (texto) => {
      const b = page.locator('button', { hasText: texto }).first()
      if (await b.count()) { await b.click({ force: true }).catch(() => {}); await esperar(1000) }
    }
    const cerrarHoja = async () => {
      await page.evaluate(() => {
        const h = document.querySelector('.saga-hoja')
        const b = Array.from(h?.querySelectorAll('button') || []).find((e) => (e.textContent || '').trim() === '×')
        b?.click()
      }).catch(() => {})
      await esperar(800)
    }

    await abrir(/^Mochila$/)
    await foto('05-mochila-guia')
    for (const [pestana, nombre] of [[/^Obxectos$|^Objetos$/i, '06-mochila-obxectos'], [/^Mesa$/i, '07-mochila-mesa']]) {
      const b = page.locator('button', { hasText: pestana }).first()
      if (await b.count()) { await b.click({ force: true }).catch(() => {}); await esperar(800) }
      await foto(nombre)
    }
    await cerrarHoja()

    await abrir(/Ferramentas|Herramientas/)
    await foto('08-ferramentas')
    await cerrarHoja()

    const trofeo = page.locator('[aria-label="Trofeo"]').first()
    if (await trofeo.count()) { await trofeo.click({ force: true }).catch(() => {}); await esperar(1100) }
    await foto('09-clasificacion')

    await ctx.close()
  } finally {
    await browser.close()
    await client.stopBrowserSession()
    await client.cleanupTrace()
  }

  return { problemas }
}

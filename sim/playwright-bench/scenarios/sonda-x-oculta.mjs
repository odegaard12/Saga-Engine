/**
 * Sonda de un rato: ¿QUE boton se esta escondiendo, y donde vive?
 *
 * La auditoria dice "un boton con display:none en linea" en las cuatro hojas,
 * pero no dice cual de todos ni de quien cuelga, y ese es justo el dato que
 * decide si es un fallo o el barrido haciendo su trabajo. Antes de tocar
 * nada, se pregunta.
 */
import { chromium } from 'playwright'
import { SagaClient } from '../lib/sagaClient.mjs'

const BASE_URL = process.env.SAGA_BASE_URL
const esperar = (ms) => new Promise((r) => setTimeout(r, ms))

export async function run() {
  const client = new SagaClient(BASE_URL)
  await client.login(process.env.SAGA_ADMIN_PASS)
  const sesion = await client.startBrowserSession(1)
  const jugador = sesion.players[0]
  const browser = await chromium.launch({ headless: process.env.HEADLESS !== '0' })

  try {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      geolocation: { latitude: 42.363961111572415, longitude: -8.67579893825645 },
      permissions: ['geolocation'],
    })
    await ctx.addCookies([{ name: sesion.cookie_name, value: jugador.token, url: BASE_URL }])
    const page = await ctx.newPage()
    await page.goto(`${BASE_URL}/player/${jugador.name}`, { waitUntil: 'load' })

    for (let i = 0; i < 60; i++) {
      await esperar(2000)
      const t = await page.evaluate(() => document.body.innerText)
      if (!t.includes('Preparando') && !t.includes('Calculando')) break
    }
    await esperar(1200)

    for (const texto of [/comezar a travesía|comenzar/i, /seguir sen iso|seguir sin/i]) {
      const b = page.locator('button', { hasText: texto }).first()
      if (await b.count()) {
        await b.click().catch(() => {})
        await esperar(900)
      }
    }

    await page.locator('button', { hasText: /^Mochila$/ }).first().click({ force: true }).catch(() => {})
    await esperar(1200)

    const informe = await page.evaluate(() => {
      const cadena = (el) => {
        const partes = []
        let actual = el
        for (let i = 0; i < 6 && actual; i++) {
          const clase = actual.className && typeof actual.className === 'string' ? `.${actual.className.split(' ')[0]}` : ''
          const marca = actual.getAttribute?.('data-saga-anim')
          partes.push(actual.tagName.toLowerCase() + clase + (marca ? `[${marca}]` : ''))
          actual = actual.parentElement
        }
        return partes.join(' < ')
      }

      const hoja = document.querySelector('.saga-hoja')
      return {
        hojasEnElDom: document.querySelectorAll('.saga-hoja').length,
        ocultos: Array.from(document.querySelectorAll('button'))
          .filter((b) => b.style.display === 'none')
          .map((b) => ({
            texto: (b.textContent || '').trim().slice(0, 24),
            etiqueta: b.getAttribute('aria-label'),
            dentroDeLaHoja: hoja ? hoja.contains(b) : null,
            marcadoPorElBarrido: b.dataset.sagaPanelHidden === '1',
            donde: cadena(b),
          })),
      }
    })

    await ctx.close()
    return informe
  } finally {
    await browser.close()
    await client.stopBrowserSession()
    await client.cleanupTrace()
  }
}

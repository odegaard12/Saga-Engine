/**
 * Auditoría de interfaz: busca fallos MEDIBLES, no opinables.
 *
 * Por qué existe
 * --------------
 * Los peores fallos de interfaz de este proyecto no se vieron mirando la
 * pantalla: se vieron preguntándole al DOM. Tres reales, todos de la misma
 * tanda:
 *
 *   - El botón de cerrar de Ferramentas existía y medía 0x0 con
 *     `display: none`. Ninguna regla de CSS lo tocaba: lo escondía un barrido
 *     del propio código que oculta botones cuyo texto sea un símbolo, y ese
 *     botón dice "×". La hoja se escondía su propia salida.
 *   - La fila de iconos se colocaba con una cuenta desde el suelo usando el
 *     alto SUPUESTO de la tarjeta de abajo. Medido: 12px de aire un día, 16px
 *     después de "arreglarlo". Con un texto de ayuda largo, se solapaban.
 *   - El botón de centrar se ocultaba con `opacity: 0` pero seguía ocupando
 *     sus 38px, así que las otras cuatro burbujas quedaban descuadradas.
 *
 * Los tres son comprobables con una regla y un número. Esto los comprueba en
 * cada pantalla, y así no hace falta acordarse de mirar.
 *
 * Lo que NO hace: juzgar si algo es bonito. Eso no se automatiza.
 */
import { chromium } from 'playwright'
import { SagaClient } from '../lib/sagaClient.mjs'

const BASE_URL = process.env.SAGA_BASE_URL

/** Lo mínimo que Apple y Google piden para que un dedo acierte. */
const TOQUE_MINIMO_PX = 44

/** Por debajo de esto no se lee al sol, andando, con el móvil en la mano. */
const TEXTO_MINIMO_PX = 11

/**
 * Recoge los fallos de la pantalla que hay ahora mismo en el navegador.
 *
 * Va todo dentro de un solo `evaluate` a propósito: medir desde fuera obliga a
 * un viaje por elemento, y con varios cientos de nodos eso tarda más que la
 * propia prueba.
 */
async function auditar(page, pantalla) {
  return page.evaluate(
    ({ pantalla, TOQUE_MINIMO_PX, TEXTO_MINIMO_PX }) => {
      const fallos = []
      const visible = (el, cs) =>
        cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05

      const dentroDePantalla = (r) =>
        r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth

      // --- 1. Botones que existen pero no se pueden usar ---------------------
      document.querySelectorAll('button, [role="button"], a[href]').forEach((el) => {
        const cs = getComputedStyle(el)
        const r = el.getBoundingClientRect()
        const etiqueta =
          (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30) || '(sin texto)'

        // Montado pero con tamaño cero: el caso del "×" que se escondía solo.
        if (cs.display === 'none' && el.style.display === 'none') {
          fallos.push({
            pantalla,
            tipo: 'boton-oculto-por-codigo',
            detalle: `"${etiqueta}" está en el DOM con display:none puesto en línea`,
          })
          return
        }

        if (!visible(el, cs) || !dentroDePantalla(r)) return

        if (r.width < 1 || r.height < 1) {
          fallos.push({ pantalla, tipo: 'boton-de-cero', detalle: `"${etiqueta}" mide ${Math.round(r.width)}x${Math.round(r.height)}` })
          return
        }

        // Área de toque. Se avisa, no se falla: hay iconos de 38px que son una
        // decisión tomada, y el aviso sirve para revisarlos, no para prohibirlos.
        if (r.width < TOQUE_MINIMO_PX || r.height < TOQUE_MINIMO_PX) {
          fallos.push({
            pantalla,
            tipo: 'aviso-area-de-toque',
            detalle: `"${etiqueta}" mide ${Math.round(r.width)}x${Math.round(r.height)}, por debajo de ${TOQUE_MINIMO_PX}`,
          })
        }
      })

      // --- 2. Texto que no se lee en el monte --------------------------------
      document.querySelectorAll('div, span, p, strong, button, a').forEach((el) => {
        const propio = Array.from(el.childNodes).some(
          (n) => n.nodeType === 3 && (n.textContent || '').trim().length > 2
        )
        if (!propio) return
        const cs = getComputedStyle(el)
        if (!visible(el, cs)) return
        const r = el.getBoundingClientRect()
        if (!dentroDePantalla(r)) return

        const px = parseFloat(cs.fontSize)
        if (!px || px >= TEXTO_MINIMO_PX) return

        /**
         * Las ETIQUETAS en versalitas no cuentan.
         *
         * "ANTES DE SALIR", "OPERACIÓN SEN CONEXIÓN", "GUÍA PASO A PASO": son
         * rótulos de sección, van pequeños y espaciados a propósito, y nadie
         * los lee andando -dicen de qué va el bloque de debajo, que sí es
         * grande-. Si la prueba los canta a todos, salta veinte veces por
         * pantalla y se deja de leer, que es peor que no tenerla.
         *
         * Lo que sí cuenta es el texto que hay que LEER: frases normales.
         */
        const texto = (el.textContent || '').trim()
        const esRotulo =
          parseFloat(cs.letterSpacing) > 0.5 ||
          cs.textTransform === 'uppercase' ||
          (texto === texto.toUpperCase() && texto.length < 26)
        if (esRotulo) return

        fallos.push({
          pantalla,
          tipo: 'texto-pequeño',
          detalle: `${px}px — "${texto.slice(0, 34)}"`,
        })
      })

      // --- 3. Piezas fijas de la pantalla que se pisan entre sí --------------
      const piezas = [
        ['barra superior', '[data-saga-player-shell="top"]'],
        ['fila de iconos', '.saga-hud-quick'],
        ['barra inferior', '[data-saga-player-hud="bottom"]'],
      ]
        .map(([nombre, sel]) => {
          const el = document.querySelector(sel)
          if (!el) return null
          const cs = getComputedStyle(el)
          if (!visible(el, cs)) return null
          return { nombre, r: el.getBoundingClientRect() }
        })
        .filter(Boolean)

      for (let i = 0; i < piezas.length; i++) {
        for (let j = i + 1; j < piezas.length; j++) {
          const a = piezas[i]
          const b = piezas[j]
          const solape =
            Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top) > 0 &&
            Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left) > 0
          if (solape) {
            fallos.push({
              pantalla,
              tipo: 'solape',
              detalle: `"${a.nombre}" y "${b.nombre}" se pisan`,
            })
          }
        }
      }

      // --- 4. Nada debe salirse por los lados --------------------------------
      if (document.documentElement.scrollWidth > window.innerWidth + 1) {
        fallos.push({
          pantalla,
          tipo: 'desborde-horizontal',
          detalle: `la página mide ${document.documentElement.scrollWidth}px de ancho en una pantalla de ${window.innerWidth}px`,
        })
      }

      return fallos
    },
    { pantalla, TOQUE_MINIMO_PX, TEXTO_MINIMO_PX }
  )
}

export async function run() {
  const client = new SagaClient(BASE_URL)
  await client.login(process.env.SAGA_ADMIN_PASS)
  const sesion = await client.startBrowserSession(1)
  const jugador = sesion.players[0]
  const browser = await chromium.launch({ headless: process.env.HEADLESS !== '0' })

  const fallos = []
  const erroresJs = []

  try {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      geolocation: { latitude: 42.363961111572415, longitude: -8.67579893825645 },
      permissions: ['geolocation'],
    })
    await ctx.addCookies([{ name: sesion.cookie_name, value: jugador.token, url: BASE_URL }])
    const page = await ctx.newPage()
    page.on('pageerror', (e) => erroresJs.push(String(e).slice(0, 160)))
    page.on('console', (m) => {
      if (m.type() === 'error') erroresJs.push(`consola: ${m.text().slice(0, 140)}`)
    })

    const esperar = (ms) => new Promise((r) => setTimeout(r, ms))

    await page.goto(`${BASE_URL}/player/${jugador.name}`, { waitUntil: 'load' })
    await esperar(4000)
    fallos.push(...(await auditar(page, 'carga')))

    for (let i = 0; i < 60; i++) {
      await esperar(2000)
      const t = await page.evaluate(() => document.body.innerText)
      if (!t.includes('Preparando') && !t.includes('Calculando') && !t.includes('Misión')) break
    }
    await esperar(1000)
    fallos.push(...(await auditar(page, 'prólogo')))

    const cerrarPrologo = page.locator('button', { hasText: /comezar a travesía/i }).first()
    if (await cerrarPrologo.count()) {
      await cerrarPrologo.click().catch(() => {})
      await esperar(900)
    }
    fallos.push(...(await auditar(page, 'antes de salir')))

    const seguir = page.locator('button', { hasText: /seguir sen iso/i }).first()
    if (await seguir.count()) {
      await seguir.click().catch(() => {})
      await esperar(1000)
    }
    fallos.push(...(await auditar(page, 'principal')))

    const abrir = async (texto) => {
      const b = page.locator('button', { hasText: texto }).first()
      if (await b.count()) {
        await b.click({ force: true }).catch(() => {})
        await esperar(1000)
      }
    }
    /**
     * Cierra la hoja abierta por su botón, y si no puede DICE POR QUÉ.
     *
     * No busca el texto "×" literal: la etiqueta la traduce el idioma en
     * caliente ("Pechar mochila" en galego) y el glifo podría cambiar. Busca
     * lo que de verdad define a ese botón —estar dentro de la hoja y llevar
     * una etiqueta de cerrar—, y comprueba que además se pueda pulsar, que es
     * lo que fallaba: existía, pero medía 0x0.
     */
    const cerrarHoja = async () => {
      const diag = await page.evaluate(() => {
        const hoja = document.querySelector('.saga-hoja')
        if (!hoja) return { ok: false, motivo: 'no hay hoja abierta' }

        const botones = Array.from(hoja.querySelectorAll('button'))
        const candidato = botones.find((b) => {
          const etiqueta = (b.getAttribute('aria-label') || '').toLowerCase()
          if (/cerrar|pechar|close/.test(etiqueta)) return true
          const texto = (b.textContent || '').trim()
          return texto.length === 1 && !/[\p{L}\p{N}]/u.test(texto)
        })

        if (!candidato) {
          return {
            ok: false,
            motivo: 'la hoja no tiene botón de cerrar',
            botones: botones.map((b) => (b.textContent || '').trim().slice(0, 18)),
          }
        }

        const r = candidato.getBoundingClientRect()
        const cs = getComputedStyle(candidato)
        if (r.width < 1 || r.height < 1 || cs.display === 'none') {
          return {
            ok: false,
            motivo: `el botón de cerrar existe pero no se puede pulsar (${Math.round(r.width)}x${Math.round(r.height)}, display:${cs.display})`,
          }
        }

        candidato.click()
        return { ok: true }
      })

      await esperar(900)

      if (diag.ok) {
        const sigueAbierta = await page.evaluate(() => Boolean(document.querySelector('.saga-hoja')))
        if (sigueAbierta) return { ok: false, motivo: 'se pulsó cerrar y la hoja sigue abierta' }
      }
      return diag
    }

    await abrir(/^Mochila$/)
    fallos.push(...(await auditar(page, 'mochila · guía')))
    for (const [pestana, nombre] of [
      [/^Obxectos$|^Objetos$/i, 'mochila · obxectos'],
      [/^Mesa$/i, 'mochila · mesa'],
    ]) {
      const b = page.locator('button', { hasText: pestana }).first()
      if (await b.count()) {
        await b.click({ force: true }).catch(() => {})
        await esperar(800)
      }
      fallos.push(...(await auditar(page, nombre)))
    }

    // Que la hoja se pueda CERRAR con su botón es parte de la prueba: el "×"
    // llegó a estar en el DOM sin poder pulsarse, y sin esto nadie se entera.
    const cierreMochila = await cerrarHoja()
    if (!cierreMochila.ok) {
      fallos.push({ pantalla: 'mochila', tipo: 'sin-salida', detalle: cierreMochila.motivo })
    }

    await abrir(/Ferramentas|Herramientas/)
    fallos.push(...(await auditar(page, 'ferramentas')))
    const cierreTools = await cerrarHoja()
    if (!cierreTools.ok) {
      fallos.push({ pantalla: 'ferramentas', tipo: 'sin-salida', detalle: cierreTools.motivo })
    }

    const trofeo = page.locator('[aria-label="Trofeo"]').first()
    if (await trofeo.count()) {
      await trofeo.click({ force: true }).catch(() => {})
      await esperar(1200)
    }
    fallos.push(...(await auditar(page, 'clasificación')))

    await ctx.close()
  } finally {
    await browser.close()
    await client.stopBrowserSession()
    await client.cleanupTrace()
  }

  const graves = fallos.filter((f) => !f.tipo.startsWith('aviso-'))
  const avisos = fallos.filter((f) => f.tipo.startsWith('aviso-'))

  const porTipo = {}
  for (const f of graves) porTipo[f.tipo] = (porTipo[f.tipo] || 0) + 1

  return {
    veredicto: graves.length === 0 && erroresJs.length === 0 ? 'LIMPIO' : 'HAY FALLOS',
    erroresJs: erroresJs.length ? [...new Set(erroresJs)] : 'ninguno',
    graves: graves.length,
    porTipo,
    detalle: graves.slice(0, 30),
    avisos: avisos.length,
    detalleAvisos: [...new Map(avisos.map((a) => [a.detalle, a])).values()].slice(0, 15),
  }
}

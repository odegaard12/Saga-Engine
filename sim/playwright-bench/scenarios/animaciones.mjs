/**
 * ¿Se MUEVE de verdad, o sólo lo pone el CSS?
 *
 * Nace de un fallo que se dio por arreglado tres veces seguidas: "la pantalla
 * de carga y 'antes de salir' salen de golpe, en un salto". Las tres veces
 * había una `transition` escrita en el estilo, las tres veces se miró el
 * código y parecía correcto, y las tres veces seguía saltando. Mirar el CSS
 * no sirve: una transición sin cambio de valor no transiciona, una animación
 * de fotogramas clave le gana a la `transform` de al lado, y un efecto
 * pasivo deja pintar un fotograma desnudo antes de montar el velo. Nada de
 * eso se ve leyendo; todo se ve midiendo.
 *
 * Así que esto graba la opacidad y la posición reales -las calculadas por el
 * navegador- en CADA fotograma, y después pregunta lo único que importa:
 * ¿hubo valores intermedios? Un movimiento que va de 0 a 1 sin pasar por en
 * medio es un corte, diga lo que diga la hoja de estilos.
 */
import { chromium } from 'playwright'
import { SagaClient } from '../lib/sagaClient.mjs'

const BASE_URL = process.env.SAGA_BASE_URL
const OUT = process.env.SHOT_DIR || 'out'

/** Fotogramas intermedios que exigimos para dar un movimiento por visto. */
const MINIMO_INTERMEDIOS = 4

/**
 * El grabador vive en la página y arranca ANTES de que cargue nada: el
 * relevo de la pantalla de carga ocurre una sola vez y no avisa.
 */
function grabador() {
  const TOPE = 2400
  const estado = { frames: [], siguiente: 0 }
  window.__sagaAnim = estado

  const objetivos = {
    splash: '[data-saga-anim="splash"]',
    velo: '[data-saga-anim="velo"]',
    prepCapa: '[data-saga-anim="prep-capa"]',
    prepTarjeta: '[data-saga-anim="prep-tarjeta"]',
    hoja: '.saga-hoja',
    hojaFondo: '[data-saga-anim="hoja-fondo"]',
  }

  const leer = (el) => {
    const cs = getComputedStyle(el)
    let y = 0
    let escala = 1
    try {
      const m = new DOMMatrixReadOnly(cs.transform === 'none' ? '' : cs.transform)
      y = Math.round(m.m42 * 10) / 10
      escala = Math.round(m.m11 * 1000) / 1000
    } catch {
      /* transform raro: nos quedamos con la opacidad, que es lo que más pesa */
    }
    return {
      o: Math.round(Number(cs.opacity) * 1000) / 1000,
      y,
      escala,
      alto: Math.round(el.getBoundingClientRect().height),
    }
  }

  const bucle = (t) => {
    const f = { i: estado.siguiente++, t: Math.round(t) }
    for (const clave of Object.keys(objetivos)) {
      const el = document.querySelector(objetivos[clave])
      f[clave] = el ? leer(el) : null
    }
    estado.frames.push(f)
    if (estado.frames.length > TOPE) estado.frames.shift()
    requestAnimationFrame(bucle)
  }
  requestAnimationFrame(bucle)
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms))

async function indiceActual(page) {
  return page.evaluate(() => window.__sagaAnim?.siguiente ?? 0)
}

async function framesDesde(page, desde) {
  return page.evaluate((d) => (window.__sagaAnim?.frames || []).filter((f) => f.i >= d), desde)
}

/**
 * Cuenta los fotogramas en los que un valor está A MEDIO CAMINO.
 *
 * Es la única pregunta honesta: da igual cuánto dure la transición o qué
 * curva tenga, si el elemento nunca se ve a medias es que no se ha movido,
 * ha aparecido.
 */
function intermedios(frames, clave, campo, minimo, maximo) {
  let cuenta = 0
  for (const f of frames) {
    const v = f[clave]
    if (!v) continue
    const valor = v[campo]
    if (valor > minimo && valor < maximo) cuenta += 1
  }
  return cuenta
}

function presente(frames, clave) {
  return frames.filter((f) => f[clave]).length
}

export async function run() {
  const client = new SagaClient(BASE_URL)
  await client.login(process.env.SAGA_ADMIN_PASS)
  const sesion = await client.startBrowserSession(1)
  const jugador = sesion.players[0]
  const browser = await chromium.launch({ headless: process.env.HEADLESS !== '0' })

  const fallos = []
  const medidas = {}
  const anotar = (nombre, ok, detalle) => {
    medidas[nombre] = detalle
    if (!ok) fallos.push(`${nombre}: ${detalle}`)
  }

  try {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      geolocation: { latitude: 42.363961111572415, longitude: -8.67579893825645 },
      permissions: ['geolocation'],
    })
    await ctx.addCookies([{ name: sesion.cookie_name, value: jugador.token, url: BASE_URL }])
    await ctx.addInitScript(grabador)
    const page = await ctx.newPage()

    await page.goto(`${BASE_URL}/player/${jugador.name}`, { waitUntil: 'load' })

    // ---------------------------------------------------------------
    // 1. El relevo: pantalla de carga -> juego.
    // ---------------------------------------------------------------
    // Se espera a que el velo haya nacido Y MUERTO, que es cuando el relevo
    // está entero en la grabación.
    let vioVelo = false
    for (let i = 0; i < 140; i++) {
      const hay = await page.evaluate(() => Boolean(document.querySelector('[data-saga-anim="velo"]')))
      if (hay) vioVelo = true
      if (vioVelo && !hay) break
      await esperar(500)
    }

    const relevo = await framesDesde(page, 0)

    if (!vioVelo) {
      anotar('relevo.velo', false, 'el velo de salida de la carga no llegó a existir')
    } else {
      const fundido = intermedios(relevo, 'velo', 'o', 0.05, 0.95)
      anotar(
        'relevo.fundido',
        fundido >= MINIMO_INTERMEDIOS,
        `${fundido} fotogramas con el velo a media opacidad (mínimo ${MINIMO_INTERMEDIOS})`
      )

      /**
       * El fotograma desnudo.
       *
       * Entre que la pantalla de carga se va y el velo se pone, no puede
       * haber NI UNO en el que no haya ninguna de las dos cosas: ahí es donde
       * asomaba el juego a pelo, y ése era el salto que se veía.
       */
      const primerVelo = relevo.findIndex((f) => f.velo)
      const ultimoSplashSolo = relevo.findLastIndex((f, i) => f.splash && !f.velo && i < primerVelo)
      let desnudos = 0
      if (primerVelo > 0 && ultimoSplashSolo >= 0) {
        for (let i = ultimoSplashSolo + 1; i < primerVelo; i++) {
          if (!relevo[i].splash && !relevo[i].velo) desnudos += 1
        }
      }
      anotar('relevo.fotogramasDesnudos', desnudos === 0, `${desnudos} fotogramas sin carga ni velo`)

      // Y el contenido de la carga tiene que irse CON el velo, no antes: si
      // el logo y el porcentaje desaparecen de golpe da igual que el fondo se
      // funda despacio, porque el ojo está mirando al centro.
      const splashDentroDelVelo = relevo.some((f) => f.splash && f.velo)
      anotar(
        'relevo.contenidoSeFunde',
        splashDentroDelVelo,
        splashDentroDelVelo
          ? 'la pantalla de carga sigue dentro del velo mientras se apaga'
          : 'el contenido de la carga desaparece antes que el fondo'
      )
    }

    await page.screenshot({ path: `${OUT}/anim-01-tras-relevo.png` })

    // ---------------------------------------------------------------
    // 2. Prólogo fuera, y "antes de salir" entra.
    // ---------------------------------------------------------------
    const prologo = page.locator('button', { hasText: /comezar a travesía|comenzar/i }).first()
    const desdePrep = await indiceActual(page)
    if (await prologo.count()) {
      await prologo.click().catch(() => {})
    }
    await esperar(1400)
    const framesPrep = await framesDesde(page, desdePrep)

    if (presente(framesPrep, 'prepCapa') === 0) {
      medidas['prep.entrada'] = 'no salió el panel "antes de salir" (puede que no faltara nada)'
    } else {
      const entraFondo = intermedios(framesPrep, 'prepCapa', 'o', 0.05, 0.95)
      anotar(
        'prep.entradaFondo',
        entraFondo >= MINIMO_INTERMEDIOS,
        `${entraFondo} fotogramas con el fondo a media opacidad (mínimo ${MINIMO_INTERMEDIOS})`
      )

      const desdeCierre = await indiceActual(page)
      const salir = page.locator('button', { hasText: /seguir sen iso|seguir sin/i }).first()
      if (await salir.count()) await salir.click().catch(() => {})
      await esperar(1000)
      const framesCierre = await framesDesde(page, desdeCierre)
      const saleFondo = intermedios(framesCierre, 'prepCapa', 'o', 0.05, 0.95)
      anotar(
        'prep.salidaFondo',
        saleFondo >= MINIMO_INTERMEDIOS,
        `${saleFondo} fotogramas a media opacidad al cerrar (mínimo ${MINIMO_INTERMEDIOS})`
      )
    }

    await esperar(600)

    // ---------------------------------------------------------------
    // 3. Las tres hojas: abrir y cerrar.
    // ---------------------------------------------------------------
    const cerrarHoja = async () =>
      page
        .evaluate(() => {
          const h = document.querySelector('.saga-hoja')
          const b = Array.from(h?.querySelectorAll('button') || []).find(
            (e) => (e.textContent || '').trim().length === 1
          )
          b?.click()
        })
        .catch(() => {})

    const hojas = [
      ['mochila', async () => page.locator('button', { hasText: /^Mochila$/ }).first().click({ force: true })],
      [
        'ferramentas',
        async () => page.locator('button', { hasText: /^Ferramentas$|^Herramientas$/ }).first().click({ force: true }),
      ],
      ['clasificacion', async () => page.locator('[aria-label="Trofeo"]').first().click({ force: true })],
    ]

    const alturas = {}

    for (const [nombre, abrir] of hojas) {
      const desdeAbrir = await indiceActual(page)
      await abrir().catch(() => {})
      await esperar(900)
      const framesAbrir = await framesDesde(page, desdeAbrir)

      if (presente(framesAbrir, 'hoja') === 0) {
        anotar(`hoja.${nombre}.abre`, false, 'no se llegó a abrir')
        continue
      }

      const alto = Math.max(...framesAbrir.filter((f) => f.hoja).map((f) => f.hoja.alto))
      alturas[nombre] = alto
      // "A medio camino" para una hoja que sube es su `translateY`: entre un
      // 5% y un 95% de su propia altura.
      const subiendo = intermedios(framesAbrir, 'hoja', 'y', alto * 0.05, alto * 0.95)
      anotar(
        `hoja.${nombre}.entrada`,
        subiendo >= MINIMO_INTERMEDIOS,
        `${subiendo} fotogramas a medio subir (mínimo ${MINIMO_INTERMEDIOS})`
      )

      // El hueco de abajo: la hoja tiene que apoyarse en el borde.
      const hueco = await page.evaluate(() => {
        const h = document.querySelector('.saga-hoja')
        if (!h) return null
        return Math.round(window.innerHeight - h.getBoundingClientRect().bottom)
      })
      anotar(
        `hoja.${nombre}.huecoAbajo`,
        hueco !== null && hueco <= 1,
        `${hueco}px entre la hoja y el borde de la pantalla`
      )

      const desdeCerrar = await indiceActual(page)
      await cerrarHoja()
      await esperar(800)
      const framesCerrar = await framesDesde(page, desdeCerrar)
      const bajando = intermedios(framesCerrar, 'hoja', 'y', alto * 0.05, alto * 0.95)
      anotar(
        `hoja.${nombre}.salida`,
        bajando >= MINIMO_INTERMEDIOS,
        `${bajando} fotogramas a medio bajar (mínimo ${MINIMO_INTERMEDIOS})`
      )
      await esperar(400)
    }

    // ---------------------------------------------------------------
    // 4. Las tres pestañas de la Mochila, ¿miden lo mismo?
    // ---------------------------------------------------------------
    await page.locator('button', { hasText: /^Mochila$/ }).first().click({ force: true }).catch(() => {})
    await esperar(700)
    const altosPestanas = {}
    for (const pestana of ['Guia', 'Objetos', 'Mesa']) {
      const b = page.locator('button', { hasText: new RegExp(`^${pestana}$`, 'i') }).first()
      if (await b.count()) {
        await b.click({ force: true }).catch(() => {})
        await esperar(450)
      }
      altosPestanas[pestana] = await page.evaluate(() => {
        const h = document.querySelector('.saga-hoja')
        return h ? Math.round(h.getBoundingClientRect().height) : null
      })
      await page.screenshot({ path: `${OUT}/anim-02-mochila-${pestana.toLowerCase()}.png` })
    }
    const valores = Object.values(altosPestanas).filter((v) => typeof v === 'number')
    const dispersion = valores.length ? Math.max(...valores) - Math.min(...valores) : 0
    anotar(
      'mochila.alturasUniformes',
      dispersion <= 2,
      `${dispersion}px de diferencia entre pestañas ${JSON.stringify(altosPestanas)}`
    )

    await ctx.close()
  } finally {
    await browser.close()
    await client.stopBrowserSession()
    await client.cleanupTrace()
  }

  return { fallos, medidas }
}

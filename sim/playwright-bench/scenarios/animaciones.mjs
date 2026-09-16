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
 * La primera versión contaba fotogramas: grababa la opacidad y la posición
 * reales en cada `requestAnimationFrame` y miraba si había valores a medio
 * camino. Y MENTÍA: para el mismo código sin tocar, tres pasadas seguidas
 * dieron 7, 6 y 0 en la misma hoja. En Chromium sin ventana el bucle va
 * irregular y cada llamada del guión le roba fotogramas, así que un cero no
 * significaba "no se movió" sino "no miré mientras se movía".
 *
 * Ahora la pregunta se le hace al navegador, que no necesita que nadie mire:
 * `transitionend` y `animationend` se disparan cuando el movimiento TERMINA
 * de verdad, y traen `elapsedTime`. Si no hay evento, no hubo movimiento; no
 * hay forma de que el navegador avise del final de algo que no ha empezado.
 *
 * El muestreo por fotogramas se queda sólo para una cosa que no va de
 * suavidad sino de presencia: comprobar que entre que la pantalla de carga
 * se va y el velo se pone no queda NI UN fotograma con el juego desnudo.
 */
import { chromium } from 'playwright'
import { SagaClient } from '../lib/sagaClient.mjs'

const BASE_URL = process.env.SAGA_BASE_URL
const OUT = process.env.SHOT_DIR || 'out'

/**
 * El grabador vive en la página y arranca ANTES de que cargue nada: el
 * relevo de la pantalla de carga ocurre una sola vez y no avisa.
 */
function grabador() {
  const TOPE = 2400
  const estado = { frames: [], eventos: [], siguiente: 0 }
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

  /**
   * Y ademas -de hecho, sobre todo- los EVENTOS de verdad del navegador.
   *
   * Contar fotogramas resulto ser una prueba que miente. Para el mismo
   * codigo sin tocar, tres pasadas seguidas dieron 7, 6 y 0 fotogramas
   * intermedios en la misma hoja: en Chromium sin ventana el bucle de
   * `requestAnimationFrame` va irregular, y cada `page.evaluate` del guion
   * le roba fotogramas encima. Un cero ahi no significaba "no se movio",
   * significaba "no mire mientras se movia".
   *
   * `transitionend` y `animationend` no dependen de que nadie mire: los
   * dispara el navegador cuando la transicion TERMINA DE VERDAD, y traen
   * `elapsedTime`, o sea cuanto duro. Eso responde la pregunta entera -¿se
   * movio?, ¿que propiedad?, ¿cuanto?- sin muestreo y sin suerte.
   */
  const quien = (el) => {
    if (!(el instanceof Element)) return null
    const marca = el.getAttribute('data-saga-anim')
    if (marca) return marca
    if (el.classList && el.classList.contains('saga-hoja')) return 'hoja'
    return null
  }

  const anotarEvento = (evento, tipo) => {
    const nombre = quien(evento.target)
    if (!nombre) return
    estado.eventos.push({
      i: estado.siguiente,
      quien: nombre,
      tipo,
      prop: evento.propertyName || evento.animationName || '',
      ms: Math.round((evento.elapsedTime || 0) * 1000),
    })
    if (estado.eventos.length > TOPE) estado.eventos.shift()
  }

  document.addEventListener('transitionend', (e) => anotarEvento(e, 'transicion'), true)
  document.addEventListener('animationend', (e) => anotarEvento(e, 'animacion'), true)
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms))

async function indiceActual(page) {
  return page.evaluate(() => window.__sagaAnim?.siguiente ?? 0)
}

async function framesDesde(page, desde) {
  return page.evaluate((d) => (window.__sagaAnim?.frames || []).filter((f) => f.i >= d), desde)
}

async function eventosDesde(page, desde) {
  return page.evaluate((d) => (window.__sagaAnim?.eventos || []).filter((e) => e.i >= d), desde)
}

/**
 * ¿Termino un movimiento de esta propiedad, en este elemento, y cuanto duro?
 *
 * Devuelve el evento o `null`. `null` significa que el movimiento no ocurrio:
 * no hay forma de que el navegador dispare `transitionend` de algo que no ha
 * transicionado.
 */
function movimiento(eventos, quien, prop) {
  return eventos.find((e) => e.quien === quien && e.prop === prop) || null
}

/** Duracion minima para no dar por buena una transicion de adorno. */
const MS_MINIMOS = 150

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
    const eventosRelevo = await eventosDesde(page, 0)

    if (!vioVelo) {
      anotar('relevo.velo', false, 'el velo de salida de la carga no llegó a existir')
    } else {
      const fundido = movimiento(eventosRelevo, 'velo', 'opacity')
      anotar(
        'relevo.fundido',
        Boolean(fundido) && fundido.ms >= MS_MINIMOS,
        fundido ? `el velo se fundió durante ${fundido.ms}ms` : 'el velo NO se fundió: apareció y desapareció'
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
      const eventosPrep = await eventosDesde(page, desdePrep)
      const entraFondo = movimiento(eventosPrep, 'prep-capa', 'sagaCapaEntra')
      anotar(
        'prep.entradaFondo',
        Boolean(entraFondo) && entraFondo.ms >= MS_MINIMOS,
        entraFondo
          ? `el fondo entró durante ${entraFondo.ms}ms`
          : 'el fondo NO entró: la pantalla se oscurece de un tirón'
      )

      const desdeCierre = await indiceActual(page)
      const salir = page.locator('button', { hasText: /seguir sen iso|seguir sin/i }).first()
      if (await salir.count()) await salir.click().catch(() => {})
      await esperar(1000)
      const eventosCierre = await eventosDesde(page, desdeCierre)
      const saleFondo = movimiento(eventosCierre, 'prep-capa', 'opacity')
      anotar(
        'prep.salidaFondo',
        Boolean(saleFondo) && saleFondo.ms >= MS_MINIMOS,
        saleFondo ? `el fondo salió durante ${saleFondo.ms}ms` : 'el fondo NO salió: desaparece de golpe'
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

      alturas[nombre] = Math.max(...framesAbrir.filter((f) => f.hoja).map((f) => f.hoja.alto))

      const subiendo = movimiento(await eventosDesde(page, desdeAbrir), 'hoja', 'transform')
      anotar(
        `hoja.${nombre}.entrada`,
        Boolean(subiendo) && subiendo.ms >= MS_MINIMOS,
        subiendo ? `subió durante ${subiendo.ms}ms` : 'NO subió: aparece ya colocada'
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
      const bajando = movimiento(await eventosDesde(page, desdeCerrar), 'hoja', 'transform')
      anotar(
        `hoja.${nombre}.salida`,
        Boolean(bajando) && bajando.ms >= MS_MINIMOS,
        bajando ? `bajó durante ${bajando.ms}ms` : 'NO bajó: desaparece de golpe'
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

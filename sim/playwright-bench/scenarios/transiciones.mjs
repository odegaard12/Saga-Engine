/**
 * Transiciones de pantalla: ¿cada panel entra y sale como dice el sistema de
 * movimiento, y termina donde debe?
 *
 * Complementa a `animaciones` (que juega la app entera contra un servidor y
 * mide la carga, el velo y las hojas de Mochila/Herramientas/Clasificación).
 * Esto monta los componentes REALES de los que `animaciones` no puede tirar
 * desde la interfaz -avisos apilados, prólogo, visor de fotos, «usar objeto»,
 * pantalla final, el esqueleto de un juego- en una página suelta
 * (`harness/transiciones`), sin servidor, sin misión y sin contraseñas.
 *
 * Mismo principio que `animaciones`: se le pregunta al NAVEGADOR. Se escuchan
 * `transitionend`/`animationend` (con su `elapsedTime` real) y no se cuentan
 * fotogramas, que en Chromium sin ventana mienten. Por cada transición:
 *
 *   - la DURACIÓN medida es la de los tokens (`--saga-dur-*`), no otra;
 *   - el ESTADO FINAL es el correcto (se desmonta al salir; queda colocada al entrar);
 *   - NO HAY DESPLAZAMIENTO DE DISEÑO (layout-shift) provocado por el movimiento;
 *   - con «reducir movimiento» solo hay fundidos: ninguna `transform` cambia y
 *     la duración baja a la de `--saga-dur-reducida`.
 *
 * Uso: node run.mjs transiciones     (construye el arnés con la vite de frontend/)
 *      SALTAR_CONSTRUCCION=1 node run.mjs transiciones   (reutiliza out/)
 */
import { chromium } from 'playwright'
import { execFileSync } from 'node:child_process'
import { createServer } from 'node:http'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = path.dirname(fileURLToPath(import.meta.url))
const BANCO = path.resolve(AQUI, '..')
const FRONTEND = path.resolve(BANCO, '../../frontend')
const SALIDA = path.join(BANCO, 'out', 'harness-transiciones')
const CAPTURAS = process.env.SHOT_DIR || path.join(BANCO, 'out')

/** Duraciones de mobile-themes.css (ms). Si cambian los tokens, cambian aquí. */
const NORMAL = { rapida: 180, media: 240, larga: 280 }
const REDUCIDO = 120
/** Margen entre la duración pedida y el `elapsedTime` que devuelve el navegador. */
const TOLERANCIA_MS = 25

const esperar = (ms) => new Promise((r) => setTimeout(r, ms))

const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' }

function servir(retrasoJs = 0) {
  const servidor = createServer((req, res) => {
    const url = new URL(req.url, 'http://x')
    const ruta = path.join(SALIDA, url.pathname === '/' ? 'index.html' : url.pathname)
    if (!ruta.startsWith(SALIDA) || !existsSync(ruta)) {
      res.writeHead(404).end('no')
      return
    }
    const enviar = () => {
      res.writeHead(200, { 'Content-Type': TIPOS[path.extname(ruta)] || 'application/octet-stream' })
      res.end(readFileSync(ruta))
    }
    // Retraso solo para los paquetes de juego: lo que hace falta para ver el esqueleto.
    if (retrasoJs && /(Checkpoint|RuntimeScreen)[^/]*\.js$/.test(ruta)) setTimeout(enviar, retrasoJs)
    else enviar()
  })
  return new Promise((resolve) => servidor.listen(0, '127.0.0.1', () => resolve(servidor)))
}

/** Corre en la página ANTES de que cargue nada. */
function grabador() {
  const est = { eventos: [], cls: 0, maxOpacidad: {} }
  window.__tr = est
  const quien = (el) => {
    if (!(el instanceof Element)) return null
    const m = el.getAttribute('data-saga-anim')
    if (m) return m
    if (el.classList.contains('saga-hoja')) return 'hoja'
    return null
  }
  const nota = (e, tipo) => {
    const q = quien(e.target)
    if (!q) return
    est.eventos.push({
      t: Math.round(performance.now()),
      quien: q,
      tipo,
      prop: e.propertyName || e.animationName || '',
      ms: Math.round((e.elapsedTime || 0) * 1000),
    })
  }
  document.addEventListener('transitionend', (e) => nota(e, 'transicion'), true)
  document.addEventListener('animationend', (e) => nota(e, 'animacion'), true)
  try {
    new PerformanceObserver((lista) => {
      for (const en of lista.getEntries()) if (!en.hadRecentInput) est.cls += en.value
    }).observe({ type: 'layout-shift', buffered: true })
  } catch {
    /* sin layout-shift: se queda en 0 */
  }
  // Opacidad máxima que llegó a tener cada marca: para saber si un esqueleto se VIO.
  const vigilar = () => {
    document.querySelectorAll('[data-saga-anim]').forEach((el) => {
      const k = el.getAttribute('data-saga-anim')
      const o = Number(getComputedStyle(el).opacity)
      est.maxOpacidad[k] = Math.max(est.maxOpacidad[k] ?? 0, o)
    })
    requestAnimationFrame(vigilar)
  }
  requestAnimationFrame(vigilar)
}

const ahora = (page) => page.evaluate(() => Math.round(performance.now()))
const eventos = (page, desde) => page.evaluate((d) => window.__tr.eventos.filter((e) => e.t >= d), desde)
const cls = (page) => page.evaluate(() => window.__tr.cls)
const ejecutar = (page, nombre, ...args) => page.evaluate(([n, a]) => window.__h[n](...a), [nombre, args])
const existe = (page, sel) => page.evaluate((s) => Boolean(document.querySelector(s)), sel)
const rect = (page, sel) =>
  page.evaluate((s) => {
    const e = document.querySelector(s)
    if (!e) return null
    const r = e.getBoundingClientRect()
    return { top: r.top, bottom: r.bottom, h: r.height }
  }, sel)

function construir() {
  if (process.env.SALTAR_CONSTRUCCION === '1' && existsSync(path.join(SALIDA, 'index.html'))) return
  execFileSync(
    process.execPath,
    [
      path.join(FRONTEND, 'node_modules/vite/bin/vite.js'),
      'build',
      '--config',
      path.join(BANCO, 'harness/transiciones/vite.config.mjs'),
    ],
    { cwd: FRONTEND, stdio: 'pipe' }
  )
}

export async function run() {
  construir()
  const fallos = []
  const medidas = {}
  const anotar = (nombre, ok, detalle) => {
    medidas[nombre] = detalle
    if (!ok) fallos.push(`${nombre}: ${detalle}`)
  }
  /** ¿Terminó un movimiento de esta marca y propiedad, con la duración esperada? */
  const duro = (evs, quien, prop, esperado) => {
    const e = evs.find((x) => x.quien === quien && x.prop === prop)
    return {
      ok: Boolean(e) && Math.abs(e.ms - esperado) <= TOLERANCIA_MS,
      texto: e ? `${e.ms}ms (pedido ${esperado})` : `sin ${prop} (pedido ${esperado}): no se movió`,
    }
  }
  const comprobar = (nombre, evs, quien, prop, esperado) => {
    const r = duro(evs, quien, prop, esperado)
    anotar(nombre, r.ok, r.texto)
  }

  const servidor = await servir()
  const servidorLento = await servir(700)
  const base = `http://127.0.0.1:${servidor.address().port}/index.html`
  const baseLenta = `http://127.0.0.1:${servidorLento.address().port}/index.html`
  const browser = await chromium.launch({ headless: process.env.HEADLESS !== '0' })

  try {
    for (const reducido of [false, true]) {
      const p = reducido ? 'reducido' : 'normal'
      const dur = reducido
        ? { rapida: REDUCIDO, media: REDUCIDO, larga: REDUCIDO }
        : NORMAL
      const ctx = await browser.newContext({
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: true,
        reducedMotion: reducido ? 'reduce' : 'no-preference',
      })
      await ctx.addInitScript(grabador)
      const page = await ctx.newPage()
      const errores = []
      page.on('pageerror', (e) => errores.push(String(e).slice(0, 160)))
      await page.goto(base, { waitUntil: 'load' })
      await page.waitForFunction(() => Boolean(window.__h?.abrirHoja))

      // Los tokens llegan tal cual a los componentes.
      const token = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--saga-dur-larga').trim())
      anotar(`${p}.token.larga`, token === `${dur.larga}ms`, `--saga-dur-larga = ${token}`)

      // ---------- Avisos apilados
      let t = await ahora(page)
      await ejecutar(page, 'avisar', 'Primer aviso', 'warn')
      await esperar(dur.rapida + 350)
      let ev = await eventos(page, t)
      comprobar(`${p}.aviso.entra`, ev, 'aviso', 'opacity', dur.rapida)
      await ejecutar(page, 'avisar', 'Segundo aviso', 'warn')
      await ejecutar(page, 'avisar', 'Tercero', 'success')
      await esperar(120)
      await ejecutar(page, 'avisar', 'Cuarto', 'warn')
      await esperar(dur.rapida + 350)
      const pila = await page.evaluate(() =>
        [...document.querySelectorAll('[data-saga-anim="aviso"]')].map((e) => ({
          estado: e.getAttribute('data-estado'),
          top: e.getBoundingClientRect().top,
          bottom: e.getBoundingClientRect().bottom,
        }))
      )
      const vivos = pila.filter((x) => x.estado !== 'saliendo')
      anotar(`${p}.aviso.apila`, vivos.length === 3, `${vivos.length} a la vez (tope 3, el cuarto echa al más viejo)`)
      const solapan = vivos.some((x, i) => i > 0 && x.top < vivos[i - 1].bottom - 1)
      anotar(`${p}.aviso.sinSolape`, !solapan, solapan ? 'se pisan' : 'cada uno en su sitio')
      // El mismo texto otra vez no apila otro.
      await ejecutar(page, 'avisar', 'Cuarto', 'warn')
      await esperar(200)
      const tras = await page.evaluate(() => document.querySelectorAll('[data-saga-anim="aviso"]:not([data-estado="saliendo"])').length)
      anotar(`${p}.aviso.noDuplica`, tras === 3, `${tras} vivos tras repetir el mismo texto`)
      await esperar(3000 + dur.rapida + 500)
      const quedan = await page.evaluate(() => document.querySelectorAll('[data-saga-anim="aviso"]').length)
      ev = await eventos(page, t)
      anotar(`${p}.aviso.sale`, quedan === 0, `${quedan} en el DOM tras caducar`)
      comprobar(`${p}.aviso.duracionSalida`, ev.filter((e) => e.quien === 'aviso').reverse(), 'aviso', 'opacity', dur.rapida)
      // Quitar un aviso de la pila recoloca los de debajo: en normal lo disimula una
      // transformación (FLIP) y el resto es casi nada; con reducir movimiento
      // no se anima nada y el salto es de una tarjeta. Ambos pequeños.
      const tope = reducido ? 0.02 : 0.01
      anotar(`${p}.aviso.layoutShift`, (await cls(page)) < tope, `${(await cls(page)).toFixed(4)} de desplazamiento de diseño (tope ${tope})`)

      // ---------- Aviso callado
      t = await ahora(page)
      await ejecutar(page, 'callar', 'Sin cobertura')
      await esperar(dur.rapida + 350)
      await ejecutar(page, 'callar', null)
      await esperar(dur.rapida + 350)
      ev = await eventos(page, t)
      anotar(`${p}.callado.sale`, !(await existe(page, '[data-saga-anim="aviso-callado"]')), 'desmontado tras salir')
      comprobar(`${p}.callado.movimiento`, ev, 'aviso-callado', 'opacity', dur.rapida)

      // ---------- Prólogo: sale con transición y avisa UNA vez
      t = await ahora(page)
      await ejecutar(page, 'abrirHistoria')
      await esperar(dur.media + 350)
      ev = await eventos(page, t)
      comprobar(`${p}.historia.entra`, ev, 'historia-fondo', 'opacity', dur.media)
      t = await ahora(page)
      await page.getByRole('button', { name: 'Seguir' }).click()
      await esperar(60)
      anotar(`${p}.historia.siguePintada`, await existe(page, '[data-saga-anim="historia-tarjeta"]'), 'a los 60ms aún se ve (se está yendo)')
      await esperar(dur.media + 500)
      ev = await eventos(page, t)
      comprobar(`${p}.historia.sale`, ev, 'historia-fondo', 'opacity', dur.media)
      if (!reducido) comprobar(`${p}.historia.salePorTransform`, ev, 'historia-tarjeta', 'transform', dur.media)
      else anotar(`${p}.historia.sinTransform`, !ev.some((e) => e.prop === 'transform'), 'con reducir movimiento no se desplaza nada')
      const cierres = await page.locator('[data-testid="cierres"]').textContent()
      anotar(`${p}.historia.avisaUnaVez`, cierres.split(',').filter((x) => x === 'historia').length === 1, `onClose llamado: "${cierres}"`)
      anotar(`${p}.historia.estadoFinal`, !(await existe(page, '[data-saga-anim="historia-fondo"]')), 'desmontada')

      // ---------- Visor de fotos: se queda con su contenido mientras sale
      t = await ahora(page)
      await ejecutar(page, 'abrirFoto')
      await esperar(dur.media + 350)
      ev = await eventos(page, t)
      comprobar(`${p}.foto.entra`, ev, 'foto-fondo', 'opacity', dur.media)
      t = await ahora(page)
      await ejecutar(page, 'cerrarFoto')
      await esperar(60)
      anotar(`${p}.foto.conservaContenido`, await existe(page, '[data-saga-anim="foto-tarjeta"] img'), 'la foto sigue a los 60ms')
      await esperar(dur.media + 500)
      ev = await eventos(page, t)
      comprobar(`${p}.foto.sale`, ev, 'foto-fondo', 'opacity', dur.media)
      anotar(`${p}.foto.estadoFinal`, !(await existe(page, '[data-saga-anim="foto-fondo"]')), 'desmontado')

      // ---------- «Usar objeto»
      t = await ahora(page)
      await ejecutar(page, 'abrirUsar')
      await esperar(dur.media + 350)
      ev = await eventos(page, t)
      comprobar(`${p}.usar.entra`, ev, 'usar-fondo', 'opacity', dur.media)
      t = await ahora(page)
      await ejecutar(page, 'cerrarUsar')
      await esperar(60)
      const titulo = await page.evaluate(() => document.querySelector('.saga-use-title')?.textContent || '')
      anotar(`${p}.usar.conservaTitulo`, titulo === 'Llave', `título a los 60ms: "${titulo}"`)
      await esperar(dur.media + 500)
      ev = await eventos(page, t)
      comprobar(`${p}.usar.sale`, ev, 'usar-fondo', 'opacity', dur.media)
      anotar(`${p}.usar.estadoFinal`, !(await existe(page, '[data-saga-anim="usar-fondo"]')), 'desmontado')

      // ---------- Pantalla final
      t = await ahora(page)
      await ejecutar(page, 'abrirFinal')
      await esperar(dur.media + 350)
      ev = await eventos(page, t)
      comprobar(`${p}.final.entra`, ev, 'final-fondo', 'opacity', dur.media)
      t = await ahora(page)
      await page.locator('.saga-finish-btn-primary').click()
      await esperar(dur.media + 600)
      ev = await eventos(page, t)
      comprobar(`${p}.final.sale`, ev, 'final-fondo', 'opacity', dur.media)
      const cierres2 = await page.locator('[data-testid="cierres"]').textContent()
      anotar(`${p}.final.avisaUnaVez`, cierres2.split(',').filter((x) => x === 'final').length === 1, `onClose llamado: "${cierres2}"`)
      anotar(`${p}.final.estadoFinal`, !(await existe(page, '[data-saga-anim="final-fondo"]')), 'desmontada')

      // ---------- Hoja: entra, sigue al dedo, vuelve, y se cierra arrastrando
      const c0 = await cls(page)
      t = await ahora(page)
      await ejecutar(page, 'abrirHoja')
      await esperar(dur.larga + 450)
      ev = await eventos(page, t)
      if (reducido) {
        comprobar(`${p}.hoja.entraFundido`, ev, 'hoja', 'opacity', dur.larga)
        anotar(`${p}.hoja.sinTransform`, !ev.some((e) => e.quien === 'hoja' && e.prop === 'transform'), 'no se desplaza con reducir movimiento')
      } else {
        comprobar(`${p}.hoja.entra`, ev, 'hoja', 'transform', dur.larga)
      }
      comprobar(`${p}.hoja.fondoEntra`, ev, 'hoja-fondo', 'opacity', dur.media)
      anotar(`${p}.hoja.layoutShift`, (await cls(page)) - c0 < 0.001, `${((await cls(page)) - c0).toFixed(4)} al abrir`)
      const reposo = await rect(page, '.saga-hoja')
      anotar(`${p}.hoja.apoyadaAbajo`, Math.abs(844 - reposo.bottom) <= 1, `${(844 - reposo.bottom).toFixed(1)}px entre la hoja y el borde`)

      const cdp = await ctx.newCDPSession(page)
      const toque = async (tipo, y) =>
        cdp.send('Input.dispatchTouchEvent', { type: tipo, touchPoints: tipo === 'touchEnd' ? [] : [{ x: 195, y }] })
      const arrastrar = async (y0, y1, pasos) => {
        await toque('touchStart', y0)
        for (let i = 1; i <= pasos; i++) {
          await toque('touchMove', y0 + ((y1 - y0) * i) / pasos)
          await esperar(14)
        }
      }
      // Corto: sigue al dedo 1:1 y al soltar vuelve.
      await arrastrar(reposo.top + 40, reposo.top + 40 + 60, 10)
      const siguiendo = await rect(page, '.saga-hoja')
      const op = await page.evaluate(() => Number(getComputedStyle(document.querySelector('[data-saga-anim="hoja-fondo"]')).opacity))
      anotar(`${p}.hoja.sigueAlDedo`, Math.abs(siguiendo.top - reposo.top - 60) <= 3, `bajó ${(siguiendo.top - reposo.top).toFixed(1)}px con 60px de dedo`)
      anotar(`${p}.hoja.fondoSigueAlDedo`, op < 1 && op > 0.5, `fondo a ${op.toFixed(2)} durante el arrastre`)
      await toque('touchEnd')
      await esperar(dur.larga + 400)
      const vuelta = await rect(page, '.saga-hoja')
      anotar(`${p}.hoja.vuelve`, vuelta && Math.abs(vuelta.top - reposo.top) <= 1, `top ${vuelta && vuelta.top.toFixed(1)} (reposo ${reposo.top.toFixed(1)})`)
      // Largo: se cierra desde donde está.
      t = await ahora(page)
      await arrastrar(reposo.top + 40, reposo.top + 40 + 230, 10)
      await toque('touchEnd')
      await esperar(dur.larga + 600)
      ev = await eventos(page, t)
      anotar(`${p}.hoja.cierraArrastrando`, !(await existe(page, '.saga-hoja')), 'desmontada tras arrastrar >30% hacia abajo')
      if (!reducido) comprobar(`${p}.hoja.terminaSalida`, ev, 'hoja', 'transform', dur.larga)

      // ---------- Esqueleto del juego (solo en normal: no depende del movimiento)
      if (!reducido) {
        await ejecutar(page, 'abrirEsqueleto')
        await esperar(700)
        const maxRapido = await page.evaluate(() => window.__tr.maxOpacidad['esqueleto-juego'] ?? 0)
        anotar('esqueleto.conPaqueteRapido', maxRapido < 0.05, `opacidad máxima ${maxRapido.toFixed(2)}: no hubo destello de «Cargando»`)
      }
      anotar(`${p}.sinErroresDePagina`, errores.length === 0, errores.join(' | ') || 'ninguno')
      await page.screenshot({ path: path.join(CAPTURAS, `transiciones-${p}.png`) })
      await ctx.close()
    }

    // ---------- Esqueleto con paquete lento: se ve, sin texto y reservando alto
    {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
      await ctx.addInitScript(grabador)
      const page = await ctx.newPage()
      await page.goto(baseLenta, { waitUntil: 'load' })
      await page.waitForFunction(() => Boolean(window.__h?.abrirEsqueleto))
      await ejecutar(page, 'abrirEsqueleto')
      await esperar(500)
      const visto = await page.evaluate(() => window.__tr.maxOpacidad['esqueleto-juego'] ?? 0)
      const altoEsq = await rect(page, '[data-saga-anim="esqueleto-juego"]')
      anotar('esqueleto.conPaqueteLento', visto > 0.9 && altoEsq && altoEsq.h >= 300, `opacidad ${visto.toFixed(2)}, alto ${altoEsq && altoEsq.h}px`)
      await ctx.close()
    }

    // ---------- Relevo de pantallas de carga: un solo fundido
    {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
      await ctx.addInitScript(grabador)
      const page = await ctx.newPage()
      await page.goto(`${base}?caso=carga`, { waitUntil: 'load' })
      await page.waitForFunction(() => Boolean(window.__h?.pasarABarras))
      await esperar(600)
      let ev = await eventos(page, 0)
      const primero = ev.find((e) => e.quien === 'splash' && e.prop === 'sagaCapaEntra')
      anotar(
        'carga.primerFundido',
        Boolean(primero) && Math.abs(primero.ms - NORMAL.larga) <= TOLERANCIA_MS,
        primero ? `la neutra se fundió ${primero.ms}ms` : 'la neutra no se fundió'
      )
      const t = await ahora(page)
      await ejecutar(page, 'pasarABarras')
      await esperar(600)
      ev = await eventos(page, t)
      const segundo = ev.find((e) => e.quien === 'pantalla-de-carga')
      const op = await page.evaluate(() => {
        const e = document.querySelector('[data-saga-anim="pantalla-de-carga"]')
        return e ? Number(getComputedStyle(e).opacity) : null
      })
      anotar('carga.sinSegundoFundido', !segundo && op === 1, `la de las barras ${segundo ? 'volvió a fundirse' : 'aparece ya opaca'} (opacidad ${op})`)
      await ctx.close()
    }
  } finally {
    await browser.close()
    servidor.close()
    servidorLento.close()
  }

  return { fallos, medidas }
}

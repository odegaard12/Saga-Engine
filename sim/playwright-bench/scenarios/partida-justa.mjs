// ¿Es justo? Tres jugadores hacen EXACTAMENTE la misma partida (mismo tiempo dentro de cada nodo) con tres redes:
// A con red buena, B en modo avión de verdad desde que sale (página y service worker sin red) y C con cobertura mala y
// cortes. Al final se lee lo que calculó el SERVIDOR (/api/admin/tiempos): los tres deben acabar, con el mismo tiempo
// por nodo y el mismo total (dentro de una tolerancia de segundos), y sin sospechas.
//
// Pensado para una misión de prueba de nodos de pegatina QR (`qr_payload`): cada jugador abre la hoja, está T segundos y
// escribe el código de respaldo (lo que haría alguien sin cámara; +2 min igual para todos). Los puntos de control no
// sirven: no suman tiempo (se completan al abrirlos). Variables: SAGA_BASE_URL, SAGA_ADMIN_PASS, SEGUNDOS_POR_NODO (15),
// HEADLESS.
import { chromium } from 'playwright'
import { SagaClient } from '../lib/sagaClient.mjs'
import { PERFILES_DISPOSITIVO, PERFILES_RED, aplicarPerfilRed } from '../lib/devices.mjs'

const BASE_URL = process.env.SAGA_BASE_URL || 'http://127.0.0.1:8791'
const ADMIN_PASS = process.env.SAGA_ADMIN_PASS
const HEADLESS = process.env.HEADLESS !== '0'
const T_NODO_MS = Number(process.env.SEGUNDOS_POR_NODO || 15) * 1000
const TOLERANCIA_MS = 4000
const OUT_DIR = new URL('../out/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')

const esperar = (ms) => new Promise((r) => setTimeout(r, ms))
const t0 = Date.now()
const log = (...a) => console.log(`[${String(Math.round((Date.now() - t0) / 1000)).padStart(4)} s]`, ...a)

function coordsDe(stage) {
  const loc = stage.location && typeof stage.location === 'object' ? stage.location : stage
  return typeof loc.lat === 'number' && typeof loc.lon === 'number' ? { latitude: loc.lat, longitude: loc.lon } : null
}

/** Pulsa el primer botón visible cuyo texto case con `re` (y no con `excepto`). */
async function pulsar(page, re, excepto = null) {
  return page.evaluate(
    ([fuente, fuenteExc]) => {
      const r = new RegExp(fuente, 'i')
      const x = fuenteExc ? new RegExp(fuenteExc, 'i') : null
      const b = [...document.querySelectorAll('button')].find((el) => {
        const t = (el.innerText || '').trim()
        const visible = el.offsetParent !== null && !el.disabled
        return visible && r.test(t) && !(x && x.test(t))
      })
      if (b) b.click()
      return Boolean(b)
    },
    [re.source, excepto ? excepto.source : null]
  )
}

const textoDelHud = (page) =>
  page.evaluate(() => document.querySelector('[data-saga-player-hud="bottom"]')?.innerText || '')

async function entrar(page, nombre) {
  await page.goto(`${BASE_URL}/player/${nombre}`, { waitUntil: 'domcontentloaded' })
  for (let i = 0; i < 90; i += 1) {
    // OJO: nada de /Entrar/, que también pulsa «Entrar igualmente» (entrar sin el mapa bajado).
    if (/Preparando tu partida/.test(await page.evaluate(() => document.body.innerText))) {
      await esperar(3000)
      continue
    }
    await pulsar(page, /Seguir sin eso|^Listo$|^Empezar|^Comezar|Entendido/)
    const hud = await textoDelHud(page)
    if (/Abrir nodo|Acércate/.test(hud)) return true
    await esperar(2000)
  }
  return false
}

async function jugar({ browser, jugador, cookie, red, nodos }) {
  const ctx = await browser.newContext({
    ...PERFILES_DISPOSITIVO.iphone,
    geolocation: { ...coordsDe(nodos[0]), accuracy: 6 },
    permissions: ['geolocation'],
  })
  await ctx.addCookies([{ name: cookie, value: jugador.token, url: BASE_URL }])
  const page = await ctx.newPage()
  const errores = []
  page.on('pageerror', (e) => errores.push(String(e.message).slice(0, 160)))
  // Todos preparan la partida con wifi (como en casa antes de salir); la red de cada uno empieza en la ruta.
  const cdp = await aplicarPerfilRed(page, PERFILES_RED.buena)
  const yo = `${jugador.name} (${red})`
  const res = { jugador: jugador.name, red, nodos: [], errores }

  if (!(await entrar(page, jugador.name))) throw new Error(`${yo}: no llegó al mapa`)
  log(`${yo}: en el mapa`)

  let cortes = null
  if (red === 'avion') {
    await ctx.setOffline(true)
    log(`${yo}: MODO AVIÓN`)
  } else if (red === 'mala') {
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: PERFILES_RED.mala.latencyMs,
      downloadThroughput: (PERFILES_RED.mala.downloadKbps * 1024) / 8,
      uploadThroughput: (PERFILES_RED.mala.uploadKbps * 1024) / 8,
    })
    log(`${yo}: COBERTURA MALA con cortes`)
    let vivo = true
    cortes = (async () => {
      while (vivo) {
        await esperar(9000 + Math.random() * 6000)
        if (!vivo) break
        try {
          await ctx.setOffline(true)
          await esperar(4000 + Math.random() * 5000)
          await ctx.setOffline(false)
        } catch {
          break // el contexto ya se cerró
        }
      }
    })()
    cortes.parar = () => {
      vivo = false
    }
  }

  try {
  for (let i = 0; i < nodos.length; i += 1) {
    await ctx.setGeolocation({ ...coordsDe(nodos[i]), accuracy: 6 })
    let abierto = false
    for (let k = 0; k < 60 && !abierto; k += 1) {
      if (/Abrir nodo/.test(await textoDelHud(page))) abierto = await pulsar(page, /Abrir nodo/)
      if (!abierto) await esperar(1000)
    }
    if (!abierto) throw new Error(`${yo}: no pudo abrir el nodo ${i + 1}`)
    const abiertoEn = Date.now()
    // Lo mismo para todos: T segundos dentro del nodo y el código de la pegatina escrito a mano.
    const casilla = page.locator('input[placeholder="Escribe el código..."]').first()
    for (let k = 0; k < 30 && !(await casilla.isVisible().catch(() => false)); k += 1) {
      await pulsar(page, /^Continuar$|Entendido|¿Atascado|código de respaldo/i)
      await esperar(500)
    }
    if (!(await casilla.isVisible().catch(() => false))) throw new Error(`${yo}: el nodo ${i + 1} no ofrece el código de respaldo`)
    await esperar(Math.max(0, T_NODO_MS - (Date.now() - abiertoEn)))
    await casilla.fill(nodos[i].qr_payload || `JUSTA_QR_${i + 1}`)
    await casilla.press('Enter')
    let hecho = false
    for (let k = 0; k < 60 && !hecho; k += 1) {
      await esperar(1000)
      hecho = !(await casilla.isVisible().catch(() => false))
    }
    res.nodos.push({ nivel: i, ms_en_el_movil: Date.now() - abiertoEn, superado: hecho })
    log(`${yo}: nodo ${i + 1} ${hecho ? 'superado' : 'SIN CONFIRMAR'}`)
    await page.screenshot({ path: `${OUT_DIR}justa-${jugador.name}-${i + 1}.png` }).catch(() => {})
  }

  } catch (error) {
    log(`${yo}: FALLO — ${error.message}`)
    await page.screenshot({ path: `${OUT_DIR}justa-${jugador.name}-fallo.png` }).catch(() => {})
    res.fallo = String(error.message)
  } finally {
    if (cortes) {
      cortes.parar()
      await cortes
    }
  }
  await ctx.setOffline(false)
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 40,
    downloadThroughput: 1e6,
    uploadThroughput: 5e5,
  })
  log(`${yo}: con red otra vez; esperando a que suba todo`)
  await esperar(45000)
  await page.screenshot({ path: `${OUT_DIR}justa-${jugador.name}-fin.png` }).catch(() => {})
  await ctx.close()
  return res
}

export async function run() {
  if (!ADMIN_PASS) throw new Error('Falta SAGA_ADMIN_PASS')
  const client = new SagaClient(BASE_URL)
  await client.login(ADMIN_PASS)
  const nodos = (await client.getStages()).filter(coordsDe)
  log(`Misión: ${nodos.length} nodos, ${T_NODO_MS / 1000} s dentro de cada uno`)
  const sesion = await client.startBrowserSession(3)
  // Partida limpia: cada jugador empieza en el nodo 1 (si ya existían de otra corrida).
  for (const j of sesion.players) {
    await client._fetch('/api/reset', { method: 'POST', body: JSON.stringify({ user: j.name }) })
  }
  const browser = await chromium.launch({
    headless: HEADLESS,
    args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'],
  })
  const redes = ['buena', 'avion', 'mala']
  try {
    const jugados = await Promise.all(
      sesion.players.map((jugador, i) =>
        jugar({ browser, jugador, cookie: sesion.cookie_name, red: redes[i], nodos }).catch((e) => ({
          jugador: jugador.name,
          red: redes[i],
          fallo: String(e.message),
        }))
      )
    )
    const r = await client._fetch('/api/admin/tiempos', { method: 'POST', body: '{}' })
    const tiempos = await r.json()
    const informe = jugados.map((j) => {
      const s = (tiempos.jugadores || []).find((x) => x.user === j.jugador) || {}
      return {
        ...j,
        servidor: {
          nivel: s.level,
          terminado: s.finished,
          total_ms: s.total_time_ms,
          penalizaciones_ms: s.penalties_ms,
          sospechas: s.suspicion_count,
          por_nodo: (s.nodos || []).map((n) => ({
            ms: n.applied_ms,
            fuente: n.fuente,
            sospechas: (n.sospechas || []).map((x) => x.reason),
          })),
        },
      }
    })
    const totales = informe.map((j) => j.servidor.total_ms || 0)
    const veredicto = {
      todos_terminan: informe.every((j) => j.servidor.terminado),
      diferencia_maxima_entre_totales_ms: Math.max(...totales) - Math.min(...totales),
      esperado_por_jugador_ms: nodos.length * T_NODO_MS,
      sin_sospechas: informe.every((j) => !j.servidor.sospechas),
    }
    veredicto.justo =
      veredicto.todos_terminan && veredicto.diferencia_maxima_entre_totales_ms <= TOLERANCIA_MS * nodos.length
    return { veredicto, informe }
  } finally {
    await browser.close()
  }
}

// 1/11/2026 (6.2.0): menú de gestos → tienda cerraba una hoja y abría otra en el mismo instante; el `history.back()` de
// la que se iba (asíncrono) se llevaba la entrada de la nueva, y al cerrar la tienda el jugador acababa en el login.
// Aquí un historial de mentira con la misma asincronía que el real (back/go se ejecutan DESPUÉS, desde la entrada en la
// que esté el historial entonces) y el módulo TS tal cual. Lo comprueba tests/test_revision_1_11.py.
'use strict'
const { crearEntorno } = require('./entorno_navegador.cjs')
const esperar = (ms) => new Promise((r) => setTimeout(r, ms))

async function caso(nombre, guion) {
  const e = crearEntorno()
  const oyentes = []
  const h = { entradas: ['login', 'jugador'], indice: 1 }
  const historial = {
    pushState() { h.entradas.splice(h.indice + 1); h.entradas.push('hoja'); h.indice += 1 },
    back() { this.go(-1) },
    go(n) {
      setTimeout(() => {
        const nuevo = Math.max(0, Math.min(h.entradas.length - 1, h.indice + n))
        if (nuevo === h.indice) return
        h.indice = nuevo
        oyentes.forEach((f) => f({}))
      }, 0)
    },
  }
  h.atras = () => { h.indice -= 1; oyentes.forEach((f) => f({})) } // el botón Atrás del móvil
  e.sandbox.history = historial
  e.sandbox.addEventListener = (tipo, f) => { if (tipo === 'popstate') oyentes.push(f) }
  const m = e.cargar('src/player/hooks/useAtrasCierra.ts')
  const cerradas = []
  const r = await guion(m, h, cerradas)
  return { nombre, indice: h.indice, entradas: h.entradas.length, cerradas, ...r }
}

async function main() {
  const salida = {}
  // 1) Menú → tienda a la vez; la tienda se cierra con su × y luego Atrás sale a la entrada anterior (login), no antes.
  salida.menuATienda = await caso('menuATienda', async (m, h) => {
    const cierraMenu = m.abrirHoja(() => {})
    const tras1 = h.indice
    cierraMenu() // el menú se va…
    const cierraTienda = m.abrirHoja(() => {}) // …y la tienda se abre en el mismo instante
    await esperar(250)
    const conTienda = h.indice
    cierraTienda() // × de la tienda
    await esperar(250)
    return { tras1, conTienda, trasCerrar: h.indice }
  })
  // 2) La tienda abierta así se cierra con Atrás: cierra la hoja (la tienda, no otra) y se queda en el jugador.
  salida.atrasCierraLaTienda = await caso('atrasCierraLaTienda', async (m, h, cerradas) => {
    const cierraMenu = m.abrirHoja(() => cerradas.push('menu'))
    cierraMenu()
    m.abrirHoja(() => cerradas.push('tienda'))
    await esperar(250)
    const con = h.indice
    h.atras()
    await esperar(250)
    return { con, trasAtras: h.indice }
  })
  // 3) Una hoja sola (HUD → tienda): × deja el historial como estaba.
  salida.unaSola = await caso('unaSola', async (m, h) => {
    const cierra = m.abrirHoja(() => {})
    const con = h.indice
    cierra()
    await esperar(250)
    return { con, trasCerrar: h.indice }
  })
  // 4) Dos hojas se cierran y NO se abre otra: se devuelven las dos entradas (con un solo salto).
  salida.dosSeVan = await caso('dosSeVan', async (m, h) => {
    const a = m.abrirHoja(() => {}); const b = m.abrirHoja(() => {})
    const con = h.indice
    a(); b()
    await esperar(250)
    return { con, trasCerrar: h.indice }
  })
  process.stdout.write(JSON.stringify(salida))
}
main().catch((err) => { process.stdout.write(JSON.stringify({ __error: String((err && err.stack) || err) })); process.exit(0) })

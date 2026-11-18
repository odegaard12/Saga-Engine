// 20/11/2026: modo organizador oculto: 7 toques seguidos (< 1,5 s entre cada uno).
'use strict'
const { crearEntorno } = require('./entorno_navegador.cjs')
const e = crearEntorno()
const M = e.cargar('src/player/utils/modoOrganizador.ts')
const toques = (ts) => { let s = null; let activo = false; for (const t of ts) { const r = M.contarToque(s, t); s = { n: r.n, t: r.t }; if (r.activar) activo = true } return activo }
const seguidos = (n, paso) => Array.from({ length: n }, (_, i) => i * paso)
const mem = () => { const d = new Map(); return { getItem: (k) => (d.has(k) ? d.get(k) : null), setItem: (k, v) => d.set(k, String(v)), removeItem: (k) => d.delete(k) } }
const a = mem()
const antes = M.organizadorActivo(a); M.activarOrganizador(a); const durante = M.organizadorActivo(a); M.salirDelOrganizador(a)
console.log(JSON.stringify({
  seis: toques(seguidos(6, 300)), siete: toques(seguidos(7, 300)), sieteLentos: toques(seguidos(7, 1600)),
  seisPausaYSeis: toques([...seguidos(6, 300), 6000, ...seguidos(5, 300).map((t) => t + 6300)]),
  sieteTrasPausa: toques([0, 200, 400, ...seguidos(7, 300).map((t) => t + 5000)]),
  antes, durante, despues: M.organizadorActivo(a), clave: M.CLAVE_ORGANIZADOR,
  sinAlmacen: M.organizadorActivo(null),
}))

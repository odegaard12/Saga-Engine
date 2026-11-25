// 25/11/2026 (Óscar: «el halo rosa del nodo debe ser la zona desde la que se puede entrar; veo jugadores fuera del halo»).
// El halo se dibuja con el radio de entrada real (o más, si la peana o la moneda no dejarían sitio) y quien está DENTRO de ese
// radio se dibuja dentro del anillo (ni en la peana ni fuera), quien está fuera, fuera; tú también. Lo comprueba
// tests/test_halo_25_11.py.
'use strict'
const { crearEntorno } = require('./entorno_navegador.cjs')

const ent = crearEntorno()
const F = ent.cargar('src/player/posicion/fuentePosicion.ts')
const J = ent.cargar('src/player/components/jugadoresEnMapa.ts')
const base = { lat: 42.71, lon: -8.69 }
const mLat = 111320
const mLon = 111320 * Math.cos((base.lat * Math.PI) / 180)
const en = (e, n) => ({ lat: base.lat + n / mLat, lon: base.lon + e / mLon })
const m = (a, b) => Math.hypot((a.lon - b.lon) * mLon, (a.lat - b.lat) * mLat)
const r2 = (x) => Math.round(x * 100) / 100
const R = 30
const C = en(0, 0)
const POSTE = { ...C, monedaPx: J.radioDeMonedaPx('actual'), toquePx: 36, entrada: { ...C, m: R } }

function mundo({ yo, otros, z, vista }) {
  const fu = new F.FuentePosicion()
  fu.postes = [POSTE]
  fu.separacionM = J.separacionEntreJugadoresM(z, base.lat)
  fu.peanaM = J.radioDePeanaM(z, base.lat)
  J.medirMonedas(z, base.lat, fu.monedas)
  const h = J.huellasDelHaloM(z, base.lat)
  fu.halo = { radioM: (r) => J.radioDelHaloM(z, r, base.lat), huellaTresM: h.tres, huellaDosM: h.dos }
  fu.pesoMoneda = () => (vista === '2D' ? 1 : 0)
  fu.pesoCuerpo = () => (vista === '3D' ? 1 : 0)
  fu.fijar('yo', 'yo', yo, 0)
  otros.forEach((p, i) => fu.fijar('o' + i, 'jugador', p, 0))
  fu.calcular(0)
  fu.calcular(100000)
  return { fu, h }
}

const out = { halo: {}, minimoPx: {}, casos: 0, mal: [], sepMinDentro: {} }
// Siete: tres dentro, uno en el borde por dentro, tres fuera (cerca y lejos); tú dentro, en el borde o fuera.
const SIETE = [[2, 3], [-12, 8], [20, -10], [0, -29], [33, 4], [-40, -20], [90, 30]]
// Quince apretados dentro del radio.
const QUINCE = Array.from({ length: 14 }, (_, i) => [Math.cos(i * 2.3) * (3 + (i % 5) * 5), Math.sin(i * 2.3) * (3 + (i % 5) * 5)])
for (const z of [16, 17.5, 19]) {
  out.halo[z] = r2(J.radioDelHaloM(z, R, base.lat))
  out.minimoPx[z] = r2(J.radioMinimoDelHaloPx(z))
  for (const vista of ['3D', '2D']) {
    for (const [nombre, lista] of [['siete', SIETE], ['quince', QUINCE]]) {
      for (const yoP of [[1, 1], [-25, 5], [45, 0]]) {
        const otros = lista.map(([e, n]) => en(e, n))
        const yo = en(...yoP)
        const { fu, h } = mundo({ yo, otros, z, vista })
        const H = J.radioDelHaloM(z, R, base.lat)
        const f = vista === '3D' ? h.tres : h.dos
        const a = vista === '3D' ? fu.peanaM : Math.max(fu.peanaM, F.radioDeMonedaM(POSTE, fu.monedas))
        const t = 100000
        const todos = [...otros.map((p, i) => ({ id: 'o' + i, real: p, dib: fu.dibujo('o' + i, t) })), { id: 'yo', real: yo, dib: fu.retratoPropio('yo', t) }]
        let sepMin = Infinity
        const dentroDib = []
        for (const x of todos) {
          out.casos += 1
          const d = m(x.real, C)
          const g = m(x.dib, C)
          const dentro = d <= R
          const ok = dentro ? g >= a - 0.05 && g <= Math.max(a, H - f) + 0.05 : g >= H + f - 0.05
          if (!ok) out.mal.push({ z, vista, nombre, yo: yoP, id: x.id, d: r2(d), g: r2(g), a: r2(a), H: r2(H), f: r2(f) })
          if (dentro && x.id !== 'yo') dentroDib.push(x.dib)
          if (x.id === 'yo' && m(fu.real('yo', t), yo) > 0.001) out.mal.push({ realMovido: true })
        }
        for (let i = 0; i < dentroDib.length; i++) for (let j = i + 1; j < dentroDib.length; j++) sepMin = Math.min(sepMin, m(dentroDib[i], dentroDib[j]))
        if (nombre === 'quince' && yoP[0] === 45) out.sepMinDentro[z + vista] = { sepM: r2(fu.separacionM), minimaM: r2(sepMin), anilloM: [r2(a), r2(Math.max(a, H - f))] }
      }
    }
  }
}
out.mal = out.mal.slice(0, 8)
process.stdout.write(JSON.stringify(out))

// 23/11 (Óscar: «personajes planos NUNCA»): con SIEMPRE_EN_TRES_D todos los disponibles van en 3D, el tope sólo reparte cuerpos
// completos y baratos. Lógica pura de lodAvatares.ts; vuelca un JSON a tests/test_siempre_tres_d.py.
const path = require('path')
const RAIZ = path.resolve(__dirname, '..', '..')
const { crearCargador } = require('./cargarTs.cjs')
const externo = (n) => {
  throw new Error('import no permitido en un módulo puro: ' + n)
}
const cargarDe = crearCargador({ Math, Number, String, Array, Set, Map, Boolean, Object, JSON, Infinity, Error, isFinite: Number.isFinite }, { externo })
const L = cargarDe(path.join(RAIZ, 'frontend', 'src', 'player', 'avatares3d', 'mixamo', 'lodAvatares.ts'))
const cand = (clave, distancia, o = {}) => ({ clave, esYo: false, distancia, disponible: true, ...o })
const out = {}
const quince = [cand('yo', 999, { esYo: true }), ...Array.from({ length: 14 }, (_, i) => cand('j' + i, i + 1))]

out.constante = L.SIEMPRE_EN_TRES_D
const q = {}
for (const c of ['baja', 'media', 'alta']) {
  const s = L.elegirEnTresD(quince, c)
  q[c] = { tresD: s.tresD.length, baratos: s.baratos.length, porTope: s.porTope.length, completos: s.tresD.length - s.baratos.length - 1 }
}
out.quince = q
// el modo antiguo sigue ahí para comparar
const viejo = L.elegirEnTresD(quince, 'baja', undefined, false)
out.viejo = { tresD: viejo.tresD.length, porTope: viejo.porTope.length, baratos: viejo.baratos.length }
// sin modelo: no ocupa plaza ni cuenta (sigue con su retrato hasta que cargue)
out.sinModelo = L.elegirEnTresD([cand('a', 1, { disponible: false }), cand('b', 2)], 'baja').tresD
// quien anda gana a quien está quieto algo más cerca
out.andaGana = L.elegirEnTresD([cand('quieto', 10), cand('anda', 14, { seMueve: true })], 'baja', 1).tresD
// los baratos son los más lejanos
out.baratos = L.elegirEnTresD(quince, 'baja').baratos
// trato del cuerpo
const t = (o) => L.tratoDelCuerpo({ esYo: false, barato: false, parado: false, rango: 5, calidad: 'media', ...o })
out.trato = {
  yo: t({ esYo: true, barato: true, parado: true }),
  primero: t({ rango: 0 }),
  completoAndando: t({}),
  completoParado: t({ parado: true }),
  baratoAndando: t({ barato: true }),
  baratoParado: t({ barato: true, parado: true }),
  baratoBaja: t({ barato: true, calidad: 'baja' }),
}
// el recorte por tareas largas: nunca por debajo de uno y devuelve un cuerpo a las dos ventanas buenas
const tp = new L.TopePorTareasLargas()
const ev = []
let ms = 0
tp.tope(6, ms)
for (let w = 0; w < 4; w++) {
  tp.anotar(4000)
  ms += 5000
  ev.push(tp.tope(6, ms))
}
for (let w = 0; w < 6; w++) {
  ms += 5000
  ev.push(tp.tope(6, ms))
}
out.largas = ev
console.log(JSON.stringify(out))

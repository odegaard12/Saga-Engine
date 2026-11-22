// Ejecuta en Node apartarDelNodo.ts (módulo puro) con unos casos y vuelca un JSON para tests/test_nodo_cubo_y_apartado.py.
const path = require('path')
const vm = require('vm')
const RAIZ = path.resolve(__dirname, '..', '..')
const { transpilar } = require('./cargarTs.cjs')
const fuente = path.join(RAIZ, 'frontend', 'src', 'player', 'avatares3d', 'mixamo', 'apartarDelNodo.ts')
const js = transpilar(fuente)
const m = { exports: {} }
vm.runInNewContext(js, { module: m, exports: m.exports, Math })
const A = m.exports
const poste = { x: 1000, y: 1000 }
const r = (av, rumbo = 0, apartado = false, postes = [poste]) => A.apartarDelPoste(av, postes, rumbo, apartado)
console.log(JSON.stringify({
  constantes: { HISTERESIS: A.HISTERESIS_CUADRANTE_GRADOS, APARTA_PX: A.APARTA_PX, VUELVE_PX: A.VUELVE_PX, LADO_PX: A.LADO_PX, DELANTE_PX: A.DELANTE_PX },
  encima: r({ x: 1000, y: 1000 }),
  cerca: r({ x: 1020, y: 990 }),
  lejos: r({ x: 1060, y: 1000 }),
  sinPostes: r({ x: 1000, y: 1000 }, 0, false, []),
  // En la franja 40-48 px: no entra si estaba fuera, no sale si ya estaba apartado.
  franjaFuera: r({ x: 1044, y: 1000 }),
  franjaDentro: r({ x: 1044, y: 1000 }, 0, true),
  girado90: r({ x: 1000, y: 1000 }, Math.PI / 2),
  masCercano: r({ x: 1030, y: 1000 }, 0, false, [poste, { x: 1035, y: 1000 }]),
  // 20/11: dos cuerpos junto al mismo poste no acaban en el mismo punto; y el cuadrante de la cámara, con margen.
  dosA: r({ x: 1010, y: 1000 }),
  dosB: r({ x: 990, y: 1000 }),
  detras: r({ x: 1000 - 20, y: 1000 - 20 }),
  cuadrantes: [[0, 0], [50, 0], [60, 0], [170, 0], [130, 180], [120, 180], [-80, 0], [359, 270]].map(([g, p]) => A.cuadranteDeLaCamara(g, p)),
}))

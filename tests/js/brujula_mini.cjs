// Prueba las funciones puras de la mini brújula (player/utils/sinMapa.ts). Salida: JSON con los casos.
const path = require('path')
const vm = require('vm')
const RAIZ = path.resolve(__dirname, '..', '..')
const { transpilar } = require('./cargarTs.cjs')
const js = transpilar(path.join(RAIZ, 'frontend', 'src', 'player', 'utils', 'sinMapa.ts'))
const m = { exports: {} }
vm.runInNewContext(js, { module: m, exports: m.exports, Math, Number, String })
const { giroCorto, giroDeLaFlecha, rumboEntre, formatoDistancia } = m.exports
const r = (x) => Math.round(x * 10) / 10
console.log(JSON.stringify({
  corto: [giroCorto(350, 10), giroCorto(10, 350), giroCorto(0, 180), giroCorto(720, 90), giroCorto(-10, 0)],
  // El nodo al este (90°) con el mapa girado 90°: arriba en pantalla. Con el mapa a 0, a la derecha.
  flecha: [giroDeLaFlecha(90, 90), giroDeLaFlecha(90, 0), giroDeLaFlecha(10, 30)],
  rumbo: [r(rumboEntre({ lat: 42, lon: -8 }, { lat: 42.01, lon: -8 })), r(rumboEntre({ lat: 42, lon: -8 }, { lat: 42, lon: -7.99 }))],
  distancia: [formatoDistancia(253, 'es'), formatoDistancia(1234, 'gl'), formatoDistancia(999.6, 'es')],
}))

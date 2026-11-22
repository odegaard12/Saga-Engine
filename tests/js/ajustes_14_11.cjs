// 14/11 (auditoría de ajustes): lógica pura de los arreglos del jugador y del panel, en Node con un navegador de mentira.
// Imprime un JSON que comprueba tests/test_ajustes_14_11.py.
const path = require('path')
const RAIZ = path.resolve(__dirname, '..', '..')
const FRONT = path.join(RAIZ, 'frontend', 'src')
const { crearCargador } = require('./cargarTs.cjs')

function modulo(rel, extra = {}) {
  const sandbox = { console, setTimeout, clearTimeout, Date, URLSearchParams, ...extra }
  sandbox.globalThis = sandbox
  return crearCargador(sandbox)(path.join(FRONT, rel))
}
const almacen = (datos) => ({ getItem: (k) => (k in datos ? datos[k] : null) })
const res = {}

// 5) La batería baja de AYER no cuenta; la de hace un momento sí; lo manual manda.
{
  const m = modulo('player/components/conmutadoresMapa.ts', { window: {}, document: {}, navigator: {} })
  const ahora = Date.now()
  res.ahorro = {
    sinMarca: m.ahorroActivo(almacen({ 'saga:bateria-baja': '1' })),
    deAyer: m.ahorroActivo(almacen({ 'saga:bateria-baja': '1', 'saga:bateria-baja-t': String(ahora - 24 * 3600 * 1000) })),
    reciente: m.ahorroActivo(almacen({ 'saga:bateria-baja': '1', 'saga:bateria-baja-t': String(ahora - 60 * 1000) })),
    manualSi: m.ahorroActivo(almacen({ 'saga:ahorro-bateria': '1' })),
    manualNoGanaALaBateria: m.ahorroActivo(almacen({ 'saga:ahorro-bateria': '0', 'saga:bateria-baja': '1', 'saga:bateria-baja-t': String(ahora) })),
  }
}

// 4/19) Un campo vacío o con letras NO es 0; con número se recorta al rango.
{
  const { leerNumero } = modulo('admin/lib/leerNumero.ts')
  res.numero = [leerNumero('', 0, 365), leerNumero('  ', 0, 365), leerNumero('abc', 0, 365), leerNumero('0', 0, 365), leerNumero('7.6', 0, 365), leerNumero('999', 0, 365), leerNumero('-5', 0, 365)]
}

// 15) Los textos por defecto del panel salen del mismo JSON que el servidor.
{
  const { TEXTOS_POR_DEFECTO } = modulo('shared/textosPorDefecto.ts')
  res.defectos = TEXTOS_POR_DEFECTO
}
console.log(JSON.stringify(res))

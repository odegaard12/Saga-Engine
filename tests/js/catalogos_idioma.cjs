// 22/11/2026: un solo sistema de idioma. Recorre los catálogos tipados del jugador y compara es con gl: misma forma,
// ningún texto vacío y ninguna función de un lado que en el otro sea texto. Lo comprueba tests/test_idioma_unico.py.
'use strict'
const { crearEntorno } = require('./entorno_navegador.cjs')

const ent = crearEntorno()
const cat = (ruta) => ent.cargar(ruta)

const i18n = cat('src/i18n/index.ts')
const pantallas = cat('src/player/components/textosDePantallas.ts')
const juegos = cat('src/player/minigames/core/textos.ts')
const logica = cat('src/player/minigames/families/logica/textos.ts')
const eco = cat('src/player/minigames/families/sequenceCode/textos.ts')
const tienda = cat('src/player/avatares3d/mixamo/textosTienda.ts')
const base = cat('src/player/playerAppBase.ts')

const pares = {
  'i18n.messages': [i18n.messages.es, i18n.messages.gl],
  TEXTOS_DE_PANTALLAS: [pantallas.TEXTOS_DE_PANTALLAS.es, pantallas.TEXTOS_DE_PANTALLAS.gl],
  TEXTOS_DEL_JUGADOR: [juegos.TEXTOS_DEL_JUGADOR.es, juegos.TEXTOS_DEL_JUGADOR.gl],
  textosDeLogica: [logica.textosDeLogica('es'), logica.textosDeLogica('gl')],
  textosDeEco: [eco.textosDeEco('es'), eco.textosDeEco('gl')],
  TEXTOS_TIENDA: [tienda.TEXTOS_TIENDA.es, tienda.TEXTOS_TIENDA.gl],
  TEXTOS_MENU_GESTOS: [tienda.TEXTOS_MENU_GESTOS.es, tienda.TEXTOS_MENU_GESTOS.gl],
  NOTICES: [base.NOTICES.es, base.NOTICES.gl],
}
for (const [clave, porIdioma] of Object.entries(juegos.JUEGOS_EN_UNA_LINEA)) {
  pares[`JUEGOS_EN_UNA_LINEA.${clave}`] = [porIdioma.es, porIdioma.gl]
}

const tipo = (v) => (Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v)
const fallos = []
let hojas = 0

function comparar(ruta, es, gl) {
  if (tipo(es) !== tipo(gl)) {
    fallos.push(`${ruta}: es es ${tipo(es)} y gl es ${tipo(gl)}`)
    return
  }
  if (typeof es === 'string') {
    hojas += 1
    if (!es.trim() || !gl.trim()) fallos.push(`${ruta}: texto vacío`)
    return
  }
  if (typeof es === 'function') {
    hojas += 1
    if (es.length !== gl.length) fallos.push(`${ruta}: es pide ${es.length} datos y gl ${gl.length}`)
    return
  }
  if (es && typeof es === 'object') {
    const claves = new Set([...Object.keys(es), ...Object.keys(gl)])
    for (const k of claves) {
      if (!(k in es)) fallos.push(`${ruta}.${k}: falta en es`)
      else if (!(k in gl)) fallos.push(`${ruta}.${k}: falta en gl`)
      else comparar(`${ruta}.${k}`, es[k], gl[k])
    }
  }
}

for (const [nombre, [es, gl]] of Object.entries(pares)) comparar(nombre, es, gl)

process.stdout.write(JSON.stringify({ hojas, catalogos: Object.keys(pares).length, fallos }))

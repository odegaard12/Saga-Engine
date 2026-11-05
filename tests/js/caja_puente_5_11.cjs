// 5/11/2026: el puente de idioma devolvía la caja del diccionario («Punto de control» salía «PUNTO DE CONTROL»).
// Ejecuta conSuCaja de src/i18n/legacySpanishBridge.ts tal cual. Lo comprueba tests/test_textos_5_11.py.
'use strict'
const { crearEntorno } = require('./entorno_navegador.cjs')

const m = crearEntorno().cargar('src/i18n/legacySpanishBridge.ts')
process.stdout.write(
  JSON.stringify({
    frase: m.conSuCaja('Punto de control', 'PUNTO DE CONTROL'),
    minus: m.conSuCaja('punto de control', 'PUNTO DE CONTROL'),
    mayus: m.conSuCaja('PUNTO DE CONTROL', 'Punto de control'),
    igual: m.conSuCaja('Herramientas', 'Ferramentas'),
  })
)

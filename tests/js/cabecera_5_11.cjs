// 5/11/2026: la cabecera pequeña del juego se oculta si repite el título. Lo comprueba tests/test_propuestas_5_11.py.
'use strict'
const { crearEntorno } = require('./entorno_navegador.cjs')

const m = crearEntorno().cargar('src/player/minigames/core/cabecera.ts')
process.stdout.write(
  JSON.stringify({
    igual: m.cabeceraRepetida('PULSO DE HIERRO', 'Pulso de hierro'),
    tildes: m.cabeceraRepetida('CARGAR ANTENA', 'Cargar antena!'),
    distinto: m.cabeceraRepetida('PULSO DE HIERRO', 'La fuente vieja'),
    vacio: m.cabeceraRepetida('', ''),
  })
)

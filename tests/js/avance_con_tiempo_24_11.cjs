// 24/11/2026: «+1 nodo» con el tiempo jugado. Ejecuta lib/ajusteDeTiempo.ts tal cual y vuelca en JSON lo que lee; lo
// comprueba tests/test_avance_con_tiempo_24_11.py.
'use strict'

const { crearEntorno } = require('./entorno_navegador.cjs')

const m = crearEntorno().cargar('src/admin/lib/ajusteDeTiempo.ts')
const salida = { leidos: {}, malos: {} }

for (const t of ['2:54', '02:54', '174', '0:05', '30:00', ' 1:30 ', "1'30", '1.30']) salida.leidos[t] = m.leerTiempoDeNodo(t)
for (const t of ['', '0', '0:00', '-2:54', '2:60', '1.5', '30:01', '1801', '2:5', 'abc', '2:54:10', '1e3', '12345'])
  salida.malos[t] = m.leerTiempoDeNodo(t)
salida.etiqueta = [174, 5, 1800].map((s) => m.relojDeSegundos(s))
salida.tecleado = ['', '5', '54', '254', '0254', '1234', '123456'].map((c) => m.tecleadoATexto(c))

process.stdout.write(JSON.stringify(salida))

// 24/11/2026: el rumbo es del JUGADOR y del MUNDO (fuente de posición): quien no se mueve no gira aunque caduque el rumbo del
// servidor (20 s, con latidos cada 30), se orbite, cambie la calidad o se rehaga su cuerpo. Lo comprueba tests/test_rumbo_estable_24_11.py.
'use strict'
const { crearEntorno } = require('./entorno_navegador.cjs')
const e = crearEntorno()
const F = e.cargar('src/player/posicion/fuentePosicion.ts')
const L = e.cargar('src/player/avatares3d/mixamo/lodAvatares.ts')
const p = { lat: 42.6915, lon: -8.7182 }
const out = {}
// 1. Quieto: llega con rumbo 90 y después el servidor lo manda sin rumbo (caducado) una y otra vez.
{
  const f = new F.FuentePosicion()
  f.fijar('A', 'jugador', p, 0, { precisionM: 8, heading: 90 })
  const vistos = [f.rumbo('A', 100)]
  for (let t = 5000; t <= 300000; t += 5000) { f.fijar('A', 'jugador', p, t, { precisionM: 8, heading: null }); f.calcular(t); vistos.push(f.rumbo('A', t + 1)) }
  out.caducado = { distintos: [...new Set(vistos)], n: vistos.length }
  // un rumbo nuevo del jugador SÍ lo cambia
  f.fijar('A', 'jugador', p, 305000, { precisionM: 8, heading: 200 })
  out.nuevo = f.rumbo('A', 305001)
}
// 2. Sin rumbo del móvil: anda al este, se para; minutos después conserva el rumbo con el que llegó.
{
  const f = new F.FuentePosicion()
  const mLon = 111320 * Math.cos((p.lat * Math.PI) / 180)
  let t = 0
  for (let i = 0; i <= 30; i++, t += 2000) { f.fijar('B', 'jugador', { lat: p.lat, lon: p.lon + (i * 6) / mLon }, t, { precisionM: 5 }); f.rumbo('B', t + 1) }
  const andando = f.rumbo('B', t)
  const vistos = []
  for (let k = 0; k < 40; k++, t += 5000) { f.fijar('B', 'jugador', { lat: p.lat, lon: p.lon + 180 / mLon }, t, { precisionM: 5 }); vistos.push(f.rumbo('B', t + 1)) }
  out.parado = { andando: Math.round(andando), despues: [...new Set(vistos.map((x) => (x === null ? null : Math.round(x))))] }
}
// 3. Nunca tuvo rumbo: null (la capa pone el de reposo), y la firma no admite cámara ni calidad.
{
  const f = new F.FuentePosicion()
  f.fijar('C', 'jugador', p, 0, { precisionM: 8 })
  out.sinDato = f.rumbo('C', 60000)
  out.aridad = F.FuentePosicion.prototype.rumbo.length
}
// 4. El giro del motor sale sólo del rumbo: 90° → π/2, sin dato → reposo (norte).
out.giro = { este: L.giroDelMotor(90), norte: L.giroDelMotor(0), nulo: L.giroDelMotor(null), reposo: L.RUMBO_DE_REPOSO, aridad: L.giroDelMotor.length }
process.stdout.write(JSON.stringify(out))

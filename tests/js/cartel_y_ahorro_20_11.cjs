'use strict'
const { crearEntorno } = require('./entorno_navegador.cjs')
const e = crearEntorno()
const L = e.cargar('src/player/avatares3d/mixamo/lodAvatares.ts')
const A = e.cargar('src/player/components/ahorroPorFps.ts')
const C = e.cargar('src/player/components/conmutadoresMapa.ts')
const deg = (r) => Math.round((r * 180) / Math.PI)
const wrap = (d) => ((d % 360) + 540) % 360 - 180
const out = {}
// Cartel: jugador mirando al SO (225) con la cámara a 0/90/180/270 grados de bearing
out.cartel = [0, 90, 180, 270].map((b) => { const o = L.orientacionDelCartel(225, (b * Math.PI) / 180); return { b, rotY: deg(o.rotY), espejo: o.espejo, relMundo: wrap(deg(o.rotY) - deg(Math.PI - (225 * Math.PI) / 180)) } })
// Mirando a la cámara exactamente: rotY = -bearing (de cara), sin espejo y sin giro
out.deCara = [0, 90].map((b) => { const bearing = (b * Math.PI) / 180; const rumbo = (b + 180) % 360; const o = L.orientacionDelCartel(rumbo, bearing); return { b, rumbo, rotY: deg(o.rotY), espejo: o.espejo } })
out.sinRumbo = L.orientacionDelCartel(null, 0)
// 359 -> 1 grados: nunca da vuelta de 358
out.cruce = [359, 1].map((r) => deg(L.orientacionDelCartel(r, 0).rotY))
// Con el mismo rumbo y la cámara girando, el cartel cambia de lado en pantalla (no es siempre -bearing)
out.noSiempreACamara = [0, 30, 60, 90].map((b) => deg(L.orientacionDelCartel(90, (b * Math.PI) / 180).rotY + (b * Math.PI) / 180))
// Vigilante de fps
const v1 = new A.VigilanteDeFps(); let dispara = 0; for (let t = 0; t < 40000; t += 100) if (v1.muestra(100, 10, true)) dispara += 1
out.fpsBajosDisparaUnaVez = dispara
const v2 = new A.VigilanteDeFps(); let d2 = 0; for (let t = 0; t < 120000; t += 100) if (v2.muestra(100, 10 + ((t / 100) % 50 === 0 ? 20 : 0), true)) d2 += 1
out.picoNoReinicia = d2   // un pico aislado (media 30 un solo paso) no reinicia: 18 <= 30, sí reinicia (>= umbral+margen)
const v3 = new A.VigilanteDeFps(); let d3 = 0; for (let t = 0; t < 120000; t += 100) if (v3.muestra(100, 40, true)) d3 += 1
out.fpsBuenosNunca = d3
const v4 = new A.VigilanteDeFps(); let d4 = 0; for (let t = 0; t < 120000; t += 100) if (v4.muestra(100, 10, false)) d4 += 1
out.siNoEstaEnLaCalidadMinimaNunca = d4
const v5 = new A.VigilanteDeFps(); let d5 = 0; for (let t = 0; t < 120000; t += 100) if (v5.muestra(500, 10, true)) d5 += 1
out.pausasLargasNoCuentan = d5
// Almacén
const mem = (o) => ({ getItem: (k) => (k in o ? o[k] : null), setItem: (k, v) => { o[k] = String(v) } })
const ahora = Date.now()
out.ahorro = {
  nada: C.ahorroActivo(mem({})),
  fpsVigente: C.ahorroActivo(mem({ 'saga:fps-bajos': '1', 'saga:fps-bajos-t': String(ahora) })),
  fpsCaducado: C.ahorroActivo(mem({ 'saga:fps-bajos': '1', 'saga:fps-bajos-t': String(ahora - 31 * 60000) })),
  manualNoGanaALosFps: C.ahorroActivo(mem({ 'saga:ahorro-bateria': '0', 'saga:fps-bajos': '1', 'saga:fps-bajos-t': String(ahora) })),
  manualSi: C.ahorroActivo(mem({ 'saga:ahorro-bateria': '1' })),
  bateria: C.ahorroActivo(mem({ 'saga:bateria-baja': '1', 'saga:bateria-baja-t': String(ahora) })),
  automatico: [C.ahorroEnAutomatico(mem({})), C.ahorroEnAutomatico(mem({ 'saga:ahorro-bateria': '0' })), C.ahorroEnAutomatico(mem({ 'saga:ahorro-bateria': '1' }))],
}
const al = {}; C.anotarFpsBajos(mem(al), 1234); out.anotado = al
console.log(JSON.stringify(out))

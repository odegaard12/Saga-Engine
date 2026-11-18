// 20/11/2026: el cuerpo 3D mira según el móvil (brújula quieto, rumbo GPS andando), no según la cámara; y anda sólo si se mueve.
'use strict'
const { crearEntorno } = require('./entorno_navegador.cjs')
const e = crearEntorno()
const L = e.cargar('src/player/avatares3d/mixamo/lodAvatares.ts')
const R = e.cargar('src/player/avatares/rumboPropio.ts')
const ruta = (vx, vy, seg) => { const m = []; for (let t = 0; t <= seg * 1000; t += 200) m.push({ t, x: 100 + (vx * t) / 1000, y: 100 + (vy * t) / 1000 }); return m }
const out = {}
// estadoDeMarcha: quieto, ruido, andando al este (x crece) y al sur (y crece en Mercator)
out.quieto = L.estadoDeMarcha(ruta(0, 0, 4), 4000)
out.ruido = L.estadoDeMarcha(ruta(0.2, 0, 4), 4000)
const este = L.estadoDeMarcha(ruta(1.4, 0, 4), 4000)
out.este = { andando: este.andando, rumbo: Math.round(este.rumbo) }
const norte = L.estadoDeMarcha(ruta(0, -1.4, 4), 4000)
out.norte = { andando: norte.andando, rumbo: Math.round(norte.rumbo) }
// rumboDelCuerpo: quieto + brújula SO (225) -> 225 aunque la cámara gire (no es un parámetro); andando al este -> 90
const q = { brujula: 225, gps: 10, andando: false, ultimo: 33 }
out.quietoBrujulaSO = R.rumboDelCuerpo(q)
out.camaraNoEntra = [0, 90, 180].map(() => R.rumboDelCuerpo(q))
out.andandoEste = R.rumboDelCuerpo({ brujula: 225, gps: 90, andando: true, ultimo: 33 })
out.sinBrujulaConGps = R.rumboDelCuerpo({ brujula: null, gps: 120, andando: false, ultimo: 33 })
out.sinNada_ultimo = R.rumboDelCuerpo({ brujula: null, gps: null, andando: false, ultimo: 33 })
out.sinNadaDeNada = R.rumboDelCuerpo({ brujula: null, gps: null, andando: false, ultimo: null })
out.reposoNorte = L.RUMBO_DE_REPOSO
// brújula: 359 -> 1 sin dar la vuelta de 358 grados; zona muerta; caducidad; eventos iOS/Android
R.olvidarRumboPropio(); R.anotarBrujula(359, 0); R.anotarBrujula(1, 100)
const b = R.brujulaVigente(150); out.cruce359a1 = Math.round(b); out.cruceSinVuelta = b > 350 || b < 10
R.olvidarRumboPropio(); R.anotarBrujula(100, 0); R.anotarBrujula(102, 50); out.zonaMuerta = R.brujulaVigente(60)
out.caduca = R.brujulaVigente(5000)
out.iOS = R.rumboDeEvento({ webkitCompassHeading: 225 }); out.android = R.rumboDeEvento({ absolute: true, alpha: 135 }); out.sinDato = R.rumboDeEvento({ absolute: false, alpha: 10 })
// latido: quieto con brújula -> brújula; andando -> GPS
R.olvidarRumboPropio(); R.anotarRumboPropio(90, 0); R.anotarBrujula(225, 0)
out.latidoQuieto = R.rumboParaLatido(500); R.anotarAndandoPropio(true); out.latidoAndando = R.rumboParaLatido(500)
console.log(JSON.stringify(out))

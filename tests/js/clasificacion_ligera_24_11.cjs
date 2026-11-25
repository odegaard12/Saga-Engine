// 24/11/2026: clasificación ligera. La tabla por campos (equipoPorDiferencias.ts), la firma de la hoja (rankingVivo.ts)
// y tu fila sin cobertura (clasificacion.ts `tuFila`). Ejecuta los módulos TS tal cual; lo comprueba
// tests/test_clasificacion_ligera_24_11.py. Entrada opcional (stdin): {user, rondas} para fusionar rondas de un servidor.
'use strict'

const fs = require('fs')
const { crearEntorno } = require('./entorno_navegador.cjs')

const ent = crearEntorno()
const e = ent.cargar('src/player/offline/equipoPorDiferencias.ts')
const v = ent.cargar('src/player/components/rankingVivo.ts')
const c = ent.cargar('src/player/components/clasificacion.ts')

const base = (user, extra = {}) => ({
  user, display_name: user, presence: 'live', last_seen: 100, lat: 40, lon: -3, heading: 90, level: 1,
  total_time_ms: 60000, finished: false, total_nodes: 4, finished_at: null, color: '#22c55e', ...extra,
})

function fusion() {
  const a = base('A'), b = base('B'), cc = base('C', { presence: 'stale', pos_at: 50 })
  const t0 = e.fusionarEquipo(null, { epoca: 'x', rev: 3, completo: true, campos: true, profiles: [a, b, cc] })
  // B se mueve; C vuelve a estar en línea (pierde pos_at); A no cambia.
  const t1 = e.fusionarEquipo(t0, {
    epoca: 'x', rev: 5, completo: false, campos: true,
    profiles: [{ user: 'B', lat: 40.001, last_seen: 130 }, { user: 'C', presence: 'live', last_seen: 131, quitar: ['pos_at'] }],
  })
  const conYo0 = e.conIsSelf(t0.perfiles, 'A')
  const conYo1 = e.conIsSelf(t1.perfiles, 'A')
  // Sin `campos` (servidor viejo) una entrada sustituye a la anterior entera, como siempre.
  const viejo = e.fusionarEquipo(t0, { epoca: 'x', rev: 6, completo: false, profiles: [{ user: 'B', lat: 1 }] })
  // Una respuesta que llega tarde no hace retroceder la tabla.
  const tarde = e.fusionarEquipo(t1, { epoca: 'x', rev: 4, completo: false, campos: true, profiles: [{ user: 'B', lat: 0 }] })
  return {
    b: t1.perfiles[1],
    c: t1.perfiles[2],
    aMismoObjeto: t1.perfiles[0] === t0.perfiles[0],
    conYoMismoA: conYo1[0] === conYo0[0],
    conYoNuevoB: conYo1[1] !== conYo0[1],
    isSelf: conYo1.map((p) => p.is_self),
    viejoB: viejo.perfiles[1],
    tardeMismo: tarde === t1,
  }
}

function firma() {
  const l = [base('A'), base('B')]
  const movido = [base('A', { lat: 41, lon: -4, heading: 10, last_seen: 999 }), base('B')]
  return {
    igualAlMoverse: v.firmaDeLaHoja(l) === v.firmaDeLaHoja(movido),
    cambiaConElTiempo: v.firmaDeLaHoja(l) !== v.firmaDeLaHoja([base('A', { total_time_ms: 61000 }), base('B')]),
    cambiaConLaPresencia: v.firmaDeLaHoja(l) !== v.firmaDeLaHoja([base('A', { presence: 'offline' }), base('B')]),
    cambiaConLaFoto: v.firmaDeLaHoja(l) !== v.firmaDeLaHoja([base('A', { avatar_ref: '/api/player-avatar/A?v=1' }), base('B')]),
    mismaListaMismaCadena: v.firmaDeLaHoja(l) === v.firmaDeLaHoja(l),
  }
}

function sinCobertura() {
  // El servidor te vio en el nodo 2 con 100 s; sin red superas el 3 y el móvil suma lo que tardaste (160 s).
  const yo = base('YO', { level: 2, total_time_ms: 100000, character: 'peregrino' })
  const payload = { user: 'YO', display_name: 'Yo', level: 3, finished: false, live_status: { total_time_ms: 160000 }, stages: [1, 2, 3, 4] }
  const sinRed = c.tuFila(yo, payload)
  // Vuelve la red: el servidor ya sabe el nodo 3 y su total (158 s) manda.
  const conRed = c.tuFila({ ...yo, level: 3, total_time_ms: 158000 }, payload)
  // Nunca latió (primera carga sin red): todo del móvil.
  const sinLatido = c.tuFila(undefined, payload)
  const otros = [base('R1', { level: 3, total_time_ms: 159000 }), base('R2', { level: 3, total_time_ms: 150000 })]
  const orden = (fila) => c.ordenarClasificacion([...otros, fila]).map((j) => j.user)
  return {
    sinRed: [sinRed.total_time_ms, sinRed.level, sinRed.presence, sinRed.character],
    conRed: conRed.total_time_ms,
    sinLatido: [sinLatido.total_time_ms, sinLatido.total_nodes],
    ordenSinRed: orden(sinRed),
    ordenConRed: orden(conRed),
  }
}

function empates() {
  // Mismo nodo y tiempo: desempata la hora de fin, luego el nombre y el id (nada que cambie con cada latido).
  const fin = (u, at, extra = {}) => base(u, { level: 4, finished: true, total_time_ms: 90000, finished_at: at, ...extra })
  const t0 = e.fusionarEquipo(null, {
    epoca: 'x', rev: 1, completo: true, campos: true, profiles: [fin('B', 2000), fin('A', 2000), fin('C', 1000), base('D')],
  })
  const antes = c.ordenarClasificacion(e.conIsSelf(t0.perfiles, 'D')).map((j) => j.user)
  // Sólo se mueven (lat/last_seen): el orden no cambia.
  const t1 = e.fusionarEquipo(t0, {
    epoca: 'x', rev: 2, completo: false, campos: true,
    profiles: [{ user: 'A', lat: 1, last_seen: 500 }, { user: 'B', lat: 2, last_seen: 400 }],
  })
  return { antes, despues: c.ordenarClasificacion(e.conIsSelf(t1.perfiles, 'D')).map((j) => j.user) }
}

const salida = {}
for (const [n, f] of Object.entries({ fusion, firma, sinCobertura, empates })) {
  try {
    salida[n] = f()
  } catch (err) {
    salida[n] = { __error: String((err && err.stack) || err) }
  }
}

// Rondas reales de un servidor (las manda la prueba de Python): las tablas fusionadas, para compararlas con la completa.
const crudo = fs.readFileSync(0, 'utf8')
if (crudo.trim()) {
  const entrada = JSON.parse(crudo)
  let estado = null
  salida.tablas = []
  salida.pidenCompleta = []
  for (const team of entrada.rondas) {
    estado = e.fusionarEquipo(estado, team)
    salida.pidenCompleta.push(estado === null)
    salida.tablas.push(estado ? e.conIsSelf(estado.perfiles, team.user || entrada.user) : null)
  }
}
console.log(JSON.stringify(salida))

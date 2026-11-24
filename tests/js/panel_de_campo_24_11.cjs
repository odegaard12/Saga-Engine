// 24/11/2026: el panel de campo (dirección B). Ejecuta lib/campo.ts tal cual y vuelca en JSON lo que decide; lo comprueba
// tests/test_panel_de_campo_24_11.py.
'use strict'

const { crearEntorno } = require('./entorno_navegador.cjs')

const m = crearEntorno().cargar('src/admin/lib/campo.ts')
const salida = {}

// Grupos de arriba: atención = sin conexión, atascado o señal floja.
salida.grupos = ['sin_conexion', 'atascado', 'senal_floja', 'normal', 'terminado'].map((a) => m.grupoDe(a))
salida.cuenta = m.contarGrupos([{ grupo: 'ruta' }, { grupo: 'ruta' }, { grupo: 'atencion' }, { grupo: 'fin' }])

// Agrupar por nodo con el mapa alejado; de cerca, todos sueltos.
const p = (id, nivel, extra = {}) => ({ id, lat: 42 + nivel / 1000, lon: -8, nivel, terminado: false, atencion: 'normal', ...extra })
const puntos = [p('A', 3), p('B', 3, { atencion: 'sin_conexion' }), p('C', 4), p('D', 9, { terminado: true }), p('E', 9, { terminado: true })]
const lejos = m.agruparPorNodo(puntos, m.ZOOM_PARA_AGRUPAR - 1)
const cerca = m.agruparPorNodo(puntos, m.ZOOM_PARA_AGRUPAR)
salida.racimos = {
  lejosSueltos: lejos.sueltos.map((x) => x.id),
  lejosRacimos: lejos.racimos.map((r) => [r.clave, r.ids, r.peor]),
  cercaSueltos: cerca.sueltos.length,
  cercaRacimos: cerca.racimos.length,
  zoom: m.ZOOM_PARA_AGRUPAR,
}

// Gravedad y frase de cada aviso, con los números de su prueba y el nodo como lo ve el organizador.
const stages = [{ id: 951, index: 0 }, { id: 952, index: 1 }, { id: 955, index: 2 }, { id: 956, index: 3 }]
const frase = (reason, evidence, severity) => m.fraseDeAviso({ reason, at: 1, evidence, severity }, stages)
salida.frases = {
  velocidad: frase('impossible_travel_speed', { speed_kmh: 61.2, distance_m: 840.4, elapsed_s: 49.4 }),
  rapido: frase('completion_faster_than_possible', { node_id: 955, time_spent_ms: 2100, min_plausible_ms: 6000 }),
  lejos: frase('proximity_far_from_node', { node_id: 956, distancia_minima_m: 410, tolerancia_m: 75, precision_m: 12 }),
  futuro: frase('offline_event_timestamp_in_future', { node_id: 951, ahead_ms: 340000 }),
  salio: frase('salio_app', { node_id: 952 }),
  respuesta: frase('evidence_answer_mismatch', { node_id: 952 }),
  desconocido: frase('algo_nuevo', {}),
  sinNodo: frase('salio_app', { node_id: 999 }),
}
salida.gravedad = [
  m.gravedadDe({ reason: 'impossible_travel_speed', at: 1 }),
  m.gravedadDe({ reason: 'salio_app', at: 1, severity: 'suspicion' }),
  m.gravedadDe({ reason: 'proximity_no_gps', at: 1, severity: 'info' }),
  m.gravedadDe({ reason: 'evidence_missing', at: 1 }),
]

// La lista de avisos: más reciente primero; «para revisar» con alta delante; lo revisado aparte (también lo de aquí).
const jugadores = [
  { user: 'A', display_name: 'Ana', suspicions: [{ reason: 'salio_app', at: 300 }, { reason: 'impossible_travel_speed', at: 100 }, { reason: 'proximity_no_gps', at: 50, severity: 'info' }] },
  { user: 'B', display_name: 'Beto', suspicions: [{ reason: 'completion_faster_than_possible', at: 200, revisada_en: 999, revisada_como: 'penalizado' }] },
]
const lista = m.avisosDeCampo(jugadores, new Set(['A|300|salio_app']))
salida.avisos = {
  orden: lista.map((a) => a.clave),
  revisar: m.filtrarAvisos(lista, 'revisar').map((a) => a.clave),
  notas: m.filtrarAvisos(lista, 'notas').map((a) => a.clave),
  revisados: m.filtrarAvisos(lista, 'revisados').map((a) => a.clave),
  cuenta: m.contarAvisos(lista),
}

salida.letras = [m.dosLetras('Faro'), m.dosLetras('Marta Rivas'), m.dosLetras('lobo', ''), m.dosLetras('X', 'zq'), m.dosLetras('')]
salida.tinta = [m.tintaClara('#0b1222'), m.tintaClara('#f4d03f'), m.tintaClara('rojo')]
salida.hace = [m.haceCuanto(6.4), m.haceCuanto(180), m.haceCuanto(7300)]

process.stdout.write(JSON.stringify(salida))

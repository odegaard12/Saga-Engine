// 24/11/2026 (panel 2): avisos agrupados por jugador y motivo, ordenados por confianza y con «Ver más». Ejecuta
// lib/campo.ts tal cual y vuelca en JSON lo que decide; lo comprueba tests/test_panel2_antitrampas_24_11.py.
'use strict'

const { crearEntorno } = require('./entorno_navegador.cjs')

const m = crearEntorno().cargar('src/admin/lib/campo.ts')
const salida = {}
const stages = [{ id: 'n1', index: 0 }, { id: 'n2', index: 1 }, { id: 'n3', index: 2 }]

const jugadores = [
  {
    user: 'Ana',
    display_name: 'Ana',
    suspicions: [
      { reason: 'proximity_no_gps_rescue', at: 10, evidence: { node_id: 'n1' }, severity: 'suspicion' },
      { reason: 'proximity_no_gps_rescue', at: 20, evidence: { node_id: 'n2' }, severity: 'suspicion' },
      { reason: 'proximity_no_gps_rescue', at: 30, evidence: { node_id: 'n3' }, severity: 'suspicion' },
      { reason: 'proximity_no_gps_rescue', at: 40, evidence: { node_id: 'n3' }, severity: 'suspicion' },
      { reason: 'proximity_no_gps', at: 5, evidence: { node_id: 'n1' }, severity: 'info' },
    ],
  },
  { user: 'Beto', display_name: 'Beto', suspicions: [{ reason: 'node_to_node_too_fast', at: 1, evidence: { confianza: 0.99 } }] },
  { user: 'Ciro', display_name: 'Ciro', suspicions: [{ reason: 'node_to_node_too_fast', at: 50, evidence: { confianza: 0.55 } }] },
  {
    user: 'Dani',
    display_name: 'Dani',
    suspicions: [1, 2, 3].map((at) => ({ reason: 'organizer_advance', at, evidence: { nodos: 1 }, severity: 'info' })),
  },
  { user: 'Eva', display_name: 'Eva', suspicions: [{ reason: 'organizer_advance', at: 4, severity: 'info' }] },
  { user: 'Fran', display_name: 'Fran', suspicions: [{ reason: 'salio_app', at: 6, revisada_en: 9, revisada_como: 'revisado' }] },
]
const grupos = m.agruparAvisos(m.avisosDeCampo(jugadores), stages)
const porClave = Object.fromEntries(grupos.map((g) => [g.clave, g]))
const rescate = porClave['Ana|proximity_no_gps_rescue']
salida.rescate = {
  veces: rescate.veces,
  nodos: rescate.nodos,
  gravedad: rescate.gravedad,
  resumen: m.resumenDeGrupo(rescate),
  confianza: rescate.confianza,
}
const rescates = (n) => [{ user: 'Z', display_name: 'Z', suspicions: Array.from({ length: n }, (_, i) => ({ reason: 'proximity_no_gps_rescue', at: i })) }]
salida.seis_rescates = m.agruparAvisos(m.avisosDeCampo(rescates(6)))[0].gravedad
salida.un_rescate = m.agruparAvisos(m.avisosDeCampo(rescates(1)))[0].gravedad
salida.gravedades = Object.fromEntries(grupos.map((g) => [g.clave, g.gravedad]))
salida.orden = m.filtrarGrupos(grupos, 'revisar').map((g) => g.clave)
salida.cuenta = m.contarGruposDeAvisos(grupos)

const quince = Array.from({ length: 15 }, (_, i) => ({ user: `J${i}`, display_name: `J${i}`, suspicions: [{ reason: 'salio_app', at: i }] }))
const muchos = m.filtrarGrupos(m.agruparAvisos(m.avisosDeCampo(quince)), 'revisar')
salida.muchos = { tarjetas: muchos.length, de_entrada: muchos.slice(0, m.TARJETAS_DE_ENTRADA).length }

salida.frases = {
  nodo: m.fraseDeAviso(
    { reason: 'node_to_node_too_fast', at: 1, evidence: { prev_node_id: 'n1', node_id: 'n2', distance_m: 950, elapsed_s: 60, speed_kmh: 57 } },
    stages
  ).frase,
  sin_cifras: m.fraseDeAviso({ reason: 'node_to_node_too_fast', at: 1, evidence: { distance_m: null } }, stages).frase,
  rescate: m.fraseDeAviso({ reason: 'proximity_no_gps_rescue', at: 1, evidence: { node_id: 'n2', motivo: 'gps_rendido' } }, stages).frase,
}
salida.minYs = [m.minYs(45), m.minYs(60), m.minYs(200)]

process.stdout.write(JSON.stringify(salida))

// 5/11/2026: la Guía que sabe en qué estás (versión C). Ejecuta src/player/guia/guia.ts tal cual con una entrada por
// estado del inventario y devuelve, por estado, lo que dice en cada idioma. Lo comprueba tests/test_guia_5_11.py.
'use strict'
const { crearEntorno } = require('./entorno_navegador.cjs')

const m = crearEntorno().cargar('src/player/guia/guia.ts')

const base = {
  terminada: false,
  horaDeInicio: null,
  motivo: 'out_of_range',
  distancia: 1200,
  radio: 35,
  numero: 4,
  juego: 'pulso',
  esQr: false,
  esColeccionable: false,
  objeto: '',
  enLinea: true,
  pendientes: 0,
  enJuego: null,
  respaldo: '1 min',
}

const casos = {
  antes_de_empezar: { horaDeInicio: '18:30' },
  camino_lejos: {},
  camino_cerca: { distancia: 90 },
  mapa_mudo: { juego: 'mapa_mudo', distancia: 300 },
  dentro_del_radio: { motivo: 'within_radius', distancia: 10 },
  reglas: { motivo: 'within_radius', enJuego: 'reglas' },
  jugando: { motivo: 'within_radius', enJuego: 'jugando' },
  qr: { motivo: 'within_radius', esQr: true, juego: 'qr' },
  coleccionable: { motivo: 'free_entry', esColeccionable: true, juego: 'coleccionable' },
  falta_objeto: { motivo: 'missing_item', objeto: 'la llave de hierro' },
  sin_gps: { motivo: 'gps_unavailable', distancia: null },
  gps_rendido: { motivo: 'gps_rendido', distancia: null },
  sin_red: { enLinea: false, pendientes: 2 },
  terminada: { terminada: true, motivo: 'finished', terminados: 3, total: 5 },
  esperando_nodo: { motivo: 'missing_stage' },
}

const salida = { estados: {}, extra: {} }
for (const [nombre, cambios] of Object.entries(casos)) {
  const e = { ...base, ...cambios }
  salida.estados[nombre] = {
    estado: m.estadoDeLaGuia(e),
    es: m.textoDeLaGuia(e, 'es'),
    gl: m.textoDeLaGuia(e, 'gl'),
    en: m.textoDeLaGuia(e, 'en'),
  }
}

// Sin red pero sin nada pendiente: no es un estado (se sigue diciendo el camino).
salida.extra.sinRedSinPendientes = m.estadoDeLaGuia({ ...base, enLinea: false, pendientes: 0 })
// En un juego manda el juego aunque no haya red.
salida.extra.jugandoSinRed = m.estadoDeLaGuia({ ...base, enJuego: 'jugando', enLinea: false, pendientes: 3 })
salida.extra.unPendiente = m.textoDeLaGuia({ ...base, enLinea: false, pendientes: 1 }, 'es').ahora
salida.extra.todosTerminados = m.textoDeLaGuia({ ...base, terminada: true, terminados: 5, total: 5 }, 'gl').despues
salida.extra.notas = m.notasDeLaGuia({ ahorro: true, estrellas: 7 }, 'gl')
salida.extra.sinNotas = m.notasDeLaGuia({ ahorro: false, estrellas: 0 }, 'es')

// Qué juego hay en cada nodo, con las mismas reglas que FamilyRuntimeHost.
const nodo = (tipo, cfg, extra) => ({ id: 'n', type: tipo, minigame: { type: tipo, config: cfg }, ...extra })
salida.claves = {
  pulso: m.claveDeJuego(nodo('motion_challenge', { game_id: 'pulso_hierro' })),
  dinamo: m.claveDeJuego(nodo('motion_challenge', { objective: 'shake_charge' })),
  matriz: m.claveDeJuego(nodo('circuit_matrix', {})),
  balanza: m.claveDeJuego(nodo('circuit_matrix', { game_id: 'balanza' })),
  relevo: m.claveDeJuego(nodo('signal_hunt', { game_id: 'team_relay' })),
  control: m.claveDeJuego(nodo('signal_hunt', { game_id: 'simple_checkpoint' })),
  mapa_mudo: m.claveDeJuego(nodo('signal_hunt', { game_id: 'mapa_mudo' }, { kind: 'mapa_mudo' })),
  trampa: m.claveDeJuego(nodo('word_trap', {})),
  qr: m.claveDeJuego(nodo('circuit_matrix', {}), { esQr: true }),
  coleccionable: m.claveDeJuego(nodo('circuit_matrix', {}), { esColeccionable: true }),
  ninguno: m.claveDeJuego(null),
}
salida.reglas = {}
for (const clave of ['matriz', 'balanza', 'relevo', 'pulso']) {
  salida.reglas[clave] = { es: m.juegoEnSuIdioma(clave, 'es'), gl: m.juegoEnSuIdioma(clave, 'gl'), en: m.juegoEnSuIdioma(clave, 'en') }
}

process.stdout.write(JSON.stringify(salida))

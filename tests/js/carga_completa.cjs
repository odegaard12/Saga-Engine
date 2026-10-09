// Escenarios de la carga offline: qué decide, qué baja y qué NO baja.
//
// Ejecuta los módulos TS del jugador (frontend/src/player/offline, versionGuard,
// sw.js...) contra un navegador y un servidor de mentira (ver
// entorno_navegador.cjs y servidor_falso.cjs) y vuelca en JSON lo que pasó. Lo
// usa tests/test_la_carga_completa.py, que es quien sabe lo que tiene que salir.
//
// Uso: node tests/js/carga_completa.cjs [escenario...]   (imprime un JSON)
'use strict'

const fs = require('fs')
const path = require('path')
const vm = require('vm')
const { crearEntorno, FRONT, ErrorDeDominio } = require('./entorno_navegador.cjs')
const { ServidorFalso } = require('./servidor_falso.cjs')

const pausa = (ms) => new Promise((r) => setTimeout(r, ms))

/* ------------------------------------------------------------------ *
 * Ayudas
 * ------------------------------------------------------------------ */

function mundo() {
  const e = crearEntorno()
  const srv = new ServidorFalso()
  e.servidor = (url, init) => srv.manejar(url, init)
  return {
    e,
    srv,
    carga: e.cargar('src/player/offline/cargaCompleta.ts'),
    pack: e.cargar('src/player/offline/missionPack.ts'),
    motor: e.cargar('src/player/offline/motorDeCarga.ts'),
    mapa: e.cargar('src/player/offline/mapTileCache.ts'),
  }
}

/** Opciones de `cargarTodo` que apuntan lo que se le enseñó a la pantalla. */
function opciones(modo, extra = {}) {
  const vistas = []
  return {
    vistas,
    opts: {
      modo,
      playerUrl: '/player/TEST',
      alCambiar: (estado, detalle) => vistas.push({ estado: estado ? clonar(estado) : null, detalle }),
      cancelado: () => false,
      entrarIgualmente: () => false,
      payloadEnPantalla: () => null,
      ...extra,
    },
  }
}

const clonar = (x) => JSON.parse(JSON.stringify(x))

function pantallaVista(vistas) {
  return vistas.some((v) => v.estado !== null)
}

/** Peticiones a la red que cumplen algo, desde una marca. */
function contar(e, desde, predicado) {
  return e.peticiones.slice(desde).filter(predicado).length
}

const esArchivoDeApp = (p) => p.ruta.startsWith('/assets/')
const esTesela = (p) => p.ruta.startsWith('/map-tiles/') || p.ruta.startsWith('/dem-tiles/')
const esLote = (p) => p.ruta === '/api/teselas/lote'
const esPaquete = (p) => p.ruta.startsWith('/api/game/') && p.busqueda.includes('offline_pack=true')
const esGrafo = (p) => p.ruta === '/api/road-graph'
const esFotoDeCampo = (p) => p.ruta.startsWith('/api/field-proofs/')

const resumenDeMapa = (e) => {
  try {
    return JSON.parse(e.local.getItem('saga:offline-map-tiles:v3'))
  } catch {
    return null
  }
}

/* ------------------------------------------------------------------ *
 * Funciones puras
 * ------------------------------------------------------------------ */

async function revisiones() {
  const e = crearEntorno()
  const rev = e.cargar('src/player/offline/revisiones.ts')
  const nodo = (extra) => ({ id: 1, success: { conditions: [] }, ...extra })
  const pack = (sobre) => ({
    mission_revision: 'R1',
    payload: { stages: [nodo()], stages_rev: 'H1', offline_pack: true },
    ...sobre,
  })
  const ligero = (sobre) => ({ stages: [{ id: 1 }], stages_rev: 'H1', mission_revision: 'R1', ...sobre })

  const mision = {
    sinPaquete: rev.evaluarMision({ pack: null, ligero: ligero() }),
    igual: rev.evaluarMision({ pack: pack(), ligero: ligero() }),
    otraRevision: rev.evaluarMision({ pack: pack(), ligero: ligero({ mission_revision: 'R2' }) }),
    sinRevisionGuardada: rev.evaluarMision({ pack: pack({ mission_revision: undefined }), ligero: ligero() }),
    servidorSinRevisionMismaHuella: rev.evaluarMision({
      pack: pack(),
      ligero: ligero({ mission_revision: undefined }),
    }),
    servidorSinRevisionOtraHuella: rev.evaluarMision({
      pack: pack(),
      ligero: ligero({ mission_revision: undefined, stages_rev: 'H2' }),
    }),
    servidorSinNingunaHuella: rev.evaluarMision({
      pack: pack(),
      ligero: ligero({ mission_revision: undefined, stages_rev: undefined }),
    }),
    revisionDeLaConfig: rev.evaluarMision({
      pack: pack(),
      ligero: ligero({ mission_revision: undefined }),
      config: { mission_revision: 'R1' },
    }),
    paqueteLigero: rev.evaluarMision({
      pack: pack({ payload: { stages: [{ id: 1 }], stages_rev: 'H1' } }),
      ligero: ligero(),
    }),
    faltaLaFoto: rev.evaluarMision({
      pack: pack({
        payload: {
          stages: [nodo({ minigame: { config: { image_url: '/media/nodo/x.webp' } } })],
          stages_rev: 'H1',
        },
      }),
      ligero: ligero(),
    }),
    conLaFoto: rev.evaluarMision({
      pack: pack({
        payload: {
          stages: [
            nodo({ minigame: { config: { image_url: '/media/nodo/x.webp', image_data_url: 'data:image/webp;base64,AA' } } }),
          ],
          stages_rev: 'H1',
        },
      }),
      ligero: ligero(),
    }),
    otroNumeroDeNodos: rev.evaluarMision({
      pack: pack(),
      ligero: ligero({ stages: [{ id: 1 }, { id: 2 }] }),
    }),
  }

  const puntos = [
    { lat: 42.5, lon: -8.7 },
    { lat: 42.512, lon: -8.712 },
  ]
  const firmas = {
    base: rev.firmaDePuntos(puntos),
    igual: rev.firmaDePuntos(puntos.map((p) => ({ ...p }))),
    movido10m: rev.firmaDePuntos([puntos[0], { lat: puntos[1].lat + 0.0001, lon: puntos[1].lon }]),
    anadido: rev.firmaDePuntos([...puntos, { lat: 42.52, lon: -8.72 }]),
    ruidoDeComa: rev.firmaDePuntos([puntos[0], { lat: puntos[1].lat + 1e-9, lon: puntos[1].lon }]),
  }

  const resumen = { firma: 'p', firma_ruta: 'F1', completo: true }
  const mapa = {
    sinResumen: rev.evaluarMapaPorResumen({ resumen: null, firmaRutaActual: 'F1' }),
    igual: rev.evaluarMapaPorResumen({ resumen, firmaRutaActual: 'F1' }),
    otraRuta: rev.evaluarMapaPorResumen({ resumen, firmaRutaActual: 'F2' }),
    sinFirmaDeRuta: rev.evaluarMapaPorResumen({ resumen: { completo: true }, firmaRutaActual: 'F1' }),
    incompleto: rev.evaluarMapaPorResumen({ resumen: { ...resumen, completo: false }, firmaRutaActual: 'F1' }),
  }

  const dia = 24 * 3600 * 1000
  const ahora = Date.UTC(2026, 8, 30, 12, 0, 0)
  const hace = (dias) => new Date(ahora - dias * dia).toISOString()
  const bueno = (dias) => ({ ...pack(), downloaded_at: hace(dias) })
  const loGuardado = {
    reciente: rev.evaluarLoGuardado({ pack: bueno(1), ahoraMs: ahora, app: { faltan: 0, sinLista: false }, mapa: { estado: 'ok' } }),
    viejo: rev.evaluarLoGuardado({ pack: bueno(4), ahoraMs: ahora, app: { faltan: 0, sinLista: false }, mapa: { estado: 'ok' } }),
    faltanArchivos: rev.evaluarLoGuardado({ pack: bueno(1), ahoraMs: ahora, app: { faltan: 3, sinLista: false }, mapa: { estado: 'ok' } }),
    mapaIncompleto: rev.evaluarLoGuardado({ pack: bueno(1), ahoraMs: ahora, app: { faltan: 0, sinLista: false }, mapa: { estado: 'incompleto' } }),
    paqueteLigero: rev.evaluarLoGuardado({
      pack: { ...bueno(1), payload: { stages: [{ id: 1 }], stages_rev: 'H1' } },
      ahoraMs: ahora,
      app: null,
      mapa: null,
    }),
    sinPaquete: rev.evaluarLoGuardado({ pack: null, ahoraMs: ahora, app: null, mapa: null }),
  }

  const nivel = (n) => ({ level: n, current_stage: { id: 'n' + n } })
  const reconciliacion = (args) => {
    const r = rev.reconciliacionDelNivel(args)
    return { base: r.base ? r.base.level : null, permitirBajar: r.permitirBajar }
  }
  const niveles = {
    conColaPendienteManda_elMovil: rev.mantenerNivel(nivel(4), nivel(2), false).level,
    respuestaVieja_noBaja: rev.mantenerNivel(nivel(4), nivel(3), false).level,
    reseteo_baja: rev.mantenerNivel(nivel(4), nivel(0), true).level,
    sube: rev.mantenerNivel(nivel(2), nivel(3), false).level,
    sinBase: rev.mantenerNivel(null, nivel(2), false).level,
    reconc_colaPendiente: reconciliacion({ pendientes: 2, huboReset: false, alArrancar: true, enPantalla: nivel(4), guardada: nivel(3) }),
    reconc_colaYSinPantalla: reconciliacion({ pendientes: 2, huboReset: false, alArrancar: true, enPantalla: null, guardada: nivel(3) }),
    reconc_arranqueSinCola: reconciliacion({ pendientes: 0, huboReset: false, alArrancar: true, enPantalla: null, guardada: nivel(3) }),
    reconc_enJuegoSinCola: reconciliacion({ pendientes: 0, huboReset: false, alArrancar: false, enPantalla: nivel(4), guardada: nivel(3) }),
    reconc_reseteo: reconciliacion({ pendientes: 5, huboReset: true, alArrancar: false, enPantalla: nivel(4), guardada: nivel(3) }),
  }

  const respaldo = { site_name: 'SAGA', story_text: 'Elige jugador para continuar.', players: ['A'], player_profiles: [] }
  const buena = { site_name: 'SAGA', story_text: 'Texto', mission_launch_at: '2026-10-01T10:00', player_theme: 'flame-red' }
  const config = {
    respaldoEsRespaldo: rev.esConfigDeRespaldo(respaldo),
    vaciaEsRespaldo: rev.esConfigDeRespaldo({}),
    nullEsRespaldo: rev.esConfigDeRespaldo(null),
    buenaNoEsRespaldo: rev.esConfigDeRespaldo(buena),
    respaldoNoPisaLaBuena: rev.elegirConfigParaGuardar(respaldo, buena) === buena,
    laBuenaGana: rev.elegirConfigParaGuardar(buena, respaldo) === buena,
    sinNadaBueno: Object.keys(rev.elegirConfigParaGuardar(respaldo, null)).length === 0,
  }

  const muestra = rev.muestraDeTeselas(Array.from({ length: 1000 }, (_, i) => '/t/' + i), 24)
  const teselas = {
    n: muestra.length,
    incluyeLaUltima: muestra.includes('/t/999'),
    incluyeLaPrimera: muestra.includes('/t/0'),
    pocas: rev.muestraDeTeselas(['/a', '/b'], 24).length,
  }

  return { mision, firmas: clonar(firmas), mapa, loGuardado, niveles, config, teselas }
}

async function reloj() {
  const e = crearEntorno()
  const r = e.cargar('src/player/offline/relojDelServidor.ts')
  const MIN = 60 * 1000
  const DIA = 24 * 60 * MIN

  // La salida es a las 12:00; el paquete es de hace tres días y ahora son las 12:05.
  const salida = Date.UTC(2026, 9, 1, 12, 0, 0)
  const ahora = salida + 5 * MIN
  const muestraVieja = { serverTimeMs: salida - 3 * DIA, recibidoEnMs: salida - 3 * DIA + 1000 }

  const desdeLaVieja = r.horaDelServidorAhora(muestraVieja, ahora)
  // El cálculo de antes: offset = server_time_ms - Date.now() en el momento de pintar.
  const offsetDeAntes = muestraVieja.serverTimeMs - ahora
  const faltabaAntes = salida - (ahora + offsetDeAntes)

  const fresca = { serverTimeMs: 1_800_000_000_000, recibidoEnMs: 5_000_000 }
  const pasado1min = r.horaDelServidorAhora(fresca, fresca.recibidoEnMs + MIN)
  const conElMovilDesviado = r.horaDelServidorAhora(
    { serverTimeMs: 1_800_000_000_000, recibidoEnMs: 1_800_000_000_000 - 2 * MIN },
    1_800_000_000_000 - 2 * MIN + 10_000
  )

  // Una muestra más nueva sustituye a la anterior; una vieja no.
  const a = r.registrarHoraDelServidor(1_800_000_100_000, 100)
  const b = r.registrarHoraDelServidor(1_800_000_200_000, 200)
  const c = r.registrarHoraDelServidor(1_800_000_050_000, 300) // hora de servidor anterior
  const guardada = r.leerMuestraDeReloj()

  return {
    tresDiasDespues: { fuente: desdeLaVieja.fuente, ms: desdeLaVieja.ms, ahora },
    faltabaAntes: faltabaAntes, // "2d 23h": el fallo
    faltaAhora: salida - desdeLaVieja.ms,
    fresca1min: { fuente: pasado1min.fuente, ms: pasado1min.ms, esperado: fresca.serverTimeMs + MIN },
    conElMovilDesviado: {
      fuente: conElMovilDesviado.fuente,
      // El servidor va 2 min por delante del móvil.
      adelantoSobreElMovil: conElMovilDesviado.ms - (1_800_000_000_000 - 2 * MIN + 10_000),
    },
    movilQueRetrocede: r.horaDelServidorAhora(fresca, fresca.recibidoEnMs - 1000).fuente,
    sinMuestra: r.horaDelServidorAhora(null, 123).fuente,
    registro: {
      primera: a.serverTimeMs,
      mas_nueva_sustituye: b.serverTimeMs,
      mas_vieja_no_pisa: c.serverTimeMs,
      guardada: guardada.serverTimeMs,
    },
    horaInvalida: r.registrarHoraDelServidor('no', 1) === null || r.registrarHoraDelServidor('no', 1).serverTimeMs === 1_800_000_200_000,
  }
}

async function almacenamiento() {
  const e = crearEntorno()
  const a = e.cargar('src/player/offline/almacenamiento.ts')
  const est = (libre) => ({ persistente: true, usoBytes: 1, cuotaBytes: 1, libreBytes: libre })
  return {
    cuota: {
      nombre: a.esErrorDeCuota({ name: 'QuotaExceededError' }),
      firefox: a.esErrorDeCuota({ name: 'NS_ERROR_DOM_QUOTA_REACHED' }),
      codigo22: a.esErrorDeCuota({ code: 22 }),
      mensaje: a.esErrorDeCuota(new Error('The quota has been exceeded')),
      otro: a.esErrorDeCuota(new Error('boom')),
      nulo: a.esErrorDeCuota(null),
    },
    espacio: {
      justo: a.evaluarEspacio(est(100 * 1024 * 1024)),
      sobra: a.evaluarEspacio(est(2 * 1024 * 1024 * 1024)),
      desconocido: a.evaluarEspacio({ persistente: null, usoBytes: null, cuotaBytes: null, libreBytes: null }),
    },
    formato: {
      mb: a.formatearBytes(143 * 1024 * 1024),
      gb: a.formatearBytes(2.1 * 1024 * 1024 * 1024),
      nulo: a.formatearBytes(null),
    },
  }
}

async function persistencia() {
  const e = crearEntorno()
  const a = e.cargar('src/player/offline/almacenamiento.ts')
  const llamadas = []
  e.sandbox.navigator.storage = {
    persisted: async () => false,
    persist: async () => {
      llamadas.push('persist')
      return true
    },
    estimate: async () => ({ usage: 200 * 1024 * 1024, quota: 4 * 1024 * 1024 * 1024 }),
  }
  const concedido = await a.pedirAlmacenamientoPersistente()
  const estado = await a.estadoDelAlmacenamiento()

  const e2 = crearEntorno()
  const a2 = e2.cargar('src/player/offline/almacenamiento.ts')
  e2.sandbox.navigator.storage = { persisted: async () => false, persist: async () => false, estimate: async () => ({ usage: 1, quota: 2 }) }
  const denegado = await a2.pedirAlmacenamientoPersistente()

  const e3 = crearEntorno()
  const a3 = e3.cargar('src/player/offline/almacenamiento.ts')
  const sinSoporte = await a3.pedirAlmacenamientoPersistente()

  return { concedido, llamadas, estado, denegado, sinSoporte }
}

/* ------------------------------------------------------------------ *
 * El motor: qué baja y en qué orden
 * ------------------------------------------------------------------ */

async function motor() {
  const e = crearEntorno()
  const m = e.cargar('src/player/offline/motorDeCarga.ts')

  const llamadas = []
  const parte = (id, pendiente, opciones = {}) => ({
    id,
    async comprobar() {
      llamadas.push('comprobar:' + id)
      if (opciones.rompeAlComprobar) throw new Error('no se pudo mirar')
      return { pendiente, motivo: pendiente ? 'incompleto' : null, detalle: id }
    },
    async descargar(avanzar) {
      llamadas.push('inicio:' + id)
      avanzar({ hecho: 1, total: 2, detalle: 'mitad' })
      if (opciones.tarda) await pausa(opciones.tarda)
      llamadas.push('fin:' + id)
      return opciones.falla ? { ok: false, error: 'fallo de ' + id } : { ok: true }
    },
  })

  const resultado = {}

  // Nada pendiente: no hay pantalla ni descarga.
  let partes = [parte('app', false), parte('mision', false), parte('mapa', false)]
  let estado = await m.comprobarPartes(partes)
  resultado.nadaPendiente = { hayQueBajar: m.hayQueBajar(estado), todoListo: m.todoListo(estado) }
  resultado.descargasSinNada = llamadas.filter((l) => l.startsWith('inicio:')).length

  // Sólo la app: sólo se baja la app.
  llamadas.length = 0
  partes = [parte('app', true), parte('mision', false), parte('mapa', false)]
  estado = await m.comprobarPartes(partes)
  const final = await m.descargarPartes(partes, estado)
  resultado.soloLaApp = {
    inicios: llamadas.filter((l) => l.startsWith('inicio:')),
    estados: { app: final.app.estado, mision: final.mision.estado, mapa: final.mapa.estado },
    progresoDeLaApp: { hecho: final.app.hecho, total: final.app.total },
    todoListo: m.todoListo(final),
  }

  // El mapa espera a la misión.
  llamadas.length = 0
  partes = [parte('app', true), parte('mision', true, { tarda: 30 }), parte('mapa', true)]
  estado = await m.comprobarPartes(partes)
  await m.descargarPartes(partes, estado)
  resultado.ordenMisionMapa = {
    finMision_antes_de_inicioMapa: llamadas.indexOf('fin:mision') < llamadas.indexOf('inicio:mapa'),
    appNoEspera: llamadas.indexOf('inicio:app') < llamadas.indexOf('fin:mision'),
  }

  // Un fallo se queda como fallo y «Reintentar» lo reabre.
  llamadas.length = 0
  partes = [parte('app', false), parte('mision', false), parte('mapa', true, { falla: true })]
  estado = await m.comprobarPartes(partes)
  const fallado = await m.descargarPartes(partes, estado)
  const reabierto = m.reabrirFallidas(fallado)
  resultado.fallo = {
    estado: fallado.mapa.estado,
    error: fallado.mapa.error,
    algunaFallo: m.algunaFallo(fallado),
    sinCompletar: m.partesSinCompletar(fallado),
    reabierta: reabierto.mapa.estado,
    alDiaNoSeToca: reabierto.app.estado,
  }

  // Una comprobación que se rompe no da la parte por buena.
  partes = [parte('app', false, { rompeAlComprobar: true }), parte('mision', false), parte('mapa', false)]
  estado = await m.comprobarPartes(partes)
  resultado.comprobacionRota = { estado: estado.app.estado, hayQueBajar: m.hayQueBajar(estado) }

  // Cancelar (entrar igualmente) no espera a una descarga larga.
  llamadas.length = 0
  partes = [parte('app', true, { tarda: 400 }), parte('mision', false), parte('mapa', false)]
  estado = await m.comprobarPartes(partes)
  let cancelar = false
  setTimeout(() => (cancelar = true), 20)
  const t0 = Date.now()
  await m.descargarPartes(partes, estado, { cancelado: () => cancelar, cadaMs: 5 })
  resultado.cancelar = { esperoMenosDe200ms: Date.now() - t0 < 200 }

  // El porcentaje solo existe si se sabe cuánto queda.
  resultado.porcentaje = {
    sinTotal: m.porcentajeDeParte({ estado: 'descargando', hecho: 3, total: 0 }),
    mitad: m.porcentajeDeParte({ estado: 'descargando', hecho: 5, total: 10 }),
    alDia: m.porcentajeDeParte({ estado: 'al_dia', hecho: 0, total: 0 }),
  }

  // La lista final: App ✓ Misión ✓ Mapa ✓ Permisos ✓ Espacio ✓
  const listos = clonar(final)
  for (const id of ['app', 'mision', 'mapa']) listos[id].estado = 'listo'
  const todosLosPermisos = { gps: true, camara: true, movimiento: true, microfono: true }
  const lista = (args) => m.listaFinalDePreparacion(args).map((x) => x.id + ':' + x.ok)
  resultado.lista = {
    todoBien: lista({ partes: listos, permisos: todosLosPermisos, espacio: 'ok' }),
    completa: m.listaCompleta(m.listaFinalDePreparacion({ partes: listos, permisos: todosLosPermisos, espacio: 'ok' })),
    faltaElMicro: lista({ partes: listos, permisos: { ...todosLosPermisos, microfono: false }, espacio: 'ok' }),
    espacioAviso: lista({ partes: listos, permisos: todosLosPermisos, espacio: 'aviso' }),
    incompletaConFallo: m.listaCompleta(m.listaFinalDePreparacion({ partes: fallado, permisos: todosLosPermisos, espacio: 'ok' })),
    sinPartes: lista({ partes: null, permisos: todosLosPermisos, espacio: 'pendiente' }),
  }

  return resultado
}

/* ------------------------------------------------------------------ *
 * La carga entera: primera vez, sin cambios, y cada cosa que cambia
 * ------------------------------------------------------------------ */

async function cargaEntera() {
  const { e, srv, carga, pack } = mundo()
  const res = {}

  const resumenDe = (r) => ({
    cobertura: r.cobertura,
    faltan: r.faltan,
    huboPantalla: r.huboPantalla,
    estados: r.partes ? Object.fromEntries(Object.entries(r.partes).map(([k, v]) => [k, v.estado])) : null,
    motivos: r.partes ? Object.fromEntries(Object.entries(r.partes).map(([k, v]) => [k, v.motivo])) : null,
    nivel: r.payload ? r.payload.level : null,
    entroIgualmente: r.entroIgualmente,
  })

  /* 1. Primera vez: se baja todo, con pantalla. */
  let marca = e.peticiones.length
  let { opts, vistas } = opciones('entrada')
  let r = await carga.cargarTodo('TEST', opts)
  res.primeraVez = {
    ...resumenDe(r),
    pantalla: pantallaVista(vistas),
    archivosDeApp: contar(e, marca, esArchivoDeApp),
    lotes: contar(e, marca, esLote),
    paquetes: contar(e, marca, esPaquete),
    grafo: contar(e, marca, esGrafo),
    fotosDeCampo: contar(e, marca, esFotoDeCampo),
  }
  const guardado = await pack.getStoredMissionPack('TEST')
  const resumen = resumenDeMapa(e)
  res.primeraVez.paqueteGuardado = {
    revision: guardado && guardado.mission_revision,
    nodos: guardado && guardado.payload.stages.length,
    conFotoDentro: Boolean(guardado && guardado.payload.stages[1].minigame.config.image_data_url),
    tieneConfigRecibidaEn: typeof (guardado && guardado.config_recibida_en) === 'number',
  }
  res.primeraVez.mapa = resumen && {
    completo: resumen.completo,
    faltan: resumen.faltan,
    grafo: resumen.grafo,
    conFirmaDeRuta: Boolean(resumen.firma_ruta),
    pedidas: resumen.requested,
  }
  res.primeraVez.vecesQueSeVioLaPantalla = vistas.filter((v) => v.estado).length > 0
  res.totalDeTeselas = resumen && resumen.requested

  /* 2. Nada ha cambiado: entra sin pantalla y SIN BAJAR NADA. */
  marca = e.peticiones.length
  ;({ opts, vistas } = opciones('entrada'))
  r = await carga.cargarTodo('TEST', opts)
  res.sinCambios = {
    ...resumenDe(r),
    pantalla: pantallaVista(vistas),
    archivosDeApp: contar(e, marca, esArchivoDeApp),
    teselas: contar(e, marca, esTesela),
    lotes: contar(e, marca, esLote),
    paquetes: contar(e, marca, esPaquete),
    grafoBajado: contar(e, marca, (p) => esGrafo(p)),
    fotosDeCampo: contar(e, marca, esFotoDeCampo),
    peticionesTotales: e.peticiones.length - marca,
  }

  /* 3. El organizador cambió la misión (revisión nueva): baja SOLO la misión. */
  srv.revision = 'R2'
  marca = e.peticiones.length
  ;({ opts, vistas } = opciones('entrada'))
  r = await carga.cargarTodo('TEST', opts)
  const guardadoR2 = await pack.getStoredMissionPack('TEST')
  res.misionCambiada = {
    ...resumenDe(r),
    pantalla: pantallaVista(vistas),
    archivosDeApp: contar(e, marca, esArchivoDeApp),
    teselas: contar(e, marca, esTesela),
    lotes: contar(e, marca, esLote),
    paquetes: contar(e, marca, esPaquete),
    revisionGuardada: guardadoR2 && guardadoR2.mission_revision,
  }

  /* 4. Se mueve un nodo (y con él cambia la revisión): baja las teselas NUEVAS. */
  srv.revision = 'R3'
  srv.nodos[1] = { id: 2, lat: 42.6, lon: -8.6 } // ~15 km
  marca = e.peticiones.length
  ;({ opts, vistas } = opciones('entrada'))
  r = await carga.cargarTodo('TEST', opts)
  const resumenR3 = resumenDeMapa(e)
  res.nodoMovido = {
    ...resumenDe(r),
    pantalla: pantallaVista(vistas),
    archivosDeApp: contar(e, marca, esArchivoDeApp),
    teselasNuevas: contar(e, marca, esTesela) + contar(e, marca, esLote),
    lotes: contar(e, marca, esLote),
    grafoVueltoABajar: contar(e, marca, esGrafo),
    firmaDeRutaCambio: Boolean(resumenR3 && resumen && resumenR3.firma_ruta !== resumen.firma_ruta),
    completo: resumenR3 && resumenR3.completo,
    pedidasAhora: resumenR3 && resumenR3.requested,
  }

  /* 5. Un nodo NUEVO en la ruta. */
  srv.revision = 'R4'
  srv.nodos.push({ id: 3, lat: 42.7, lon: -8.5 })
  marca = e.peticiones.length
  ;({ opts, vistas } = opciones('entrada'))
  r = await carga.cargarTodo('TEST', opts)
  res.nodoAnadido = {
    ...resumenDe(r),
    pantalla: pantallaVista(vistas),
    mapaBajado: contar(e, marca, esLote) > 0,
    nodosGuardados: (await pack.getStoredMissionPack('TEST')).payload.stages.length,
  }

  /* 6. Versión nueva de la app (un paquete nuevo en la lista): baja SOLO ese. */
  srv.archivos = [...srv.archivos, '/assets/Nuevo-zzz.js']
  marca = e.peticiones.length
  ;({ opts, vistas } = opciones('entrada'))
  r = await carga.cargarTodo('TEST', opts)
  res.appNueva = {
    ...resumenDe(r),
    pantalla: pantallaVista(vistas),
    archivosBajados: e.peticiones.slice(marca).filter(esArchivoDeApp).map((p) => p.ruta),
    teselas: contar(e, marca, esTesela) + contar(e, marca, esLote),
    paquetes: contar(e, marca, esPaquete),
  }

  /* 7. El navegador vació la caché de teselas (iOS lo hace): se rehace el mapa. */
  e.caches.cachés.delete('saga-route-tile-coverage-v5.55-terrarium')
  marca = e.peticiones.length
  ;({ opts, vistas } = opciones('entrada'))
  r = await carga.cargarTodo('TEST', opts)
  res.cacheVaciada = {
    ...resumenDe(r),
    pantalla: pantallaVista(vistas),
    lotes: contar(e, marca, esLote),
    archivosDeApp: contar(e, marca, esArchivoDeApp),
    completo: resumenDeMapa(e).completo,
  }

  /* 8. Sin cobertura: entra con lo guardado y dice qué le pasa. */
  const ahoraReal = Date.now()
  const guardadoAntes = await pack.getStoredMissionPack('TEST')
  // Se envejece el paquete: cuatro días.
  const viejo = { ...guardadoAntes, downloaded_at: new Date(ahoraReal - 4 * 24 * 3600 * 1000).toISOString() }
  const bd = e.indexedDB.bases.get('saga-engine-offline-v1')
  bd.stores.get('mission_packs').filas.set(viejo.id, viejo)
  e.servidor = () => null // sin red
  marca = e.peticiones.length
  ;({ opts, vistas } = opciones('entrada'))
  r = await carga.cargarTodo('TEST', opts)
  res.sinCobertura = {
    cobertura: r.cobertura,
    hayPayload: Boolean(r.payload),
    nivel: r.payload && r.payload.level,
    pantalla: pantallaVista(vistas),
    loGuardado: r.loGuardado && {
      paqueteViejo: r.loGuardado.paqueteViejo,
      edadDias: r.loGuardado.edadDias,
      paqueteIncompleto: r.loGuardado.paqueteIncompleto,
      faltanArchivos: r.loGuardado.archivosDeAppQueFaltan,
      mapaIncompleto: r.loGuardado.mapaIncompleto,
      todoEnOrden: r.loGuardado.todoEnOrden,
    },
    peticionesAlServidorConDatos: contar(e, marca, (p) => p.ruta.startsWith('/assets/') || esTesela(p)),
  }

  /* 9. Sin cobertura Y sin nada guardado: no hay con qué entrar. */
  const vacio = mundo()
  vacio.e.servidor = () => null
  let error = null
  try {
    await vacio.carga.cargarTodo('TEST', opciones('entrada').opts)
  } catch (err) {
    error = String(err && err.message)
  }
  res.sinNadaDeNada = { lanzaError: error !== null }

  return res
}

/* ------------------------------------------------------------------ *
 * La configuración: la de respaldo no pisa a la buena (J8)
 * ------------------------------------------------------------------ */

async function configuracion() {
  const { e, srv, carga, pack } = mundo()
  const res = {}

  srv.conRevision = true
  let { opts } = opciones('entrada')
  await carga.cargarTodo('TEST', opts)
  const buena = (await pack.getStoredMissionPack('TEST')).config
  res.primera = { tieneTema: Boolean(buena.player_theme), tieneHora: typeof buena.server_time_ms === 'number' }

  // /api/config se cae (el resto del servidor va): se sigue con la guardada.
  srv.configCae = true
  const { opts: opts2 } = opciones('entrada')
  const r = await carga.cargarTodo('TEST', opts2)
  const despues = (await pack.getStoredMissionPack('TEST')).config
  res.configCaida = {
    configFresca: r.configFresca,
    temaConservado: r.config.player_theme,
    guardadaConservaElTema: despues.player_theme,
    guardadaConservaElTexto: despues.story_text,
    esLaDeRespaldo: r.config.story_text === 'Elige jugador para continuar.',
  }

  // saveMissionPack directo con la de respaldo.
  const respaldo = { site_name: 'SAGA', story_text: 'Elige jugador para continuar.', players: ['TEST'], player_profiles: [] }
  const payload = (await pack.getStoredMissionPack('TEST')).payload
  await pack.saveMissionPack({ user: 'TEST', config: respaldo, payload })
  const trasRespaldo = await pack.getStoredMissionPack('TEST')
  res.guardarRespaldo = {
    tema: trasRespaldo.config.player_theme,
    revisionConservada: trasRespaldo.mission_revision,
  }

  // Sin paquete previo ni copia: con red caída se usa el respaldo, pero NO se guarda.
  const limpio = mundo()
  limpio.srv.configCae = true
  const { opts: opts3 } = opciones('entrada')
  const r3 = await limpio.carga.cargarTodo('TEST', opts3)
  const guardadoLimpio = await limpio.pack.getStoredMissionPack('TEST')
  res.sinNadaBueno = {
    usaRespaldo: r3.config.story_text === 'Elige jugador para continuar.',
    seGuardoElRespaldo: Boolean(guardadoLimpio && guardadoLimpio.config.story_text === 'Elige jugador para continuar.'),
  }

  return res
}

/* ------------------------------------------------------------------ *
 * Las teselas: sólo las buenas, y los huecos se reintentan (J7)
 * ------------------------------------------------------------------ */

async function teselas() {
  const { e, srv, mapa } = mundo()
  const res = {}
  const stages = [
    { id: 1, lat: 42.5, lon: -8.7 },
    { id: 2, lat: 42.512, lon: -8.712 },
  ]

  res.validacion = {
    ok: mapa.respuestaDeTeselaValida({ ok: true, status: 200, tipo: 'image/png' }),
    error502: mapa.respuestaDeTeselaValida({ ok: false, status: 502, tipo: 'image/png' }),
    html: mapa.respuestaDeTeselaValida({ ok: true, status: 200, tipo: 'text/html' }),
    sinTipo: mapa.respuestaDeTeselaValida({ ok: true, status: 200, tipo: '' }),
    binario: mapa.respuestaDeTeselaValida({ ok: true, status: 200, tipo: 'application/octet-stream' }),
    json: mapa.respuestaDeTeselaValida({ ok: true, status: 200, tipo: 'application/json' }),
    vacia: mapa.respuestaDeTeselaValida({ ok: true, status: 200, tipo: 'image/png', bytes: 0 }),
  }

  const plan = mapa.planificarTeselas(stages)
  res.plan = { n: plan.urls.length, tieneRelieve: plan.urls.some((u) => u.startsWith('/dem-tiles/')), firma: Boolean(plan.firmaRuta) }

  // Falla el lote entero y la mitad de las teselas sueltas con un 502: no se guarda NINGÚN error.
  const malas = (ruta) => /\/(18|19)\//.test(ruta)
  srv.loteSinDatos = malas
  srv.teselaMala = malas
  let resumen = await mapa.prefetchMissionMapTiles(stages, undefined, {})
  const cacheDeTeselas = e.caches.contenido('saga-route-tile-coverage-v5.55-terrarium')
  res.conFallos = {
    completo: resumen.completo,
    faltan: resumen.faltan,
    guardadas502: cacheDeTeselas.filter(malas).length, // NINGUNA: un 502 no es una tesela
    guardadasBuenas: cacheDeTeselas.length,
    sinEspacio: Boolean(resumen.sin_espacio),
  }

  // Vuelve el servidor: los HUECOS se rellenan y solo se piden ellos.
  srv.loteSinDatos = () => false
  srv.teselaMala = () => false
  const marca = e.peticiones.length
  resumen = await mapa.prefetchMissionMapTiles(stages, undefined, {})
  const pedidasDeNuevo = e.peticiones.slice(marca).filter((p) => p.ruta.startsWith('/map-tiles/') || p.ruta.startsWith('/dem-tiles/')).length
  const lotesPedidos = e.peticiones.slice(marca).filter((p) => p.ruta === '/api/teselas/lote')
  const urlsEnLotes = lotesPedidos.reduce((n, p) => n + JSON.parse(String(p.cuerpo)).teselas.length, 0)
  res.huecosRellenados = {
    completo: resumen.completo,
    faltan: resumen.faltan,
    solicitadasEnLote: urlsEnLotes,
    guardadasAhora: e.caches.contenido('saga-route-tile-coverage-v5.55-terrarium').filter((u) => u !== '/api/edificios').length,
  }

  // 404 = «no existe»: no cuenta como hueco y no se vuelve a pedir.
  const otro = mundo()
  otro.srv.teselaAusente = (ruta) => /\/19\//.test(ruta)
  otro.srv.loteSinDatos = (ruta) => /\/19\//.test(ruta)
  let r2 = await otro.mapa.prefetchMissionMapTiles(stages, undefined, {})
  const m2 = otro.e.peticiones.length
  r2 = await otro.mapa.prefetchMissionMapTiles(stages, undefined, {})
  res.inexistentes = {
    completo: r2.completo,
    inexistentes: r2.inexistentes,
    segundaVuelta_peticionesDeTeselas: otro.e.peticiones.slice(m2).filter((p) => p.ruta.startsWith('/map-tiles/')).length,
  }

  // El lote no existe (servidor viejo): se baja de una en una y queda el paquete entero.
  const viejo = mundo()
  viejo.srv.loteRoto = true
  const r3 = await viejo.mapa.prefetchMissionMapTiles(stages, undefined, {})
  res.sinLote = {
    completo: r3.completo,
    guardadas: viejo.e.caches.contenido('saga-route-tile-coverage-v5.55-terrarium').filter((u) => u !== '/api/edificios').length,
    pedidas: r3.requested,
  }

  // Sin espacio: se dice, no se sigue y NO se da por listo.
  const lleno = mundo()
  lleno.e.cuota.cachePutFalla = true
  const r4 = await lleno.mapa.prefetchMissionMapTiles(stages, undefined, {})
  res.sinEspacio = { completo: r4.completo, sinEspacio: Boolean(r4.sin_espacio), faltan: r4.faltan > 0 }

  // Sin red de caminos en el servidor: no es un fallo.
  const sinGrafo = mundo()
  sinGrafo.srv.grafo = false
  const r5 = await sinGrafo.mapa.prefetchMissionMapTiles(stages, undefined, {})
  res.sinGrafo = { completo: r5.completo, grafo: r5.grafo }

  // La red de caminos se guarda ELLA sola (sin service worker al mando).
  res.grafoGuardado = { presente: e.caches.contenido('saga-road-graph-v2').includes('/api/road-graph') }

  return res
}

/* ------------------------------------------------------------------ *
 * La app: sólo se guarda lo que es lo que dice ser, y la cuota se cuenta
 * ------------------------------------------------------------------ */

async function app() {
  const { e, srv } = mundo()
  const pwa = e.cargar('src/player/offline/pwaShell.ts')
  const res = {}

  res.tipos = {
    js: pwa.contentTypeCuadra('/assets/x.js', 'application/javascript'),
    jsTextoPlano: pwa.contentTypeCuadra('/assets/x.js', 'text/plain'),
    jsTextJavascript: pwa.contentTypeCuadra('/assets/x.js', 'text/javascript; charset=utf-8'),
    jsPorHtml: pwa.contentTypeCuadra('/assets/x.js', 'text/html'),
    css: pwa.contentTypeCuadra('/assets/x.css', 'text/css'),
    cssPorHtml: pwa.contentTypeCuadra('/assets/x.css', 'text/html; charset=utf-8'),
    pagina: pwa.contentTypeCuadra('/', 'text/html'),
    paginaDelJugador: pwa.contentTypeCuadra('/player/X', 'text/html'),
    manifiesto: pwa.contentTypeCuadra('/manifest.webmanifest', 'application/manifest+json'),
    fuente: pwa.contentTypeCuadra('/assets/f.woff2', 'font/woff2'),
    fuentePorHtml: pwa.contentTypeCuadra('/assets/f.woff2', 'text/html'),
  }

  // Un paquete que el servidor sirve como HTML (salida de la SPA): NO se guarda.
  srv.assetsMalos.add('/assets/MapSurfaceGL-bbb.js')
  const progreso = []
  const informe = await pwa.descargarPaquetesDelJugador('/player/TEST', (p) => progreso.push(p), {})
  res.paqueteMalo = {
    completo: informe.completo,
    faltan: informe.faltan,
    guardado: e.caches.contenido('saga-player-shell').includes('/assets/MapSurfaceGL-bbb.js'),
    progresoMonotono: progreso.every((p, i) => i === 0 || p.hecho >= progreso[i - 1].hecho),
    ultimoProgreso: progreso.length && progreso[progreso.length - 1],
    sinEspacio: informe.sinEspacio,
  }

  // Ahora todo bien: los que ya estaban NO se vuelven a pedir.
  srv.assetsMalos.clear()
  let marca = e.peticiones.length
  const informe2 = await pwa.descargarPaquetesDelJugador('/player/TEST', undefined, {})
  res.arreglado = {
    completo: informe2.completo,
    archivosPedidos: e.peticiones.slice(marca).filter(esArchivoDeApp).map((p) => p.ruta),
    conLaListaGuardada: e.caches.contenido('saga-player-shell').includes('/player-precache.json'),
  }

  marca = e.peticiones.length
  const verificado = await pwa.verificarPaquetesDelJugador('/player/TEST')
  res.verificar = {
    completo: verificado.completo,
    guardados: verificado.guardados,
    total: verificado.total,
    archivosPedidos: e.peticiones.slice(marca).filter(esArchivoDeApp).length,
  }

  // Sin espacio: se cuenta, no se da por listo.
  const lleno = mundo()
  const pwa2 = lleno.e.cargar('src/player/offline/pwaShell.ts')
  lleno.e.cuota.cachePutFalla = true
  const informe3 = await pwa2.descargarPaquetesDelJugador('/player/TEST', undefined, {})
  res.sinEspacio = { completo: informe3.completo, sinEspacio: informe3.sinEspacio }

  // El worker no se pide nada al instalarse: la app no le manda bajar cosas.
  res.mensajesAlWorker = 0

  return res
}

/* ------------------------------------------------------------------ *
 * Reinicio del organizador (contrato 4): nivel Y mochila
 * ------------------------------------------------------------------ */

async function reinicio() {
  const e = crearEntorno()
  const r = e.cargar('src/player/offline/reseteoDelServidor.ts')
  const inv = e.cargar('src/player/offline/inventory.ts')
  const mp = e.cargar('src/player/offline/missionPack.ts')
  const nodeClock = e.cargar('src/player/nodeClock.ts')
  const res = {}

  const RESET1 = 1_800_000_000_000
  const item = (id, cantidad) => ({ item_id: id, label: id, state: 'collected', quantity: cantidad, updated_at: new Date(RESET1 - 60_000).toISOString() })

  res.marca = {
    conMarca: r.resetAtDeLaPartida({ inventory_snapshot: { reset_at: RESET1 } }),
    sinMarca: r.resetAtDeLaPartida({ inventory_snapshot: {} }),
    basura: r.resetAtDeLaPartida({ inventory_snapshot: { reset_at: 'x' } }),
    sinNada: r.resetAtDeLaPartida(null),
  }

  // El móvil tiene objetos y un reloj de nodo abierto y una cola sin subir.
  inv.saveInventorySnapshot({ user: 'TEST', updated_at: '', items: [item('llave', 1), item('gema', 2)] })
  // saveInventorySnapshot sella updated_at = ahora; se fuerza a antes del reinicio.
  const viejo = JSON.parse(e.local.getItem('saga:inventory:TEST'))
  viejo.updated_at = new Date(RESET1 - 60_000).toISOString()
  e.local.setItem('saga:inventory:TEST', JSON.stringify(viejo))
  nodeClock.abrirNodo('TEST', '7')
  await mp.queueOfflineEvent({ user: 'TEST', type: 'node_completed', payload: { code: 'X' }, node_id: 7 })

  // 1. El organizador vacía la mochila / baja al jugador: llega reset_at nuevo.
  const huboUno = await r.aplicarResetDelServidor('TEST', {
    user: 'TEST',
    inventory_snapshot: { user: 'TEST', items: [], reset_at: RESET1 },
  })
  res.primerReinicio = {
    huboReset: huboUno,
    mochilaLocal: inv.loadInventorySnapshot('TEST').items.length,
    relojDelNodoLimpio: nodeClock.tiempoDelNodo('TEST', '7') === 0,
    colaPendiente: await mp.contarPendientes('TEST'),
  }

  // 2. La misma marca otra vez: ya no es un reinicio nuevo.
  const huboDos = await r.aplicarResetDelServidor('TEST', {
    user: 'TEST',
    inventory_snapshot: { user: 'TEST', items: [], reset_at: RESET1 },
  })
  res.mismaMarca = { huboReset: huboDos }

  // 3. Una marca MÁS NUEVA vuelve a ser un reinicio, y lo que el organizador dejó se incorpora.
  await mp.queueOfflineEvent({ user: 'TEST', type: 'node_completed', payload: { code: 'Y' }, node_id: 8 })
  const huboTres = await r.aplicarResetDelServidor('TEST', {
    user: 'TEST',
    inventory_snapshot: { user: 'TEST', items: [item('pala', 1)], reset_at: RESET1 + 60_000 },
  })
  res.segundoReinicio = {
    huboReset: huboTres,
    objetos: inv.loadInventorySnapshot('TEST').items.map((i) => i.item_id),
    colaPendiente: await mp.contarPendientes('TEST'),
  }

  // 4. Sin reinicio, lo que el organizador entrega a mano SÍ llega (refresco de fondo).
  const huboCuatro = await r.aplicarResetDelServidor('TEST', {
    user: 'TEST',
    inventory_snapshot: { user: 'TEST', items: [item('pala', 1), item('regalo', 1)], reset_at: RESET1 + 60_000 },
  })
  res.regaloEnPartida = {
    huboReset: huboCuatro,
    objetos: inv.loadInventorySnapshot('TEST').items.map((i) => i.item_id).sort(),
  }

  return res
}

/* ------------------------------------------------------------------ *
 * La cola: rechazos visibles (J3), mochila forjada (J3), client_sent_at_ms (7)
 * ------------------------------------------------------------------ */

async function cola() {
  const { e, srv, pack } = mundo()
  const inv = e.cargar('src/player/offline/inventory.ts')
  const res = {}

  // Contrato 7: el cuerpo lleva la hora del móvil.
  const cuerpo = pack.cuerpoDeSincronizacion({ user: 'TEST', events: [], mochila: null, ahoraMs: 1234 })
  res.cuerpo = { client_sent_at_ms: cuerpo.client_sent_at_ms, sinMochila: !('inventory_snapshot' in cuerpo) }
  const conMochila = pack.cuerpoDeSincronizacion({
    user: 'TEST',
    events: [],
    mochila: { user: 'TEST', updated_at: '', items: [{ item_id: 'a', quantity: 1 }] },
  })
  res.cuerpoConMochila = { tieneMochila: 'inventory_snapshot' in conMochila, hora: typeof conMochila.client_sent_at_ms }

  // Tres nodos hechos sin cobertura: uno con código que ya no cuadra, uno eco, uno bueno.
  const antes = Date.now()
  await pack.queueOfflineEvent({ user: 'TEST', type: 'node_completed', payload: { code: 'A', stage_title: 'Primero' }, node_id: 1 })
  await pack.queueOfflineEvent({ user: 'TEST', type: 'node_completed', payload: { code: 'B', stage_title: 'Segundo' }, node_id: 2 })
  await pack.queueOfflineEvent({ user: 'TEST', type: 'node_completed', payload: { code: 'C', stage_title: 'Tercero' }, node_id: 3 })
  let n = 0
  srv.sincronizacion = () => {
    n += 1
    if (n === 1) {
      // Contrato 6: rechazo con nodo y motivo en castellano.
      return { status: 'failed', error: 'invalid_completion_code', stage_id: 1, motivo: 'El organizador cambió el código de «Primero».' }
    }
    if (n === 2) return { status: 'ignored', error: 'already_advanced' } // un eco: benigno
    return { status: 'synced' }
  }
  const envio = await pack.syncPendingOfflineEvents('TEST')
  const enviado = srv.cuerposDeSync[0]
  res.envio = {
    resultado: { attempted: envio.attempted, synced: envio.synced, failed: envio.failed },
    client_sent_at_ms_es_hora_del_movil: typeof enviado.client_sent_at_ms === 'number' && enviado.client_sent_at_ms >= antes,
    eventos: enviado.events.length,
    pendientesDespues: await pack.contarPendientes('TEST'),
  }

  const rechazos = await pack.listarRechazosDefinitivos('TEST')
  res.rechazos = rechazos.map((r) => ({ nodo: r.nodo, titulo: r.titulo, motivo: r.motivo }))

  await pack.descartarRechazos('TEST', rechazos.map((r) => r.id))
  res.tras_entendido = (await pack.listarRechazosDefinitivos('TEST')).length

  // Sin `motivo` del servidor (servidor sin el contrato 6): texto de reserva.
  await pack.queueOfflineEvent({ user: 'TEST', type: 'node_completed', payload: { code: 'D', stage_title: 'Cuarto' }, node_id: 4 })
  srv.sincronizacion = () => ({ status: 'failed', error: 'missing_required_item' })
  await pack.syncPendingOfflineEvents('TEST')
  const sinMotivo = await pack.listarRechazosDefinitivos('TEST')
  res.sinMotivoDelServidor = sinMotivo.map((r) => ({ nodo: r.nodo, motivo: r.motivo }))

  // Un rechazo pasajero (la misión no ha empezado) NO se cierra ni se enseña.
  await pack.queueOfflineEvent({ user: 'TEST', type: 'node_completed', payload: { code: 'E' }, node_id: 5 })
  srv.sincronizacion = () => ({ status: 'failed', error: 'mission_not_started_yet' })
  await pack.syncPendingOfflineEvents('TEST')
  res.pasajero = {
    sigueEnCola: (await pack.contarPendientes('TEST')) >= 1,
    noSeEnseña: !(await pack.listarRechazosDefinitivos('TEST')).some((r) => r.motivo.includes('empezado')),
  }

  return res
}

async function mochilaForjada() {
  const { e, srv, pack } = mundo()
  const inv = e.cargar('src/player/offline/inventory.ts')
  const res = {}

  // El jugador forja «sello» sin cobertura y lo GASTA en un nodo: la mochila local ya no lo tiene.
  inv.saveInventorySnapshot({
    user: 'TEST',
    updated_at: '',
    items: [{ item_id: 'sello', label: 'Sello', state: 'used', quantity: 0, updated_at: '' }],
  })
  await pack.queueOfflineEvent({
    user: 'TEST',
    type: 'node_completed',
    payload: { code: 'X', consumed_item: { item_id: 'sello', quantity: 1, label: 'Sello' } },
    node_id: 9,
  })

  await pack.syncPendingOfflineEvents('TEST')
  const enviada = srv.cuerposDeSync[0].inventory_snapshot
  const sello = enviada && enviada.items.find((i) => i.item_id === 'sello')
  res.enviada = {
    llevaMochila: Boolean(enviada),
    selloCantidad: sello && sello.quantity,
    selloEstado: sello && sello.state,
  }

  // La mochila LOCAL sigue sin él (la reconstrucción es sólo para el servidor).
  res.local = inv.loadInventorySnapshot('TEST').items.map((i) => i.item_id + ':' + i.quantity + ':' + i.state)

  // Pura: sin nodos que gastaran, la mochila es la misma.
  const pura = pack.reconstruirMochilaAntesDeConsumir(
    { user: 'TEST', updated_at: '', items: [{ item_id: 'a', quantity: 2, state: 'collected' }] },
    [{ type: 'node_completed', payload: { code: 'x' } }, { type: 'qr_scanned', payload: { consumed_item: { item_id: 'a', quantity: 5 } } }]
  )
  res.sinGastos = pura.items.map((i) => i.item_id + ':' + i.quantity)

  const dosNodos = pack.reconstruirMochilaAntesDeConsumir(
    { user: 'TEST', updated_at: '', items: [] },
    [
      { type: 'node_completed', payload: { consumed_item: { item_id: 'x', quantity: 1, label: 'X' } } },
      { type: 'node_completed', payload: { consumed_item: { item_id: 'x', quantity: 2, label: 'X' } } },
      { type: 'node_completed', payload: { consumed_item: { item_id: 'y', quantity: 1, label: 'Y' } } },
    ]
  )
  res.dosNodos = dosNodos.items.map((i) => i.item_id + ':' + i.quantity).sort()

  return res
}

/* ------------------------------------------------------------------ *
 * Guardar el paquete: cuota (J6), revisión y configuración
 * ------------------------------------------------------------------ */

async function guardarPaquete() {
  const { e, pack } = mundo()
  const res = {}
  const payload = { user: 'TEST', level: 1, finished: false, stages: [{ id: 1, success: {} }], current_stage: null }
  const buena = { site_name: 'SAGA', story_text: 'T', player_theme: 'flame-red', server_time_ms: 1_800_000_000_000 }

  const guardado = await pack.saveMissionPack({ user: 'TEST', config: buena, payload, mission_revision: 'R7', config_recibida_en: 5555 })
  res.primero = { revision: guardado.mission_revision, recibida: guardado.config_recibida_en }

  // Sin revisión nueva se conserva la que había (sólo cambia el nivel), y la hora
  // de recepción sigue con SU configuración (la misma).
  const nivel2 = await pack.saveMissionPack({ user: 'TEST', config: buena, payload: { ...payload, level: 2 } })
  res.soloNivel = { revision: nivel2.mission_revision, nivel: nivel2.current_level, recibida: nivel2.config_recibida_en }

  // Con la de respaldo no se pisa la configuración ni la hora a la que llegó.
  const respaldo = { site_name: 'SAGA', story_text: 'Elige jugador para continuar.', players: [], player_profiles: [] }
  const trasRespaldo = await pack.saveMissionPack({ user: 'TEST', config: respaldo, payload })
  res.conRespaldo = { tema: trasRespaldo.config.player_theme, recibida: trasRespaldo.config_recibida_en }

  // Otra configuración (otra hora del servidor) sin decir cuándo llegó: NO se
  // inventa la hora de recepción (la de guardar no es la de recibir).
  const otraHora = { ...buena, server_time_ms: 1_800_000_999_000 }
  const conOtraHora = await pack.saveMissionPack({ user: 'TEST', config: otraHora, payload })
  res.otraConfigSinHora = { recibida: conOtraHora.config_recibida_en === undefined ? null : conOtraHora.config_recibida_en }

  // Sin sitio: el error LLEGA (antes se tragaba y el panel decía «listo»).
  e.cuota.idbPutFalla = true
  let error = null
  try {
    await pack.saveMissionPack({ user: 'TEST', config: buena, payload })
  } catch (err) {
    error = { nombre: err && err.name, mensaje: String(err && err.message) }
  }
  res.sinEspacio = { lanza: error !== null, error }

  return res
}

/* ------------------------------------------------------------------ *
 * J9: «Prepararse» no hace retroceder al jugador con nodos sin subir
 * ------------------------------------------------------------------ */

async function preparacionConCola() {
  const { e, srv, carga, pack } = mundo()
  const res = {}

  // Se prepara una vez, con red, en el nodo 0.
  await carga.cargarTodo('TEST', opciones('entrada').opts)

  // Se juega sin cobertura: el móvil va por el nodo 2 y hay dos nodos sin subir.
  srv.nivel = 0
  const guardado = await pack.getStoredMissionPack('TEST')
  const adelantado = { ...guardado.payload, level: 2, current_stage: null }
  await pack.saveMissionPack({ user: 'TEST', config: guardado.config, payload: adelantado })
  await pack.queueOfflineEvent({ user: 'TEST', type: 'node_completed', payload: { code: 'A' }, node_id: 1 })
  await pack.queueOfflineEvent({ user: 'TEST', type: 'node_completed', payload: { code: 'B' }, node_id: 2 })

  // Vuelve la red pero el servidor aún no acepta la cola (va lento): sigue pendiente.
  srv.sincronizacion = 'cae'
  srv.revision = 'R2' // y el organizador cambió algo: «Prepararse» tiene que bajar la misión
  const { opts, vistas } = opciones('preparacion', { payloadEnPantalla: () => adelantado })
  const r = await carga.cargarTodo('TEST', opts)
  const guardadoDespues = await pack.getStoredMissionPack('TEST')
  res.conColaPendiente = {
    nivelServidor: srv.nivel,
    nivelDevuelto: r.payload.level,
    nivelGuardado: guardadoDespues.payload.level,
    pendientes: await pack.contarPendientes('TEST'),
    misionBajada: guardadoDespues.mission_revision === 'R2',
    faltan: r.faltan,
    huboPantalla: r.huboPantalla,
    seMostroPorPartes: vistas.some((v) => v.estado !== null),
  }

  // Cola vacía, el servidor va por el 1 y el jugador está en el 2: en «Prepararse»
  // (en plena partida) NO se baja el nivel por una respuesta atrasada...
  await pack.borrarColaOffline('TEST')
  srv.nivel = 1
  srv.revision = 'R3'
  const { opts: opts2 } = opciones('preparacion', { payloadEnPantalla: () => adelantado })
  const r2 = await carga.cargarTodo('TEST', opts2)
  res.colaVacia_enJuego = { nivelDevuelto: r2.payload.level, pendientes: await pack.contarPendientes('TEST') }

  // ...pero al ABRIR la aplicación, con la cola vacía, el servidor es la única verdad.
  srv.revision = 'R4'
  const { opts: opts3 } = opciones('entrada')
  const r3 = await carga.cargarTodo('TEST', opts3)
  res.colaVacia_alArrancar = { nivelDevuelto: r3.payload.level }

  return res
}

async function preparacionSinRed() {
  const { e, carga } = mundo()
  e.servidor = () => null
  const { opts } = opciones('preparacion')
  const r = await carga.cargarTodo('TEST', opts)
  return { cobertura: r.cobertura, payload: r.payload, peticiones: e.peticiones.length }
}

/* ------------------------------------------------------------------ *
 * Fallos al bajar: no se entra a medias (o se entra igualmente, avisando)
 * ------------------------------------------------------------------ */

async function fallosAlBajar() {
  const res = {}

  // Un fallo al bajar el mapa: la pantalla se queda, con el error, y se puede entrar igualmente.
  {
    const { e, srv, carga } = mundo()
    const malas = (ruta) => /\/(18|19)\//.test(ruta)
    srv.loteSinDatos = malas
    srv.teselaMala = malas
    let entrar = false
    setTimeout(() => (entrar = true), 150)
    const { opts, vistas } = opciones('entrada', { entrarIgualmente: () => entrar })
    const r = await carga.cargarTodo('TEST', opts)
    const ultimo = [...vistas].reverse().find((v) => v.estado)
    res.entrarIgualmente = {
      entroIgualmente: r.entroIgualmente,
      faltan: r.faltan,
      mapa: ultimo && ultimo.estado.mapa.estado,
      appListo: ultimo && ultimo.estado.app.estado,
      misionLista: ultimo && ultimo.estado.mision.estado,
      hayPayload: Boolean(r.payload),
    }
  }

  // «Reintentar»: cuando el servidor se recupera, se completa solo lo que falló.
  {
    const { e, srv, carga } = mundo()
    const malas = (ruta) => /\/(18|19)\//.test(ruta)
    srv.loteSinDatos = malas
    srv.teselaMala = malas
    let intentos = 0
    setTimeout(() => {
      srv.loteSinDatos = () => false
      srv.teselaMala = () => false
      intentos = 1
    }, 120)
    const marca = { v: 0 }
    const { opts } = opciones('entrada', { reintentos: () => intentos })
    const r = await carga.cargarTodo('TEST', opts)
    res.reintentar = { entroIgualmente: r.entroIgualmente, faltan: r.faltan, mapa: r.partes.mapa.estado, appNoSeRepitio: e.peticiones.filter((p) => p.ruta === '/assets/index-aaa.js').length }
    void marca
  }

  // Sin espacio en el móvil: la parte falla y lo dice, no «listo».
  {
    const { e, carga } = mundo()
    e.cuota.cachePutFalla = true
    let entrar = false
    setTimeout(() => (entrar = true), 150)
    const { opts, vistas } = opciones('entrada', { entrarIgualmente: () => entrar })
    const r = await carga.cargarTodo('TEST', opts)
    const ultimo = [...vistas].reverse().find((v) => v.estado)
    res.sinEspacio = {
      faltan: r.faltan,
      sinEspacioEnApp: Boolean(ultimo && ultimo.estado.app.sinEspacio),
      appEstado: ultimo && ultimo.estado.app.estado,
    }
  }

  // El paquete de la misión no cabe (IndexedDB llena): la misión falla, no «listo».
  {
    const { e, carga } = mundo()
    e.cuota.idbPutFalla = true
    let entrar = false
    setTimeout(() => (entrar = true), 150)
    const { opts, vistas } = opciones('entrada', { entrarIgualmente: () => entrar })
    const r = await carga.cargarTodo('TEST', opts)
    const ultimo = [...vistas].reverse().find((v) => v.estado)
    res.paqueteSinEspacio = {
      faltan: r.faltan,
      misionEstado: ultimo && ultimo.estado.mision.estado,
      misionSinEspacio: Boolean(ultimo && ultimo.estado.mision.sinEspacio),
    }
  }

  return res
}

/* ------------------------------------------------------------------ *
 * Los otros jugadores de este móvil (J14), y la sesión que no se pierde
 * ------------------------------------------------------------------ */

async function otrosJugadores() {
  const { e, srv, carga, pack } = mundo()
  const res = {}

  // OTRO ya usó este móvil, con la misión de antes.
  const payloadViejo = {
    user: 'OTRO',
    level: 1,
    finished: false,
    stages: [{ id: 1, success: {}, title: 'viejo', lat: 42.5, lon: -8.7 }],
    stages_rev: 'H-R0',
    offline_pack: true,
    current_stage: null,
  }
  await pack.saveMissionPack({ user: 'OTRO', config: { site_name: 'SAGA', story_text: 'x', player_theme: 'flame-red' }, payload: payloadViejo, mission_revision: 'R0' })

  // Primera carga de TEST (entrada normal): baja lo suyo y NO toca a OTRO.
  const marca = e.peticiones.length
  await carga.cargarTodo('TEST', opciones('entrada').opts)
  const juegos = e.peticiones.slice(marca).filter((p) => p.ruta.startsWith('/api/game/'))
  res.peticionesDeJuego = juegos.map((p) => decodeURIComponent(p.ruta.split('/').pop()) + (p.busqueda.includes('offline_pack=true') ? ':pesado' : ':ligero'))
  res.laSesionAcabaSiendoDeQuienJuega = srv.usuarioDeLaSesion === 'TEST'
  res.otroSinTocarEnLaEntrada = (await pack.getStoredMissionPack('OTRO')).mission_revision

  // Un perfil que NUNCA usó este móvil no se baja (antes se bajaban los catorce).
  res.nadieMasBajado = !e.peticiones.some((p) => p.ruta === '/api/game/NUNCA')
  res.perfilesEnElMovil = (await pack.listarPacksGuardados()).map((p) => p.user).sort()

  // Segunda carga sin cambios: no se toca a OTRO (no hay pantalla ni descargas).
  const marca2 = e.peticiones.length
  await carga.cargarTodo('TEST', opciones('entrada').opts)
  res.sinCambios_noPideAOtro = !e.peticiones.slice(marca2).some((p) => p.ruta === '/api/game/OTRO')

  // En «Prepararse» sí se refresca a OTRO (su paquete estaba viejo) y la sesión vuelve a TEST.
  const marca2b = e.peticiones.length
  await carga.cargarTodo('TEST', opciones('preparacion').opts)
  res.preparacionRefrescaAOtro = (await pack.getStoredMissionPack('OTRO')).mission_revision
  res.preparacionPidioPesadoDeOtro = e.peticiones.slice(marca2b).some((p) => p.ruta === '/api/game/OTRO' && p.busqueda.includes('offline_pack=true'))

  // En «Prepararse» sí se revisa, y como ya está al día no se baja de nuevo su paquete.
  const marca3 = e.peticiones.length
  await carga.cargarTodo('TEST', opciones('preparacion').opts)
  const ultimoDeJuego = e.peticiones.slice(marca3).filter((p) => p.ruta.startsWith('/api/game/')).pop()
  res.preparacion = {
    revisaAOtro: e.peticiones.slice(marca3).some((p) => p.ruta === '/api/game/OTRO' && !p.busqueda.includes('offline_pack=true')),
    noBajaSuPaquete: !e.peticiones.slice(marca3).some((p) => p.ruta === '/api/game/OTRO' && p.busqueda.includes('offline_pack=true')),
    laSesionVuelveAQuienJuega: ultimoDeJuego && ultimoDeJuego.ruta === '/api/game/TEST',
  }

  // Un OTRO que no responde jamás no cuelga ni la entrada ni «Prepararse».
  {
    const m = mundo()
    await m.pack.saveMissionPack({ user: 'OTRO', config: { site_name: 'SAGA', story_text: 'x', player_theme: 'flame-red' }, payload: payloadViejo, mission_revision: 'R0' })
    m.srv.colgarPartidaDe = 'OTRO'
    const carrera = (p) => Promise.race([p.then(() => 'termino'), new Promise((r) => setTimeout(r, 5000, 'colgada'))])
    // setTimeout de la prueba es el real de Node: 5 s reales; el tope del sandbox son 200 ms.
    const ent = await carrera(m.carga.cargarTodo('TEST', opciones('entrada').opts))
    const prep = await carrera(m.carga.cargarTodo('TEST', opciones('preparacion').opts))
    res.otroColgado = { entrada: ent, preparacion: prep }
  }

  return res
}

/* ------------------------------------------------------------------ *
 * Fotos de campo: sólo en la carga, y saltándose las que ya están (J11)
 * ------------------------------------------------------------------ */

async function fotosDeCampo() {
  const { e, srv } = mundo()
  const fp = e.cargar('src/player/offline/fieldProofCache.ts')
  const res = {}
  const fotos = [
    { id: 'p1', image_url: '/api/field-proofs/p1/image', thumbnail_url: '/api/field-proofs/p1/thumb' },
    { id: 'p2', image_url: '/api/field-proofs/p2/image', thumbnail_url: '/api/field-proofs/p2/thumb' },
  ]
  void srv

  let marca = e.peticiones.length
  const primera = await fp.cacheFieldProofAssets(fotos)
  res.primera = { total: primera.total, nuevas: primera.nuevas, peticiones: e.peticiones.length - marca }

  marca = e.peticiones.length
  const segunda = await fp.cacheFieldProofAssets(fotos)
  res.segunda = { total: segunda.total, nuevas: segunda.nuevas, peticiones: e.peticiones.length - marca }

  // Una foto nueva: sólo se pide la nueva.
  marca = e.peticiones.length
  const tercera = await fp.cacheFieldProofAssets([...fotos, { id: 'p3', image_url: '/api/field-proofs/p3/image', thumbnail_url: '/api/field-proofs/p3/thumb' }])
  res.tercera = { nuevas: tercera.nuevas, peticiones: e.peticiones.length - marca }

  // Sin espacio.
  const lleno = mundo()
  const fp2 = lleno.e.cargar('src/player/offline/fieldProofCache.ts')
  lleno.e.cuota.cachePutFalla = true
  const r = await fp2.cacheFieldProofAssets(fotos)
  res.sinEspacio = { sinEspacio: r.sinEspacio, nuevas: r.nuevas }

  // El hook de fotos ya no las descarga de fondo: se comprueba el código.
  const hook = fs.readFileSync(path.join(FRONT, 'src/player/hooks/useFotosDeCampo.ts'), 'utf8')
  res.hookSinDescargas = !hook.includes('cacheFieldProofAssets')

  return res
}

/* ------------------------------------------------------------------ *
 * versionGuard (J4): no borra el armazón, sólo cambia con todo guardado
 * ------------------------------------------------------------------ */

async function vigilanteDeVersion() {
  const res = {}

  function preparar(opciones = {}) {
    const m = mundo()
    const { e, srv } = m
    srv.versionDeLaApp = '2.0.0' // el servidor va por delante del bundle (1.0.0)
    const guardia = e.cargar('src/shared/versionGuard.ts')
    const seguro = e.cargar('src/player/offline/recargaSegura.ts')
    return { ...m, guardia, seguro, ...opciones }
  }

  async function lleno(e) {
    const cache = await e.caches.open('saga-player-shell')
    await cache.put('/', new Response('<html>vieja</html>', { headers: { 'content-type': 'text/html' } }))
    await cache.put('/assets/index-vieja.js', new Response('viejo', { headers: { 'content-type': 'application/javascript' } }))
    await cache.put('/player-precache.json', new Response('{"files":["/assets/index-vieja.js"]}', { headers: { 'content-type': 'application/json' } }))
    return cache
  }

  // Misma versión: no se toca nada.
  {
    const { e, srv, guardia } = preparar()
    srv.versionDeLaApp = '1.0.0'
    await lleno(e)
    const marca = e.peticiones.length
    await guardia.vixiarVersion()
    res.mismaVersion = { peticiones: e.peticiones.slice(marca).map((p) => p.ruta), recargas: e.recargas }
  }

  // La página nueva NO llega (500): no se borra nada, no se recarga, no se marca la guardia.
  {
    const { e, srv, guardia } = preparar()
    await lleno(e)
    srv.manejarViejo = srv.manejar.bind(srv)
    e.servidor = async (url, init) => {
      if (url.pathname === '/') return new Response('error', { status: 500, headers: { 'content-type': 'text/plain' } })
      return srv.manejar(url, init)
    }
    await guardia.vixiarVersion()
    res.paginaNoLlega = {
      recargas: e.recargas,
      cachesBorradas: e.caches.borrados,
      cacheIntacta: e.caches.contenido('saga-player-shell'),
      guardiaMarcada: e.sesion.getItem('saga:version-recargada'),
    }
  }

  // Un paquete de arranque llega como HTML (salida de la SPA): se aborta y se conserva la caché vieja.
  {
    const { e, srv, guardia } = preparar()
    await lleno(e)
    srv.assetsMalos.add('/assets/MapSurfaceGL-bbb.js')
    srv.archivos = ['/assets/index-nuevo.js', '/assets/MapSurfaceGL-bbb.js']
    srv.assetsMalos.add('/assets/index-nuevo.js')
    await guardia.vixiarVersion()
    const contenido = e.caches.contenido('saga-player-shell')
    res.paqueteMalo = {
      recargas: e.recargas,
      paginaVieja: contenido.includes('/'),
      guardaLaPaginaVieja: (await (await e.caches.open('saga-player-shell')).match('/')).status === 200,
      cachesBorradas: e.caches.borrados,
      nuevoGuardado: contenido.includes('/assets/index-nuevo.js'),
    }
  }

  // Todo llega: se guarda la nueva SIN borrar la vieja y se recarga (nadie lo impide).
  {
    const { e, srv, guardia } = preparar()
    await lleno(e)
    srv.archivos = ['/assets/index-nuevo.js', '/assets/index-nuevo.css']
    // Esta pantalla tiene cargado el paquete viejo (el bundle 1.0.0).
    e.sandbox.document.querySelectorAll = (sel) => (sel.startsWith('script') ? [{ src: ORIGEN_SRC + '/assets/index-vieja.js' }] : [])
    await guardia.vixiarVersion()
    await pausa(60)
    const cache = await e.caches.open('saga-player-shell')
    const pagina = await cache.match('/')
    res.todoLlega = {
      recargas: e.recargas,
      cachesBorradas: e.caches.borrados,
      contenido: e.caches.contenido('saga-player-shell').sort(),
      paginaNueva: (await pagina.text()).includes('index-nuevo.js'),
      guardiaMarcada: e.sesion.getItem('saga:version-recargada'),
      viejaSigueEnCache: e.caches.contenido('saga-player-shell').includes('/assets/index-vieja.js'),
    }
  }

  // Una sola recarga por versión (si vuelve a arrancar en la misma sesión no repite).
  {
    const { e, srv, guardia } = preparar()
    srv.archivos = ['/assets/index-nuevo.js']
    e.sandbox.document.querySelectorAll = (sel) => (sel.startsWith('script') ? [{ src: ORIGEN_SRC + '/assets/index-vieja.js' }] : [])
    await guardia.vixiarVersion()
    await pausa(60)
    const primera = e.recargas
    await guardia.vixiarVersion()
    await pausa(60)
    res.unaSolaVez = { primera, despues: e.recargas }
  }

  // Alguien lo impide (hay un minijuego abierto): no recarga hasta que se cierre.
  {
    const { e, srv, guardia, seguro } = preparar()
    srv.archivos = ['/assets/index-nuevo.js']
    e.sandbox.document.querySelectorAll = (sel) => (sel.startsWith('script') ? [{ src: ORIGEN_SRC + '/assets/index-vieja.js' }] : [])
    let abierto = true
    seguro.registrarQuienPuedeRecargar(() => !abierto)
    await guardia.vixiarVersion()
    await pausa(60)
    const conMinijuego = e.recargas
    abierto = false
    await pausa(120)
    res.esperaAQueSeCierre = { conMinijuego, alCerrar: e.recargas }
  }

  // El servidor dice otra versión pero sirve lo MISMO que ya tiene esta pantalla: no hay nada que recargar.
  {
    const { e, srv, guardia } = preparar()
    srv.archivos = ['/assets/index-vieja.js']
    e.sandbox.document.querySelectorAll = (sel) => (sel.startsWith('script') ? [{ src: ORIGEN_SRC + '/assets/index-vieja.js' }] : [])
    await guardia.vixiarVersion()
    await pausa(60)
    res.sinNovedad = { recargas: e.recargas }
  }

  res.rutasDeArranque = (() => {
    const { e } = preparar()
    const g = e.cargar('src/shared/versionGuard.ts')
    return g.rutasDeArranque(
      '<script type="module" crossorigin src="/assets/index-Abc123.js"></script>' +
        '<link rel="modulepreload" href="/assets/vendor-react-x.js">' +
        '<link rel="stylesheet" href="/assets/index-q.css?v=1">' +
        '<link rel="icon" href="/saga-app-icon.svg"><script src="https://otro.com/assets/x.js"></script>'
    )
  })()

  return res
}

const ORIGEN_SRC = 'https://saga.test'

/* ------------------------------------------------------------------ *
 * recargaSegura (J13)
 * ------------------------------------------------------------------ */

async function recargaSegura() {
  const res = {}
  const e = crearEntorno()
  const seguro = e.cargar('src/player/offline/recargaSegura.ts')

  const documento = (visible) => {
    const oyentes = []
    return {
      visibilityState: visible ? 'visible' : 'hidden',
      addEventListener: (t, f) => oyentes.push([t, f]),
      removeEventListener: (t, f) => {
        const i = oyentes.findIndex((o) => o[1] === f)
        if (i >= 0) oyentes.splice(i, 1)
      },
      cambiar(v) {
        this.visibilityState = v ? 'visible' : 'hidden'
        oyentes.filter((o) => o[0] === 'visibilitychange').forEach((o) => o[1]())
      },
      oyentes,
    }
  }

  // Sin nadie que lo impida y en primer plano: al momento (versionGuard).
  {
    let n = 0
    seguro.registrarQuienPuedeRecargar(null)
    seguro.recargarCuandoSeaSeguro({ recargar: () => (n += 1), documento: documento(true), cadaMs: 0 })
    res.alMomento = n
  }

  // Service worker nuevo (soloOculta): con la pantalla a la vista NO; al pasar a segundo plano, sí.
  {
    let n = 0
    seguro.registrarQuienPuedeRecargar(null)
    const doc = documento(true)
    seguro.recargarCuandoSeaSeguro({ soloOculta: true, recargar: () => (n += 1), documento: doc, cadaMs: 0 })
    const conLaPantallaPuesta = n
    doc.cambiar(false)
    res.swNuevo = { conLaPantallaPuesta, alPasarASegundoPlano: n }
  }

  // En segundo plano pero con una hoja abierta: tampoco; al cerrarla, sí.
  {
    let n = 0
    let abierta = true
    seguro.registrarQuienPuedeRecargar(() => !abierta)
    const doc = documento(false)
    seguro.recargarCuandoSeaSeguro({ soloOculta: true, recargar: () => (n += 1), documento: doc, cadaMs: 0 })
    const conHoja = n
    abierta = false
    doc.cambiar(false)
    res.conHojaAbierta = { conHoja, alCerrar: n }
  }

  // Cancelable, y una sola vez.
  {
    let n = 0
    seguro.registrarQuienPuedeRecargar(null)
    const doc = documento(false)
    const cancelar = seguro.recargarCuandoSeaSeguro({ recargar: () => (n += 1), documento: doc, cadaMs: 0 })
    doc.cambiar(false)
    doc.cambiar(false)
    res.unaVez = n
    void cancelar
  }

  return res
}

/* ------------------------------------------------------------------ *
 * El service worker (sw.js): instalación mínima y cachés que no se envenenan
 * ------------------------------------------------------------------ */

async function serviceWorker() {
  const res = {}

  function arrancar() {
    const e = crearEntorno()
    const srv = new ServidorFalso()
    e.servidor = (url, init) => srv.manejar(url, init)

    const oyentes = {}
    const self = {
      location: { origin: 'https://saga.test' },
      addEventListener: (tipo, fn) => (oyentes[tipo] = fn),
      skipWaiting: () => {
        self.saltos = (self.saltos || 0) + 1
      },
      clients: { claim: async () => undefined },
      saltos: 0,
    }
    const contexto = vm.createContext({
      self,
      caches: e.caches,
      fetch: e.sandbox.fetch,
      indexedDB: e.indexedDB,
      console: { log() {}, warn() {}, error() {} },
      URL,
      Request,
      Response,
      Promise,
      JSON,
      Date,
      Set,
      Map,
      setTimeout,
      clearTimeout,
      AbortController,
      Headers,
    })
    vm.runInContext(fs.readFileSync(path.join(FRONT, 'public/sw.js'), 'utf8'), contexto, { filename: 'sw.js' })
    return { e, srv, oyentes, self }
  }

  async function instalar(oyentes) {
    let espera = Promise.resolve()
    oyentes.install({ waitUntil: (p) => (espera = p) })
    await espera
  }

  async function pedir(oyentes, ruta, opciones = {}) {
    let respuesta = null
    let espera = Promise.resolve()
    const peticion = new Request('https://saga.test' + ruta, opciones)
    oyentes.fetch({
      request: peticion,
      respondWith: (p) => (respuesta = p),
      waitUntil: (p) => (espera = p),
    })
    const r = respuesta ? await respuesta : null
    await espera
    await pausa(5)
    return r
  }

  // La instalación es mínima: el shell básico, sin la lista de paquetes ni un solo /assets/.
  {
    const { e, oyentes, self } = arrancar()
    await instalar(oyentes)
    res.instalacion = {
      peticiones: e.peticiones.map((p) => p.ruta),
      listaDePaquetes: e.peticiones.some((p) => p.ruta === '/player-precache.json'),
      assets: e.peticiones.some((p) => p.ruta.startsWith('/assets/')),
      cacheDelShell: e.caches.contenido('saga-player-shell').includes('/manifest.webmanifest'),
      saltaAlControl: self.saltos,
    }
    res.mensajeDeBajarShell = typeof oyentes.message === 'function'
    if (typeof oyentes.message === 'function') {
      const antes = e.peticiones.length
      let espera = Promise.resolve()
      oyentes.message({ data: { type: 'SAGA_CACHE_PLAYER_SHELL', urls: ['/assets/index-aaa.js'] }, waitUntil: (p) => (espera = p) })
      await espera
      res.mensajeDeBajarShell = { peticionesTrasElMensaje: e.peticiones.length - antes }
    }
  }

  // Teselas: solo se guardan las buenas.
  {
    const { e, srv, oyentes } = arrancar()
    const cacheDeTeselas = () => e.caches.contenido('saga-route-tile-coverage-v5.55-terrarium')

    srv.teselaMala = (ruta) => ruta === '/map-tiles/5/1/1.png'
    const mala = await pedir(oyentes, '/map-tiles/5/1/1.png')
    const buena = await pedir(oyentes, '/map-tiles/5/2/2.png')
    srv.teselaMala = () => false
    const relieve = await pedir(oyentes, '/dem-tiles/12/3/3.png')
    e.servidor = async (url, init) => {
      if (url.pathname === '/map-tiles/5/9/9.png') return new Response('<html>', { status: 200, headers: { 'content-type': 'text/html' } })
      return srv.manejar(url, init)
    }
    const html = await pedir(oyentes, '/map-tiles/5/9/9.png')

    res.teselas = {
      malaDevuelve: mala && mala.status,
      malaGuardada: cacheDeTeselas().includes('/map-tiles/5/1/1.png'),
      buenaGuardada: cacheDeTeselas().includes('/map-tiles/5/2/2.png'),
      buenaDevuelve: buena && buena.status,
      relieveGuardado: cacheDeTeselas().includes('/dem-tiles/12/3/3.png'),
      htmlDevuelve: html && html.status,
      htmlGuardado: cacheDeTeselas().includes('/map-tiles/5/9/9.png'),
    }

    // Segunda petición de la buena: sale de la caché (no vuelve a la red).
    const marca = e.peticiones.length
    await pedir(oyentes, '/map-tiles/5/2/2.png')
    res.teselas.segundaVezSinRed = e.peticiones.length === marca
  }

  // Relieve y edificios con versión (?v=): la versión nueva va a la red; sin red, la vieja.
  {
    const { e, oyentes } = arrancar()
    const NOMBRE = 'saga-route-tile-coverage-v5.55-terrarium'
    await pedir(oyentes, '/dem-tiles/12/3/3.png?v=aaa')
    let marca = e.peticiones.length
    await pedir(oyentes, '/dem-tiles/12/3/3.png?v=aaa')
    const mismaVersionSinRed = e.peticiones.length === marca
    marca = e.peticiones.length
    const nueva = await pedir(oyentes, '/dem-tiles/12/3/3.png?v=bbb')
    const versionNuevaALaRed = e.peticiones.length === marca + 1
    const servidor = e.servidor
    e.servidor = async () => null
    const sinRedOtraVersion = await pedir(oyentes, '/dem-tiles/12/3/3.png?v=ccc')
    await pedir(oyentes, '/api/edificios?v=aaa').catch(() => null)
    const edificiosSinRed = await pedir(oyentes, '/api/edificios?v=zzz')
    e.servidor = servidor
    await pedir(oyentes, '/api/edificios?v=ddd')
    marca = e.peticiones.length
    const edificiosGuardados = await pedir(oyentes, '/api/edificios?v=ddd')
    res.versionado = {
      mismaVersionSinRed,
      versionNuevaALaRed,
      nuevaDevuelve: nueva && nueva.status,
      sinRedOtraVersion: sinRedOtraVersion && sinRedOtraVersion.status,
      edificiosSinRed: edificiosSinRed && edificiosSinRed.status,
      edificiosGuardadosSinPedir: e.peticiones.length === marca && Boolean(edificiosGuardados),
      claves: e.caches.contenido(NOMBRE).sort(),
    }
  }

  // Red de caminos: sólo JSON bueno.
  {
    const { e, srv, oyentes } = arrancar()
    srv.grafo = false
    const sinGrafo = await pedir(oyentes, '/api/road-graph')
    res.grafo = {
      noHayDevuelve: sinGrafo && sinGrafo.status,
      noHayGuardado: e.caches.contenido('saga-road-graph-v2').length,
    }
    srv.grafo = true
    await pedir(oyentes, '/api/road-graph')
    res.grafo.buenoGuardado = e.caches.contenido('saga-road-graph-v2').includes('/api/road-graph')
  }

  // Avatares (J15): cada versión (?v=) es su entrada; una foto cambiada SE REFRESCA.
  {
    const { e, oyentes } = arrancar()
    const contenido = () => e.caches.contenido('saga-field-proof-assets-v3.9.6')
    await pedir(oyentes, '/api/player-avatar/TEST?v=aaa')
    let marca = e.peticiones.length
    await pedir(oyentes, '/api/player-avatar/TEST?v=aaa')
    const mismaVersionVaALaCache = e.peticiones.length === marca
    marca = e.peticiones.length
    await pedir(oyentes, '/api/player-avatar/TEST?v=bbb')
    const versionNuevaVaALaRed = e.peticiones.length === marca + 1
    res.avatares = {
      mismaVersionVaALaCache,
      versionNuevaVaALaRed,
      entradas: contenido().filter((c) => c.startsWith('/api/player-avatar/')).sort(),
    }

    // Las fotos de nodo llevan la huella en la RUTA: se sigue buscando sin query.
    await pedir(oyentes, '/media/nodo/foto-9.webp')
    marca = e.peticiones.length
    await pedir(oyentes, '/media/nodo/foto-9.webp')
    res.fotosDeNodo = { segundaVezSinRed: e.peticiones.length === marca }
  }

  // Background sync (contrato 7): el cuerpo lleva client_sent_at_ms.
  {
    const { e, srv, oyentes } = arrancar()
    // Una base con un evento pendiente, como la deja la aplicación.
    const req = e.indexedDB.open('saga-engine-offline-v1')
    await new Promise((resolve) => {
      req.onupgradeneeded = () => {
        req.result.createObjectStore('event_queue', { keyPath: 'id' })
      }
      req.onsuccess = () => resolve()
    })
    const bd = e.indexedDB.bases.get('saga-engine-offline-v1')
    bd.stores.get('event_queue').filas.set('e1', {
      id: 'e1', user: 'TEST', type: 'node_completed', created_at: '2026-09-30T10:00:00Z', seq: 1,
      status: 'pending', retry_count: 0, payload: { code: 'A' }, node_id: 1,
    })
    const antes = Date.now()
    let espera = Promise.resolve()
    oyentes.sync({ tag: 'saga-cola-offline', waitUntil: (p) => (espera = p) })
    await espera
    const cuerpo = srv.cuerposDeSync[0]
    res.sync = {
      hayCuerpo: Boolean(cuerpo),
      client_sent_at_ms: cuerpo && typeof cuerpo.client_sent_at_ms === 'number' && cuerpo.client_sent_at_ms >= antes,
      eventos: cuerpo && cuerpo.events.length,
    }
  }

  return res
}

/* ------------------------------------------------------------------ *
 * Decisiones de avance y avisos (sin red)
 * ------------------------------------------------------------------ */

async function avisos() {
  const e = crearEntorno()
  const dec = e.cargar('src/player/avance/decisiones.ts')
  const noEmpezada = dec.rechazoDelServidor('mission_not_started_yet')
  const mala = dec.rechazoDelServidor('invalid_completion_code')
  const objeto = dec.rechazoDelServidor('missing_required_item')

  const av = e.cargar('src/player/components/AvisosDeDatos.tsx')
  const stages = [{ id: 1 }, { id: 2 }, { id: 3 }]
  const rechazos = [
    { id: 'a', nodo: '1', titulo: 'Uno', motivo: 'm', creado: '' },
    { id: 'b', nodo: '3', titulo: 'Tres', motivo: 'm', creado: '' },
    { id: 'c', nodo: '99', titulo: 'Fuera', motivo: 'm', creado: '' },
  ]
  const loGuardado = {
    sinPaquete: false, paqueteIncompleto: true, paqueteViejo: true, edadDias: 4,
    archivosDeAppQueFaltan: 3, appSinComprobar: false, mapaIncompleto: true, todoEnOrden: false,
  }

  return {
    mission_not_started_yet: {
      error: noEmpezada.error,
      aviso: noEmpezada.aviso,
      esCodigoIncorrecto: /incorrecto/i.test(noEmpezada.error) || /no aceptado/i.test(noEmpezada.aviso),
    },
    codigoMalo: { error: mala.error },
    objeto: { error: objeto.error },
    vigentes_nivel0: av.rechazosVigentes(rechazos, stages, 0).map((r) => r.id),
    vigentes_nivel2: av.rechazosVigentes(rechazos, stages, 2).map((r) => r.id), // el 1 ya lo pasó
    vigentes_nivel3: av.rechazosVigentes(rechazos, stages, 3).map((r) => r.id),
    frasesEs: av.frasesDeLoGuardado(loGuardado, 'es'),
    frasesGl: av.frasesDeLoGuardado(loGuardado, 'gl'),
    frasesTodoBien: av.frasesDeLoGuardado({ ...loGuardado, paqueteIncompleto: false, paqueteViejo: false, archivosDeAppQueFaltan: 0, mapaIncompleto: false, todoEnOrden: true }, 'es'),
  }
}

async function espacioDeLaLista() {
  const e = crearEntorno()
  const up = e.cargar('src/player/offline/usePreparacion.ts')
  const espacio = (extra) => ({
    fase: 'hecho', resultado: 'persistente', nivel: 'ok', persistente: true,
    usoBytes: 1, cuotaBytes: 2, libreBytes: 1, ...extra,
  })
  return {
    protegido: up.espacioParaLaLista(espacio(), false),
    sinPedir: up.espacioParaLaLista(espacio({ fase: 'idle' }), false),
    noConcedido: up.espacioParaLaLista(espacio({ persistente: false, resultado: 'no_concedido' }), false),
    noSoportadoConSitio: up.espacioParaLaLista(espacio({ persistente: null, resultado: 'no_soportado' }), false),
    poco: up.espacioParaLaLista(espacio({ nivel: 'justo' }), false),
    fallosDeCuota: up.espacioParaLaLista(espacio(), true),
  }
}


/* ------------------------------------------------------------------ *
 * Las pantallas se pintan: sin excepciones y diciendo lo que tienen que decir
 * ------------------------------------------------------------------ */

async function renderizado() {
  const res = {}

  function mundoReact(ajustes) {
    const e = crearEntorno()
    e.conReact = true
    // Sin `document` los componentes no usan portales (react-dom/server no los soporta).
    delete e.sandbox.document
    if (ajustes) ajustes(e)
    const React = require(require.resolve('react', { paths: [FRONT] }))
    const { renderToStaticMarkup } = require(require.resolve('react-dom/server', { paths: [FRONT] }))
    const pintar = (componente, props) => renderToStaticMarkup(React.createElement(componente, props))
    return { e, pintar, motor: e.cargar('src/player/offline/motorDeCarga.ts') }
  }

  const ruido = () => undefined

  // --- Una sola barra: el porcentaje de todo, la fase en curso y nada más ---
  {
    const { e, pintar, motor } = mundoReact()
    const carga = e.cargar('src/player/components/PantallaDeCarga.tsx')
    const partes = motor.cargaInicial()
    partes.app = { ...motor.parteVacia('app'), estado: 'listo', detalle: '44 archivos guardados' }
    partes.mision = { ...motor.parteVacia('mision'), estado: 'descargando', motivo: 'mision_cambiada', hecho: 1, total: 4, restanteMs: 125000, bytes: 5 * 1048576, detalle: 'Guardando la misión en el móvil…' }
    partes.mapa = { ...motor.parteVacia('mapa'), estado: 'pendiente', motivo: 'ruta_cambiada', detalle: 'La ruta ha cambiado' }
    const html = pintar(carga.PantallaDeCarga, { partes, modo: 'entrada' })
    res.barras = {
      unaBarra: (html.match(/role="progressbar"/g) || []).length,
      // app 100 % (peso 1), misión 25 % (peso 1), mapa 0 % (peso 3): 125 / 5 = 25.
      porcentaje: html.includes('>25 %<'),
      fase: html.includes('Misión · ≈ 2 min'),
      sinDetalles: !['44 archivos', 'Guardando la misión', 'La ruta ha cambiado', 'MB', 'data-saga-parte'].some((t) => html.includes(t)),
      sinExplicacion: !html.includes('Se guarda todo en el móvil'),
      creditos: html.includes('data-saga-creditos-mapa'),
    }
  }

  // --- La pantalla de carga con un fallo ---
  {
    const { e, pintar, motor } = mundoReact()
    const carga = e.cargar('src/player/components/PantallaDeCarga.tsx')
    const partes = motor.cargaInicial()
    partes.app = { ...motor.parteVacia('app'), estado: 'listo' }
    partes.mision = { ...motor.parteVacia('mision'), estado: 'listo' }
    partes.mapa = { ...motor.parteVacia('mapa'), estado: 'error', error: 'Faltan 3 teselas del mapa' }
    const html = pintar(carga.PantallaDeCarga, { partes, modo: 'entrada', onEntrarIgualmente: ruido, onReintentar: ruido })
    res.pantallaConFallo = {
      titulo: html.includes('No se ha podido completar'),
      error: html.includes('Faltan 3 teselas del mapa'),
      reintentar: html.includes('Reintentar'),
      entrarIgualmente: html.includes('Entrar igualmente'),
      avisoDeLoQueFalta: html.includes('Sin cobertura no tendrás el mapa.'),
      errorConSuParte: html.includes('Mapa: Faltan 3 teselas del mapa'),
    }

    // Sin fallo y recién abierta: todavía NO se ofrece entrar (la espera es de 6 s).
    const enMarcha = motor.cargaInicial()
    enMarcha.app = { ...motor.parteVacia('app'), estado: 'descargando', hecho: 3, total: 10, detalle: '3 de 10 archivos' }
    enMarcha.mision = { ...motor.parteVacia('mision'), estado: 'al_dia' }
    enMarcha.mapa = { ...motor.parteVacia('mapa'), estado: 'al_dia' }
    const html2 = pintar(carga.PantallaDeCarga, { partes: enMarcha, modo: 'entrada', onEntrarIgualmente: ruido })
    res.pantallaEnMarcha = {
      entrarIgualmente: html2.includes('Entrar igualmente'),
      porcentaje: html2.includes('>30 %<'),
      titulo: html2.includes('Preparando tu partida'),
    }

    // Sin cobertura en «Prepararse»: lo dice en vez de enseñar barras.
    const html3 = pintar(carga.PantallaDeCarga, { partes: motor.cargaInicial(), modo: 'entrada', sinCobertura: true })
    res.sinCobertura = { aviso: html3.includes('no se puede descargar nada ahora'), sinBarras: !html3.includes('progressbar') }
  }

  // --- «Prepararse» ---
  const propsBase = (extra = {}) => ({
    visible: true,
    mobile: true,
    incrustado: true,
    hasOfflineMission: true,
    hasBrowserGps: false,
    offlinePrepState: 'saved',
    browserGpsStatus: 'unavailable',
    onPrepareOfflinePack: ruido,
    onRequestGps: ruido,
    onDismiss: ruido,
    permisoCamara: 'ok',
    permisoMovimiento: 'idle',
    onRequestCamera: ruido,
    onRequestMotion: ruido,
    ...extra,
  })

  {
    const { e, pintar, motor } = mundoReact((entorno) => {
      entorno.sandbox.navigator.userAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'
    })
    const panel = e.cargar('src/player/components/FieldPrepPanel.tsx')
    const listos = motor.cargaInicial()
    for (const id of ['app', 'mision', 'mapa']) listos[id] = { ...motor.parteVacia(id), estado: 'listo' }
    const lista = motor.listaFinalDePreparacion({
      partes: listos,
      permisos: { gps: false, camara: true, movimiento: false, microfono: false },
      espacio: 'aviso',
    })
    const espacio = (extra) => ({
      fase: 'hecho', resultado: 'persistente', nivel: 'ok', persistente: true,
      usoBytes: 1048576, cuotaBytes: 4294967296, libreBytes: 4000000000, ...extra,
    })
    const preparacion = (extra) => ({
      fase: 'listo',
      permisoMicrofono: 'idle',
      onRequestMicrophone: ruido,
      espacio: espacio(),
      lista,
      instalada: false,
      onRequestStorage: ruido,
      onPedirTodos: ruido,
      onReintentar: ruido,
      onCerrar: ruido,
      ...extra,
    })

    const html = pintar(
      panel.FieldPrepPanel,
      propsBase({ preparacion: preparacion({ espacio: espacio({ resultado: 'no_concedido', persistente: false }) }) })
    )
    res.prepararse = {
      microfono: html.includes('Micrófono'),
      espacio: html.includes('Espacio'),
      espacioSinProteger: html.includes('podría borrar los datos'),
      guiaIos: html.includes('Añádela a la pantalla de inicio'),
      pedirTodos: html.includes('Pedir todos los permisos'),
      sinFilaDeMision: !html.includes('Misión offline'),
      lista: [...html.matchAll(/data-saga-lista="(\w+)"/g)].map((m) => m[1]),
      appOk: /data-saga-lista="app"[^>]*>App ✓/.test(html),
      permisosPendientes: /data-saga-lista="permisos"[^>]*>Permisos ·/.test(html),
      espacioMal: /data-saga-lista="espacio"[^>]*>Espacio ✗/.test(html),
      sinX: !html.includes('aria-label="Cerrar"'),
    }

    // Instalada y con los datos protegidos: la guía no sale.
    const instalada = pintar(panel.FieldPrepPanel, propsBase({ preparacion: preparacion({ fase: 'corriendo', permisoMicrofono: 'ok', instalada: true }) }))
    res.prepararseInstalada = {
      sinGuia: !instalada.includes('Añádela a la pantalla de inicio'),
      protegido: instalada.includes('Datos protegidos'),
      usoYCuota: instalada.includes('1 MB de 4,0 GB'),
    }

    // Y un fallo de descarga ofrece reintentar.
    const fallo = pintar(panel.FieldPrepPanel, propsBase({ preparacion: preparacion({ fase: 'fallo', permisoMicrofono: 'ok', instalada: true }) }))
    res.prepararseConFallo = { reintentar: fallo.includes('Reintentar la descarga') }
  }

  {
    const { e, pintar } = mundoReact()
    const panel = e.cargar('src/player/components/FieldPrepPanel.tsx')
    const html = pintar(panel.FieldPrepPanel, propsBase({ hasOfflineMission: false, offlinePrepState: 'idle' }))
    res.tarjetaDeEntrada = {
      filaDeMision: html.includes('Misión offline'),
      sinMicrofono: !html.includes('Micrófono'),
      sinListaFinal: !html.includes('data-saga-lista'),
      filas: ['Ubicación', 'Movimiento', 'Cámara'].every((t) => html.includes(t)),
    }
  }

  // --- La cortina de inicio ---
  const DIA = 24 * 3600 * 1000
  const cortina = (ajustes, extra = {}) => {
    const { e, pintar } = mundoReact(ajustes)
    const lock = e.cargar('src/player/components/MissionLockScreen.tsx')
    const ahora = Date.now()
    return pintar(lock.MissionLockScreen, {
      launchAtRaw: new Date(ahora + 3 * DIA).toISOString(),
      serverTimeMs: undefined,
      mobile: true,
      displayName: 'Ana',
      onUnlocked: ruido,
      onOpenDownload: ruido,
      ...extra,
    })
  }

  {
    const sinMuestra = cortina()
    res.cortina = {
      sinMuestra: /3d 0h 0m|2d 23h 59m/.test(sinMuestra),
      esperaConLaHoraDelMovil: sinMuestra.includes('hora de este móvil'),
      titulo: sinMuestra.includes('AÚN NO TOCA'),
      boton: sinMuestra.includes('Prepararse antes de salir'),
    }

    // El servidor va 10 minutos por delante: la cuenta atrás lo tiene en cuenta.
    const conMuestraFresca = cortina((e) => {
      const ahora = Date.now()
      e.local.setItem('saga:reloj-del-servidor', JSON.stringify({ serverTimeMs: ahora + 10 * 60 * 1000, recibidoEnMs: ahora }))
    })
    res.cortina.muestraFresca = { cuenta: /2d 23h 50m|2d 23h 49m/.test(conMuestraFresca), sinAvisoDeMovil: !conMuestraFresca.includes('hora de este móvil') }

    // La muestra es de hace tres días: no atrasa la cuenta atrás (el fallo de J1).
    const conMuestraVieja = cortina((e) => {
      const hace3d = Date.now() - 3 * DIA
      e.local.setItem('saga:reloj-del-servidor', JSON.stringify({ serverTimeMs: hace3d + 5000, recibidoEnMs: hace3d }))
    })
    res.cortina.muestraVieja = { cuenta: /3d 0h 0m|2d 23h 59m/.test(conMuestraVieja), conAvisoDeMovil: conMuestraVieja.includes('hora de este móvil') }

    // En gallego.
    const gallego = cortina((e) => e.local.setItem('saga_locale', 'gl'))
    res.cortina.gallego = { titulo: gallego.includes('AÍNDA NON TOCA'), boton: gallego.includes('Prepararse antes de saír') }

    // Sin fecha: no hay cortina.
    res.cortina.sinFecha = cortina(undefined, { launchAtRaw: '' }) === ''
  }

  // --- Los avisos ---
  {
    const { e, pintar } = mundoReact()
    const av = e.cargar('src/player/components/AvisosDeDatos.tsx')
    const estado = {
      sinPaquete: false, paqueteIncompleto: false, paqueteViejo: true, edadDias: 4,
      archivosDeAppQueFaltan: 2, appSinComprobar: false, mapaIncompleto: true, todoEnOrden: false,
    }
    const html = pintar(av.AvisoDeLoGuardado, { estado, mobile: true, onCerrar: ruido })
    res.avisoDeLoGuardado = {
      titulo: html.includes('Sin cobertura: entras con lo guardado'),
      viejo: html.includes('hace 4 días'),
      archivos: html.includes('Faltan 2 archivos'),
      mapa: html.includes('mapa guardado no está completo'),
      pie: html.includes('Con cobertura se actualizará'),
    }
    const bien = pintar(av.AvisoDeLoGuardado, {
      estado: { ...estado, todoEnOrden: true, paqueteViejo: false, archivosDeAppQueFaltan: 0, mapaIncompleto: false },
      mobile: true,
      onCerrar: ruido,
    })
    res.avisoDeLoGuardado.sinNadaQueAvisar = bien === ''
  }

  return res
}

/* ------------------------------------------------------------------ */


/* ------------------------------------------------------------------ *
 * El mapa 3D rehecho en el panel llega a los móviles (5.53)
 * ------------------------------------------------------------------ */

async function mapa3d() {
  const res = {}
  const stages = [
    { id: 1, lat: 42.5, lon: -8.7 },
    { id: 2, lat: 42.512, lon: -8.712 },
  ]
  const { e, mapa } = mundo()
  const NOMBRE = 'saga-route-tile-coverage-v5.55-terrarium'
  const relieve = () => e.caches.contenido(NOMBRE).filter((u) => u.startsWith('/dem-tiles/'))
  const edificios = () => e.caches.contenido(NOMBRE).filter((u) => u.startsWith('/api/edificios'))

  // Primera preparación: el relieve y los edificios se guardan con su versión.
  mapa.fijarVersionDelMapa3d('aaa')
  let resumen = await mapa.prefetchMissionMapTiles(stages, undefined, {})
  res.primera = {
    completo: resumen.completo,
    relieveConVersion: relieve().length > 0 && relieve().every((u) => u.endsWith('?v=aaa')),
    edificios: edificios(),
    resumenVale: Boolean(mapa.getOfflineMapTileSummary()),
    sufijo: mapa.sufijoDelMapa3d(),
  }
  const relieveA = relieve().length

  // Misma versión al volver a entrar: nada que bajar.
  const comprobacionIgual = await mapa.comprobarMapaGuardado(stages)
  res.mismaVersion = { estado: comprobacionIgual.evaluacion.estado }

  // El panel lo rehace: otra versión. El resumen viejo ya no vale y faltan SOLO las de relieve.
  mapa.fijarVersionDelMapa3d('bbb')
  const comprobacion = await mapa.comprobarMapaGuardado(stages)
  res.rehecho = {
    resumenVale: Boolean(mapa.getOfflineMapTileSummary()),
    estado: comprobacion.evaluacion.estado,
    faltan: comprobacion.faltan,
    relieveA,
  }
  const marca = e.peticiones.length
  resumen = await mapa.prefetchMissionMapTiles(stages, undefined, {})
  const lotes = e.peticiones.slice(marca).filter((p) => p.ruta === '/api/teselas/lote')
  const pedidas = lotes.flatMap((p) => JSON.parse(String(p.cuerpo)).teselas)
  res.rebajado = {
    completo: resumen.completo,
    pedidasDeImagen: pedidas.filter((u) => u.startsWith('/map-tiles/')).length,
    pedidasDeRelieve: pedidas.filter((u) => u.startsWith('/dem-tiles/')).length,
    quedanViejas: relieve().filter((u) => !u.endsWith('?v=bbb')).length,
    relieveB: relieve().length,
    edificios: edificios(),
  }

  res.tiempoDelLote = [1, 40, 120, 200].map((n) => mapa.tiempoMaximoDelLote(n))

  // Un valor raro no entra en la URL.
  mapa.fijarVersionDelMapa3d('x"><script>')
  res.versionRara = mapa.sufijoDelMapa3d()
  // Un servidor viejo (sin el campo) no borra la versión conocida.
  mapa.fijarVersionDelMapa3d('ccc')
  mapa.fijarVersionDelMapa3d(undefined)
  res.servidorViejo = mapa.sufijoDelMapa3d()

  // El relieve lejano (z11-z12) sólo cerca de la ruta; el satélite de la comarca, entero.
  mapa.fijarVersionDelMapa3d('')
  const plan = mapa.planificarTeselas(stages)
  const porZoom = (prefijo, z) => plan.urls.filter((u) => u.startsWith(`/${prefijo}/${z}/`)).length
  const caja11 = mapa.cajaDeTeselas(stages, 11, 40)
  res.plan = {
    sat11: porZoom('map-tiles', 11),
    sat12: porZoom('map-tiles', 12),
    dem11: porZoom('dem-tiles', 11),
    dem12: porZoom('dem-tiles', 12),
    dem14: porZoom('dem-tiles', 14),
    dem11DentroDeLaCaja: plan.urls
      .filter((u) => u.startsWith('/dem-tiles/11/'))
      .every((u) => {
        const [, , , x, y] = u.split('?')[0].replace('.png', '').split('/')
        return +x >= caja11.minX && +x <= caja11.maxX && +y >= caja11.minY && +y <= caja11.maxY
      }),
  }
  return res
}

/* ------------------------------------------------------------------ *
 * MB y tiempo estimado en la pantalla de carga (5.53)
 * ------------------------------------------------------------------ */

async function ritmo() {
  const { motor } = mundo()
  const res = {}
  const t = (o) => motor.tiempoRestanteMs({ inicioMs: 0, hechoAlEmpezar: 0, ...o })
  res.estimaciones = {
    pronto: t({ ahoraMs: 1000, hecho: 50, total: 100 }),
    pocoAvance: t({ ahoraMs: 10000, hecho: 2, total: 100 }),
    mitad: t({ ahoraMs: 10000, hecho: 50, total: 100 }),
    acabado: t({ ahoraMs: 10000, hecho: 100, total: 100 }),
    sinTotal: t({ ahoraMs: 10000, hecho: 5, total: 0 }),
  }
  res.textos = {
    s: motor.textoDeTiempo(41000),
    min: motor.textoDeTiempo(185000),
    h: motor.textoDeTiempo(75 * 60000),
    nulo: motor.textoDeTiempo(null),
  }
  const carga = (app, mision, mapa) => ({ app, mision, mapa })
  res.general = {
    comprobando: motor.porcentajeGeneral(motor.cargaInicial()),
    todoAlDia: motor.porcentajeGeneral(carga({ ...motor.parteVacia('app'), estado: 'al_dia', hecho: 0, total: 0 }, { ...motor.parteVacia('mision'), estado: 'al_dia', hecho: 0, total: 0 }, { ...motor.parteVacia('mapa'), estado: 'al_dia', hecho: 0, total: 0 })),
    soloMapa: motor.porcentajeGeneral(carga({ ...motor.parteVacia('app'), estado: 'al_dia', hecho: 0, total: 0 }, { ...motor.parteVacia('mision'), estado: 'al_dia', hecho: 0, total: 0 }, { ...motor.parteVacia('mapa'), estado: 'descargando', hecho: 40, total: 100 })),
    mapaPesaMas: motor.porcentajeGeneral(carga({ ...motor.parteVacia('app'), estado: 'listo', hecho: 10, total: 10 }, { ...motor.parteVacia('mision'), estado: 'listo', hecho: 4, total: 4 }, { ...motor.parteVacia('mapa'), estado: 'descargando', hecho: 0, total: 100 })),
    enCurso: motor.parteEnCurso(carga({ ...motor.parteVacia('app'), estado: 'listo', hecho: 10, total: 10 }, { ...motor.parteVacia('mision'), estado: 'al_dia', hecho: 0, total: 0 }, { ...motor.parteVacia('mapa'), estado: 'descargando', hecho: 1, total: 100 })),
  }

  // El motor guarda los bytes y el tiempo restante de lo que va bajando.
  const vistos = []
  const parte = {
    id: 'mapa',
    comprobar: async () => ({ pendiente: true, motivo: 'primera_vez', detalle: '' }),
    descargar: async (alAvanzar) => {
      alAvanzar({ hecho: 0, total: 100, detalle: 'a', bytes: 0 })
      await pausa(3100)
      alAvanzar({ hecho: 50, total: 100, detalle: 'b', bytes: 5 * 1048576 })
      return { ok: true }
    },
  }
  const inicial = motor.cargaInicial()
  inicial.mapa = { ...inicial.mapa, estado: 'pendiente' }
  inicial.app = { ...inicial.app, estado: 'al_dia' }
  inicial.mision = { ...inicial.mision, estado: 'al_dia' }
  const final = await motor.descargarPartes([parte], inicial, { alCambiar: (e) => vistos.push(clonar(e.mapa)) })
  const mitad = vistos.find((v) => v.detalle === 'b')
  res.motor = {
    bytes: mitad && mitad.bytes,
    restante: mitad && mitad.restanteMs,
    alAcabarSinRestante: final.mapa.restanteMs === null,
  }
  return res
}

const ESCENARIOS = {
  mapa3d,
  ritmo,
  revisiones,
  reloj,
  almacenamiento,
  persistencia,
  motor,
  cargaEntera,
  configuracion,
  teselas,
  app,
  reinicio,
  cola,
  mochilaForjada,
  guardarPaquete,
  preparacionConCola,
  preparacionSinRed,
  fallosAlBajar,
  otrosJugadores,
  fotosDeCampo,
  vigilanteDeVersion,
  recargaSegura,
  serviceWorker,
  avisos,
  espacioDeLaLista,
  renderizado,
}

async function main() {
  const pedidos = process.argv.slice(2)
  const nombres = pedidos.length ? pedidos : Object.keys(ESCENARIOS)
  const salida = {}
  for (const nombre of nombres) {
    const t0 = Date.now()
    try {
      salida[nombre] = await ESCENARIOS[nombre]()
    } catch (error) {
      salida[nombre] = { __error: String((error && error.stack) || error) }
    }
    salida[nombre] = salida[nombre] ?? null
    if (process.env.SAGA_TIEMPOS) console.error(nombre, Date.now() - t0, 'ms')
  }
  console.log(JSON.stringify(salida))
}

main().then(() => setTimeout(() => process.exit(0), 10))

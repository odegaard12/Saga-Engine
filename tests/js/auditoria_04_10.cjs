// Auditoría del 04/10/2026 (mochila de principio a fin, premios, fotos, GPS,
// minijuegos): ejecuta los módulos TS del jugador TAL CUAL en el navegador de
// mentira de entorno_navegador.cjs y vuelca en JSON lo que hacen.
// tests/test_auditoria_js.py lo comprueba y, en el escenario de extremo a
// extremo, sube la cola que deja el móvil al servidor de verdad.
//
// Uso: node tests/js/auditoria_04_10.cjs [partida.json]
//   partida.json: lo que devolvió /api/game?offline_pack=true para la misión
//   sintética (lo escribe la prueba de Python). Sin él, ese escenario se salta.
'use strict'

const fs = require('fs')
const { crearEntorno } = require('./entorno_navegador.cjs')

const USUARIO = 'PLAYER 1'

function esperar(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

/** Un móvil "recargado": entorno nuevo con el localStorage y el IndexedDB del anterior. */
function recargar(previo) {
  const e = crearEntorno()
  for (const k of Object.keys(previo.local)) e.local.setItem(k, previo.local.getItem(k))
  for (const [nombre, base] of previo.indexedDB.bases) e.indexedDB.bases.set(nombre, base)
  return e
}

async function colaDe(e, user = USUARIO) {
  const mp = e.cargar('src/player/offline/missionPack.ts')
  const eventos = await mp.getQueuedOfflineEvents(user)
  return eventos.map((ev) => ({
    type: ev.type,
    seq: ev.seq,
    node_id: ev.node_id,
    item: ev.payload.inventory_item_id || null,
    cantidad: ev.payload.inventory_quantity ?? null,
    accion: ev.payload.inventory_action || null,
    grant_id: ev.payload.grant_id || null,
    level_before: ev.payload.level_before ?? null,
  }))
}

/* ------------------------------------------------------------------ */
/* GPS: el rescate de 45 s                                             */
/* ------------------------------------------------------------------ */

function rescateGps() {
  const e = crearEntorno()
  const rt = e.cargar('src/player/runtime.ts')
  const nodo = { id: 1, title: 'N', lat: 40.5, lon: -3.5, radius: 25, entry: { mode: 'gps' } }
  const base = { currentStage: nodo, finished: false, distanceMeters: null, debugEnabled: false }
  const r = (gpsState, esperandoGpsMs) => {
    const s = rt.deriveStageRuntime({ ...base, gpsState, esperandoGpsMs })
    return { reason: s.reason, canEnter: s.canEnter }
  }
  return {
    espera: rt.ESPERA_MAXIMA_DE_GPS_MS,
    denegado_10s: r('denied', 10_000),
    denegado_46s: r('denied', 46_000),
    sin_senal_46s: r('unavailable', 46_000),
    listo_sin_distancia_46s: r('ready', 46_000),
    listo_sin_distancia_10s: r('ready', 10_000),
    // Con distancia conocida manda la distancia, nunca el rescate.
    con_distancia_lejos: (() => {
      const s = rt.deriveStageRuntime({ ...base, gpsState: 'ready', distanceMeters: 900, esperandoGpsMs: 99_000 })
      return { reason: s.reason, canEnter: s.canEnter }
    })(),
  }
}

/* ------------------------------------------------------------------ */
/* Premio del nodo (decisiones puras)                                  */
/* ------------------------------------------------------------------ */

function premios() {
  const e = crearEntorno()
  const d = e.cargar('src/player/avance/decisiones.ts')
  const armado = { id: 9, title: 'S', reward: { item_id: 'llave', label: 'Llave', quantity: 2, message: 'Toma' } }
  const enConfig = { id: 10, title: 'S', config: { reward_item_id: 'mapa', reward_item_label: 'Mapa' } }
  const coleccionable = {
    id: 11,
    title: 'C',
    physical_item_id: 'gema',
    is_map_collectible: true,
    config: { reward_item_id: 'gema', is_map_collectible: true },
  }
  const p = d.premioDelNodo(armado)
  return {
    armado: p,
    aviso_armado: d.avisoDePremio(p),
    en_config: d.premioDelNodo(enConfig),
    aviso_sin_mensaje: d.avisoDePremio(d.premioDelNodo(enConfig)),
    coleccionable: d.premioDelNodo(coleccionable),
    sin_premio: d.premioDelNodo({ id: 12, title: 'X' }),
    clave_coleccionable: d.claveDeColeccionable(coleccionable),
  }
}

/* ------------------------------------------------------------------ */
/* Mochila local: entregas únicas, deltas, hidratación, reinicio       */
/* ------------------------------------------------------------------ */

async function mochila() {
  const e = crearEntorno()
  const inv = e.cargar('src/player/offline/inventory.ts')

  const uno = inv.entregarUnaVez({ user: USUARIO, item_id: 'gema', label: 'Gema', quantity: 2, grant_id: 'collect:5', source: 'manual', node_id: '5' })
  const dos = inv.entregarUnaVez({ user: USUARIO, item_id: 'gema', label: 'Gema', quantity: 2, grant_id: 'collect:5', source: 'manual', node_id: '5' })
  // Otra recogida del mismo objeto en otro nodo: el evento lleva SUS unidades, no el total.
  inv.entregarUnaVez({ user: USUARIO, item_id: 'gema', label: 'Gema', quantity: 1, grant_id: 'collect:6', source: 'manual', node_id: '6' })
  await esperar(30)
  const cola = await colaDe(e)
  const tras = inv.getInventoryItem(USUARIO, 'gema').quantity

  // El panel da una gema más: el móvil YA tiene gemas. Llega como entrega.
  const remoto = {
    items: [{ item_id: 'gema', label: 'Gema', state: 'collected', quantity: 4 }],
    grants: [
      { grant_id: 'collect:5', item_id: 'gema', quantity: 2 },
      { grant_id: 'collect:6', item_id: 'gema', quantity: 1 },
      { grant_id: 'admin:aa', item_id: 'gema', quantity: 1 },
    ],
  }
  inv.hydrateInventoryFromServer(USUARIO, remoto)
  const conAdmin = inv.getInventoryItem(USUARIO, 'gema').quantity
  inv.hydrateInventoryFromServer(USUARIO, remoto)
  const otraVez = inv.getInventoryItem(USUARIO, 'gema').quantity

  // Caché borrada: el móvil vacío recibe la cuenta del servidor, sin sumar las entregas encima.
  const limpio = crearEntorno()
  const inv2 = limpio.cargar('src/player/offline/inventory.ts')
  inv2.hydrateInventoryFromServer(USUARIO, {
    items: [{ item_id: 'gema', label: 'Gema', state: 'collected', quantity: 4 }],
    grants: [
      ...remoto.grants,
      // Una entrega de algo que ya se gastó (no está en items): no resucita.
      { grant_id: 'reward:2', item_id: 'llave_gastada', quantity: 1 },
    ],
  })
  const tras_cache = {
    gema: inv2.getInventoryItem(USUARIO, 'gema')?.quantity ?? 0,
    llave_gastada: inv2.getInventoryItem(USUARIO, 'llave_gastada')?.quantity ?? 0,
    // Y las entregas quedan apuntadas: un reintento del premio no suma.
    reintento: inv2.entregarUnaVez({ user: USUARIO, item_id: 'gema', quantity: 2, grant_id: 'collect:5' }).entregado,
  }

  // Reinicio del organizador: la mochila (y sus entregas) se vacían.
  const reinicio = crearEntorno()
  const inv3 = reinicio.cargar('src/player/offline/inventory.ts')
  inv3.entregarUnaVez({ user: USUARIO, item_id: 'gema', quantity: 2, grant_id: 'collect:5' })
  reinicio.reloj = null
  inv3.hydrateInventoryFromServer(USUARIO, { reset_at: Date.now() + 60_000, items: [] })
  const tras_reinicio = {
    gema: inv3.getInventoryItem(USUARIO, 'gema')?.quantity ?? 0,
    vuelve_a_entregar: inv3.entregarUnaVez({ user: USUARIO, item_id: 'gema', quantity: 2, grant_id: 'collect:5' }).entregado,
  }

  return {
    primera: uno.entregado,
    segunda: dos.entregado,
    unidades_tras_repetir: tras,
    cola,
    con_admin: conAdmin,
    hidratar_dos_veces: otraVez,
    tras_cache,
    tras_reinicio,
  }
}

/* ------------------------------------------------------------------ */
/* Fabricar: gasta y recoge por la cola                                */
/* ------------------------------------------------------------------ */

async function fabricar() {
  const e = crearEntorno()
  const inv = e.cargar('src/player/offline/inventory.ts')
  const recetas = e.cargar('src/player/offline/recipes.ts')
  const receta = recetas.RECIPES[0]
  for (const input of receta.inputs) {
    inv.collectInventoryItem({ user: USUARIO, item_id: input.item_id, quantity: input.quantity })
  }
  const hecho = recetas.craftRecipe(USUARIO, receta.recipe_id)
  await esperar(30)
  const cola = await colaDe(e)
  return {
    hecho,
    entradas: receta.inputs.map((i) => i.item_id),
    salidas: receta.outputs.map((o) => o.item_id),
    cola,
    // Repetir sin ingredientes no puede gastar otra vez.
    repetir: recetas.craftRecipe(USUARIO, receta.recipe_id),
  }
}

/* ------------------------------------------------------------------ */
/* Orden FIFO de la cola con la primera lectura asíncrona              */
/* ------------------------------------------------------------------ */

async function ordenDeLaCola() {
  const e1 = crearEntorno()
  const mp1 = e1.cargar('src/player/offline/missionPack.ts')
  // Algo ya en la cola: el módulo nuevo tiene que leerla (asíncrono) antes de numerar.
  await mp1.queueOfflineEvent({ user: USUARIO, type: 'qr_scanned', payload: { previo: true } })
  const e = recargar(e1)
  const inv = e.cargar('src/player/offline/inventory.ts')
  const mp = e.cargar('src/player/offline/missionPack.ts')
  // Sin esperar entre medias: recogida y, en el mismo instante, el avance del nodo.
  inv.collectInventoryItem({ user: USUARIO, item_id: 'gema', quantity: 2, queue_event: true, grant_id: 'collect:2' })
  const avance = mp.queueOfflineEvent({ user: USUARIO, type: 'node_completed', payload: { level_before: 2 } })
  await avance
  await esperar(30)
  return (await colaDe(e)).map((ev) => ev.type + (ev.item ? ':' + ev.item : ''))
}

/* ------------------------------------------------------------------ */
/* Fotos: qué se hace según el servidor, y que la cola no se atasque   */
/* ------------------------------------------------------------------ */

async function fotos() {
  const e = crearEntorno()
  const lf = e.cargar('src/player/offline/localFirst.ts')
  const d = (estado, intentos = 0) => lf.decidirTrasSubida(estado, intentos)

  const decisiones = {
    ok: d(200),
    malo: d(400),
    grande: d(413),
    cupo: d(429),
    sesion: d(403),
    sin_posicion: d(409),
    caido: d(503),
    sin_red_0: d(null, 0),
    sin_red_3: d(null, 3),
    sin_red_40: d(null, 40),
  }

  // Cola real: una foto que el servidor rechaza (413), otra sin GPS que sube bien.
  const idGrande = await lf.saveOfflinePhoto({ user: USUARIO, image_data_url: 'data:image/jpeg;base64,AAAA', lat: 1, lon: 2 })
  const idSinGps = await lf.saveOfflinePhoto({ id: 'photo_fijo_1', user: USUARIO, image_data_url: 'data:image/jpeg;base64,BBBB' })
  const cuerpos = []
  e.servidor = async (url, init) => {
    if (url.pathname !== '/api/field-proofs') return null
    const cuerpo = JSON.parse(init.body)
    cuerpos.push(cuerpo)
    return new Response('{}', { status: cuerpo.client_proof_id === idGrande ? 413 : 200 })
  }
  const fallidas = []
  e.sandbox.dispatchEvent = (ev) => {
    if (ev && ev.type === 'saga:foto-fallida') fallidas.push(ev.detail.motivo)
    return true
  }
  await lf.flushOfflinePhotos(USUARIO)
  const tras1 = await lf.listarFotosPendentes(USUARIO)
  const peticiones1 = cuerpos.length
  // Segunda vuelta: la rechazada NO se vuelve a mandar.
  await lf.flushOfflinePhotos(USUARIO)

  // Sin red: cuenta intento y espera; la siguiente vuelta inmediata no lo reintenta.
  const e2 = crearEntorno()
  const lf2 = e2.cargar('src/player/offline/localFirst.ts')
  await lf2.saveOfflinePhoto({ user: USUARIO, image_data_url: 'data:image/jpeg;base64,CCCC', lat: 1, lon: 2 })
  let llamadas = 0
  e2.servidor = async () => {
    llamadas += 1
    return null
  }
  await lf2.flushOfflinePhotos(USUARIO)
  const [trasFallo] = await lf2.listarFotosPendentes(USUARIO)
  await lf2.flushOfflinePhotos(USUARIO)

  // 403: no cuenta intento.
  const e3 = crearEntorno()
  const lf3 = e3.cargar('src/player/offline/localFirst.ts')
  await lf3.saveOfflinePhoto({ user: USUARIO, image_data_url: 'data:image/jpeg;base64,DDDD', lat: 1, lon: 2 })
  e3.servidor = async () => new Response('{}', { status: 403 })
  await lf3.flushOfflinePhotos(USUARIO)
  const [trasSesion] = await lf3.listarFotosPendentes(USUARIO)

  // Una subida que no contesta nunca: el candado no se queda cogido.
  const e4 = crearEntorno()
  const lf4 = e4.cargar('src/player/offline/localFirst.ts')
  await lf4.saveOfflinePhoto({ user: USUARIO, image_data_url: 'data:image/jpeg;base64,EEEE', lat: 1, lon: 2 })
  e4.servidor = (url, init) =>
    new Promise((_, rechazar) => {
      if (init.signal) init.signal.addEventListener('abort', () => rechazar(new Error('AbortError')))
    })
  // El tiempo máximo de la cola (45 s) se acorta con los temporizadores del entorno (>100 ms -> 200 ms).
  const t0 = Date.now()
  await lf4.flushOfflinePhotos(USUARIO)
  const colgada = { tardo_ms: Date.now() - t0, intentos: (await lf4.listarFotosPendentes(USUARIO))[0]?.intentos }

  return {
    decisiones,
    tiempo_subida_ms: lf.TIEMPO_SUBIDA_FOTO_MS,
    tras_primera_vuelta: tras1.map((f) => ({ id: f.id, fallida: !!f.fallida, motivo: f.motivo_fallo || null })),
    peticiones_primera: peticiones1,
    peticiones_total: cuerpos.length,
    client_ids: cuerpos.map((c) => c.client_proof_id),
    sin_gps_sin_coordenadas: cuerpos.filter((c) => c.client_proof_id === idSinGps).every((c) => !('lat' in c) && !('lon' in c)),
    id_respetado: idSinGps,
    fallidas_avisadas: fallidas,
    sin_red: { llamadas, intentos: trasFallo.intentos, espera_futura: trasFallo.proximo_intento_ms > Date.now() },
    sesion: { intentos: trasSesion.intentos || 0, espera_futura: trasSesion.proximo_intento_ms > Date.now() },
    colgada,
  }
}

/* ------------------------------------------------------------------ */
/* Minijuegos: lógica pura                                             */
/* ------------------------------------------------------------------ */

function minijuegos() {
  const e = crearEntorno()
  const semilla = e.cargar('src/player/minigames/families/sequenceCode/semilla.ts')
  const alt = e.cargar('src/player/minigames/core/modoAlternativo.ts')
  const medidor = e.cargar('src/player/minigames/families/audioChallenge/medidor.ts')
  const relevo = e.cargar('src/player/minigames/families/teamRelay/presencia.ts')
  const evidencia = e.cargar('src/player/avance/evidencia.ts')

  const porJugador = { seed: 'p-abc', seed_fixed: false }
  const fijada = { seed: 'patron', seed_fixed: true }

  // Audio: 3 s de viento a golpes (0,4 s sí / 0,3 s no) contra 2,6 s seguidos.
  const viento = medidor.crearMedidorSostenido(medidor.leerConfigDelMedidor({}))
  let vientoGana = false
  for (let t = 0; t <= 3000; t += 16) {
    const fuerte = t % 700 < 400
    if (viento.muestra(fuerte ? 140 : 20, t).superado) vientoGana = true
  }
  const soplo = medidor.crearMedidorSostenido(medidor.leerConfigDelMedidor({}))
  let soploGanaEn = null
  for (let t = 0; t <= 4000; t += 16) {
    if (soplo.muestra(140, t).superado && soploGanaEn === null) soploGanaEn = t
  }
  // Igual a 120 Hz que a 30 Hz: se mide con el reloj, no por fotogramas.
  const tasa = (paso) => {
    const m = medidor.crearMedidorSostenido({ umbral: 95, sostenidoMs: 2500 })
    for (let t = 0; t <= 4000; t += paso) if (m.muestra(150, t).superado) return t
    return null
  }

  const limitador = alt.crearLimitadorDeToques()
  const toques = [0, 50, 100, 130, 200, 260, 380].filter((t) => limitador(t))

  alt.marcarModoAlternativo(55, 'denegado')
  const ev = evidencia.construirEvidencia({ nodo: 55, code: 'OK' })

  return {
    simon: {
      intento0: semilla.semillaDelIntento(porJugador, 1, 0),
      intento1: semilla.semillaDelIntento(porJugador, 1, 1),
      fijada0: semilla.semillaDelIntento(fijada, 1, 0),
      fijada1: semilla.semillaDelIntento(fijada, 1, 3),
      vieja_de_serie: semilla.semillaDelIntento({ seed: 'saga-simon' }, 7, 0),
      vieja_de_serie_fijada: semilla.semillaDelIntento({ seed: 'saga-simon', seed_fixed: true }, 7, 0),
    },
    alternativo: {
      sin_comprobar: alt.puedeUsarModoAlternativo('sin_comprobar'),
      disponible: alt.puedeUsarModoAlternativo('disponible'),
      denegado: alt.puedeUsarModoAlternativo('denegado'),
      no_disponible: alt.puedeUsarModoAlternativo('no_disponible'),
      mudo: alt.puedeUsarModoAlternativo('mudo'),
      denegado_sin_permiso_del_nodo: alt.puedeUsarModoAlternativo('denegado', false),
      penalizacion: alt.penalizacionDelModo(true),
      sin_penalizacion: alt.penalizacionDelModo(false),
      toques_validos: toques,
      evidencia: { modo_alternativo: ev.modo_alternativo, motivo: ev.modo_alternativo_motivo },
      host_penalizacion: alt.penalizacionDelResultado({ penaltyMs: 60000 }),
      host_sin: alt.penalizacionDelResultado({ type: 'bearing_hunt' }) ?? null,
    },
    audio: {
      defecto: medidor.leerConfigDelMedidor({}),
      recortado: medidor.leerConfigDelMedidor({ volume_threshold: 999, sustain_ms: 1 }),
      viento_gana: vientoGana,
      soplo_gana_en_ms: soploGanaEn,
      a_120hz: tasa(8),
      a_30hz: tasa(33),
    },
    relevo: {
      solo: relevo.relevoListo(0, 2),
      con_uno: relevo.relevoListo(1, 2),
      necesarios_1: relevo.miembrosNecesarios(1),
      necesarios_vacio: relevo.miembrosNecesarios(undefined),
      presentes_con_dos: relevo.miembrosPresentes(2),
    },
  }
}

/* ------------------------------------------------------------------ */
/* Validador del panel: requisitos en orden                            */
/* ------------------------------------------------------------------ */

function validadorDelPanel() {
  const e = crearEntorno()
  const c = e.cargar('src/admin/lib/adminSaveChecks.ts')
  const n = (id, extra = {}) => ({ id, title: 'N' + id, ...extra })
  return {
    en_orden: c.validateRouteDependencies([
      n(1, { config: { game_id: 'sequence_code', reward_item_id: 'llave' } }),
      n(2, { required_item_id: 'llave', requires_item: true }),
    ]),
    al_reves: c.validateRouteDependencies([
      n(1, { required_item_id: 'llave', requires_item: true }),
      n(2, { config: { game_id: 'sequence_code', reward_item_id: 'llave' } }),
    ]),
    // Coleccionable de mapa: physical + reward con el mismo id = UNA entrega.
    coleccionable_no_cuenta_doble: c.validateRouteDependencies([
      n(1, { physical_item_id: 'gema', is_map_collectible: true, config: { reward_item_id: 'gema', is_map_collectible: true } }),
      n(2, { required_item_id: 'gema', required_item_quantity: 2, requires_item: true }),
    ]),
    gastada_antes: c.validateRouteDependencies([
      n(1, { physical_item_id: 'gema' }),
      n(2, { required_item_id: 'gema', requires_item: true, consume_required_item: true }),
      n(3, { required_item_id: 'gema', requires_item: true }),
    ]),
    nadie_lo_da: c.validateRouteDependencies([n(1, { required_item_id: 'nada', requires_item: true })]),
  }
}

/* ------------------------------------------------------------------ */
/* De extremo a extremo: misión sintética sin red, con recarga         */
/* ------------------------------------------------------------------ */

async function extremoAExtremo(fichero) {
  if (!fichero) return { saltado: true }
  const partida = JSON.parse(fs.readFileSync(fichero, 'utf8'))

  async function jugar(e, payload, opciones = {}) {
    const ec = e.cargar('src/player/avance/enviarCodigo.ts')
    const avisos = []
    let actual = payload
    const entorno = {
      payload: actual,
      currentStage: actual.current_stage,
      esColeccionable: Boolean(opciones.coleccionable),
      claveDelNodo: String(actual.current_stage.id),
      candado: { current: false },
      setSubmitting() {},
      setSubmitError(m) {
        if (m) avisos.push('error:' + m)
      },
      cerrarHoja() {},
      sumarAlMarcador() {},
      ponerPartidaSinServidor(p) {
        actual = p
      },
      refrescarPartida: async () => actual,
      aviso(texto) {
        avisos.push(texto)
      },
      pantalla() {},
    }
    const ok = await ec.enviarCodigo(entorno, { code: 'OK', timeSpentMs: 10_000, penaltyMs: 0 })
    return { ok, payload: actual, avisos }
  }

  // Sin cobertura en todo el tramo.
  let e = crearEntorno()
  e.sandbox.navigator.onLine = false
  const mp = e.cargar('src/player/offline/missionPack.ts')
  await mp.saveMissionPack({ user: partida.user, config: {}, payload: partida })

  const pasos = []
  let payload = partida
  // n0 (minijuego con premio) y n1 (coleccionable).
  let r = await jugar(e, payload)
  pasos.push({ nodo: payload.current_stage.id, ok: r.ok, avisos: r.avisos })
  payload = r.payload
  r = await jugar(e, payload, { coleccionable: true })
  pasos.push({ nodo: payload.current_stage.id, ok: r.ok, avisos: r.avisos })
  payload = r.payload
  await esperar(250) // el aviso del premio sale con retraso

  // El móvil se cierra y se vuelve a abrir, todavía sin red.
  e = recargar(e)
  e.sandbox.navigator.onLine = false
  const mp2 = e.cargar('src/player/offline/missionPack.ts')
  const guardado = await mp2.getStoredMissionPack(partida.user)
  payload = guardado.payload
  const tras_recarga_nivel = payload.level

  // n2 (pide la llave del premio) y n3 (pide las 2 gemas y las gasta).
  r = await jugar(e, payload)
  pasos.push({ nodo: payload.current_stage.id, ok: r.ok, avisos: r.avisos })
  payload = r.payload
  r = await jugar(e, payload)
  pasos.push({ nodo: payload.current_stage.id, ok: r.ok, avisos: r.avisos })
  payload = r.payload
  await esperar(250)

  const inv = e.cargar('src/player/offline/inventory.ts')
  const cola = await mp2.getQueuedOfflineEvents(partida.user)
  // Lo que subiría el móvil al volver la red: la cola en orden y la mochila de
  // antes de gastar (igual que enviarCola).
  const mochila = mp2.reconstruirMochilaAntesDeConsumir(inv.loadInventorySnapshot(partida.user), cola)
  const cuerpo = mp2.cuerpoDeSincronizacion({
    user: partida.user,
    events: cola.map((ev) => ({
      client_event_id: ev.id,
      type: ev.type,
      source: ev.source || 'offline_queue',
      node_id: ev.node_id,
      payload: { ...ev.payload, local_event_id: ev.id, local_created_at: ev.created_at },
    })),
    mochila,
  })

  return {
    pasos,
    tras_recarga_nivel,
    nivel_final: payload.level,
    mochila_local: inv.loadInventorySnapshot(partida.user).items.map((i) => ({ id: i.item_id, n: i.quantity, estado: i.state })),
    orden: cola.map((ev) => ev.type + (ev.payload.inventory_item_id ? ':' + ev.payload.inventory_item_id : '') + (ev.payload.grant_id ? '@' + ev.payload.grant_id : '')),
    cuerpo,
  }
}

/* ------------------------------------------------------------------ */
/* Caché borrada / sesión cerrada: un móvil vacío recupera la mochila  */
/* ------------------------------------------------------------------ */

function dispositivoNuevo(fichero) {
  if (!fichero) return { saltado: true }
  const partida = JSON.parse(fs.readFileSync(fichero, 'utf8'))
  const e = crearEntorno()
  const reseteo = e.cargar('src/player/offline/reseteoDelServidor.ts')
  const inv = e.cargar('src/player/offline/inventory.ts')
  const req = e.cargar('src/player/rewards/stageItemRequirement.ts')
  return reseteo.aplicarResetDelServidor(partida.user, partida).then(() => ({
    items: inv.loadInventorySnapshot(partida.user).items.map((i) => ({ id: i.item_id, n: i.quantity, estado: i.state })),
    // ¿Abriría el nodo que pide la llave? (null = sí, no falta nada)
    puerta: req.checkStageItemGate(partida.user, (partida.stages || []).find((st) => String(st.id) === '303') || null),
  }))
}

async function main() {
  const salida = {}
  const escenarios = {
    rescateGps: () => rescateGps(),
    premios: () => premios(),
    mochila,
    fabricar,
    ordenDeLaCola,
    fotos,
    minijuegos: () => minijuegos(),
    validadorDelPanel: () => validadorDelPanel(),
    extremoAExtremo: () => extremoAExtremo(process.argv[2]),
    dispositivoNuevo: () => dispositivoNuevo(process.argv[3]),
  }
  for (const [nombre, fn] of Object.entries(escenarios)) {
    try {
      salida[nombre] = await fn()
    } catch (error) {
      salida[nombre] = { __error: String((error && error.stack) || error) }
    }
  }
  console.log(JSON.stringify(salida))
}

main().then(() => setTimeout(() => process.exit(0), 10))

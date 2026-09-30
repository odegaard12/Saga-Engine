// Ejecuta la lógica PURA del panel de administración (frontend/src/admin/lib)
// contra simulaciones del servidor y vuelca en JSON lo que ocurre. Lo usa
// tests/test_admin_guardado_honesto.py.
//
// No hay runner de JS en el repo: se transpila al vuelo con el `typescript` de
// frontend/node_modules (igual que registro_frontend.cjs). Aquí el "servidor" es
// una función `fetch` falsa que apunta las peticiones que recibe y contesta lo
// que cada escenario le diga, así se comprueba QUÉ se manda y CUÁNTAS veces.
//
// Uso: node tests/js/admin_frontend.cjs   (imprime un JSON por stdout)
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const RAIZ = path.resolve(__dirname, '..', '..')
const FRONT = path.join(RAIZ, 'frontend')
const ts = require(path.join(FRONT, 'node_modules', 'typescript'))
const cache = new Map()

// Lo que ven los módulos como globales del navegador. Se cambia por escenario.
const entorno = {
  fetch: null,
  eventos: [],
}

function resolver(desde, spec) {
  const base = path.resolve(path.dirname(desde), spec)
  for (const c of [base, base + '.ts', base + '.tsx', base + '.json', path.join(base, 'index.ts')]) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c
  }
  throw new Error('no resuelve ' + spec + ' desde ' + desde)
}

const contexto = vm.createContext({
  console,
  fetch: (...args) => entorno.fetch(...args),
  // El aviso de sesión caducada se lanza en `window`.
  window: {
    dispatchEvent: (evento) => {
      entorno.eventos.push({ tipo: evento.type, detalle: evento.detail })
      return true
    },
  },
  CustomEvent: class {
    constructor(type, init) {
      this.type = type
      this.detail = init && init.detail
    }
  },
})

function cargar(fichero) {
  if (cache.has(fichero)) return cache.get(fichero).exports
  const mod = { exports: {} }
  cache.set(fichero, mod)
  const fuente = fs.readFileSync(fichero, 'utf8')
  if (fichero.endsWith('.json')) {
    mod.exports = JSON.parse(fuente)
    return mod.exports
  }
  const js = ts.transpileModule(fuente, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: 'ES2020', esModuleInterop: true, jsx: 'react-jsx' },
  }).outputText
  // Solo módulos puros: los imports que no son relativos (react...) se
  // sustituyen por un objeto vacío.
  const req = (s) => (s.startsWith('.') ? cargar(resolver(fichero, s)) : {})
  const envoltura = new vm.Script('(function (module, exports, require) {' + js + '\n})', { filename: fichero })
  envoltura.runInContext(contexto)(mod, mod.exports, req)
  return mod.exports
}

const lib = (nombre) => cargar(path.join(FRONT, 'src/admin/lib', nombre))
const errores = lib('adminErrors.ts')
const api = lib('adminApi.ts')
const persistencia = lib('adminStagePersistence.ts')
const campos = lib('stageFields.ts')
const flujo = lib('adminSaveFlow.ts')
const borradores = lib('adminDrafts.ts')
const guardas = lib('adminRouteGuards.ts')
const verificacion = lib('adminConfigVerify.ts')
const vista = lib('adminOverview.ts')
const jugadores = lib('playerDrafts.ts')
const borrador = lib('adminStageDraft.ts')
const eventos = lib('adminEventsView.ts')
const comprobaciones = lib('adminSaveChecks.ts')
const escapado = lib('htmlEscape.ts')
const familias = lib('familyConfigs.ts')

// Los objetos creados dentro del sandbox tienen prototipos de OTRO realm: se
// pasan por JSON para compararlos y volcarlos.
const plano = (valor) => JSON.parse(JSON.stringify(valor === undefined ? null : valor))

// ---------------------------------------------------------------------------
// Utilidades de simulación
// ---------------------------------------------------------------------------

function respuesta(status, cuerpo) {
  return { ok: status >= 200 && status < 300, status, json: async () => cuerpo }
}

/** Un `fetch` falso que apunta las peticiones y contesta con `manejador(url, cuerpo, n)`. */
function fetchFalso(manejador) {
  const llamadas = []
  const fn = async (url, opciones) => {
    const cuerpo = opciones && opciones.body ? JSON.parse(opciones.body) : null
    llamadas.push({ url, cuerpo })
    return manejador(url, cuerpo, llamadas.length)
  }
  return { fn, llamadas }
}

const ficha = (id, extra = {}) => ({
  id,
  title: 'Nodo ' + id,
  type: 'signal_hunt',
  lat: 42.36 + Number(id) * 0.001 || 42.36,
  lon: -8.67,
  radius: 50,
  entry_mode: 'gps',
  require_proximity: true,
  config: { objective: 'proximity_lock', game_id: 'simple_checkpoint' },
  answer: '',
  rune: '',
  ...extra,
})

/** Lo que devuelve el resumen del panel (sin respuesta ni requisitos). */
const resumen = (id, index, extra = {}) => ({
  id,
  index,
  title: 'Nodo ' + id,
  type: 'signal_hunt',
  lat: 42.36,
  lon: -8.67,
  radius: 50,
  entry_mode: 'gps',
  require_proximity: true,
  config: { objective: 'proximity_lock', game_id: 'simple_checkpoint' },
  messages: {},
  ...extra,
})

const salida = {}

// ---------------------------------------------------------------------------
// A1 · el reintento no duplica los nodos nuevos
// ---------------------------------------------------------------------------
async function a1() {
  const rawServidor = [ficha(0), ficha(1)]
  const overview = {
    status: 'ok',
    stages_revision: 'r1',
    stages: [resumen(0, 0), resumen(1, 1), resumen('local-99', 2, { title: 'Nuevo' })],
    profiles: [],
  }

  let posteados = null
  let fallosDeLectura = 0
  const deps = (raw) => ({
    // 1ª lectura bien; las siguientes (la verificación) fallan.
    fetchStages: async () => {
      fallosDeLectura += 1
      return fallosDeLectura === 1 ? { status: 'ok', stages: raw, stages_revision: 'r1' } : { status: 'fail', message: 'sin red' }
    },
    saveStages: async (nodos) => {
      posteados = nodos
      return { status: 'ok' }
    },
    fetchOverview: async () => {
      throw new Error('sin red')
    },
    confirm: () => true,
  })

  let idsRemapeados = null
  const primero = await flujo.runStagesSave(overview, {
    ...deps(rawServidor),
    onPosted: (guardados) => {
      idsRemapeados = plano(persistencia.remapLocalIds(overview.stages, guardados).map((s) => s.id))
    },
  })
  const primerosIds = plano(posteados.map((n) => n.id))

  // El panel ya cambió el id local por el guardado: el reintento parte de ahí.
  const overview2 = {
    ...overview,
    stages: persistencia.remapLocalIds(overview.stages, posteados),
  }
  // El servidor ya tiene los tres nodos.
  fallosDeLectura = 0
  posteados = null
  const segundo = await flujo.runStagesSave(overview2, deps(plano(primerosIds).map((id) => ficha(id))))
  const segundosIds = plano(posteados.map((n) => n.id))

  return {
    primer_resultado: plano({ kind: primero.kind, postDone: primero.postDone }),
    ids_tras_el_primer_guardado: primerosIds,
    ids_remapeados_en_el_panel: idsRemapeados,
    segundo_resultado: plano({ kind: segundo.kind }),
    ids_del_segundo_guardado: segundosIds,
    numero_de_nodos_segundo: segundosIds.length,
    ids_unicos: new Set(segundosIds).size === segundosIds.length,
  }
}

// ---------------------------------------------------------------------------
// A2 · si no se puede leer lo guardado, NO se guarda nada
// ---------------------------------------------------------------------------
async function a2() {
  let posts = 0
  const resultado = await flujo.runStagesSave(
    { status: 'ok', stages_revision: 'r1', stages: [resumen(0, 0)], profiles: [] },
    {
      fetchStages: async () => ({ status: 'fail', message: 'Sin conexión con el servidor.' }),
      saveStages: async () => {
        posts += 1
        return { status: 'ok' }
      },
      fetchOverview: async () => ({ status: 'ok' }),
      confirm: () => true,
    }
  )
  return { resultado: plano({ kind: resultado.kind, postDone: resultado.postDone, message: resultado.message }), posts }
}

// ---------------------------------------------------------------------------
// A3 · saveAdminConfig manda UNA petición, con `{config}`
// ---------------------------------------------------------------------------
async function a3() {
  const casos = {}

  // Petición perdida por la red: NO se prueba otra forma.
  let simulado = fetchFalso(() => {
    throw new TypeError('Failed to fetch')
  })
  entorno.fetch = simulado.fn
  const perdida = await api.saveAdminConfig(undefined, { site_name: 'X' })
  casos.red_perdida = {
    resultado: plano(perdida),
    peticiones: simulado.llamadas.length,
    claves_del_cuerpo: simulado.llamadas.map((l) => Object.keys(l.cuerpo)),
  }

  // Rechazo 400 `missing_config`: se cuenta tal cual, sin reintentar con otras formas.
  simulado = fetchFalso(() => respuesta(400, { status: 'error', detail: 'missing_config' }))
  entorno.fetch = simulado.fn
  const sinConfig = await api.saveAdminConfig(undefined, { site_name: 'X' })
  casos.sin_config = { resultado: plano(sinConfig), peticiones: simulado.llamadas.length }

  // Todo bien.
  simulado = fetchFalso(() => respuesta(200, { status: 'ok' }))
  entorno.fetch = simulado.fn
  const bien = await api.saveAdminConfig(undefined, { site_name: 'X', map_zoom: 13 })
  casos.bien = {
    resultado: plano(bien),
    cuerpo: plano(simulado.llamadas[0].cuerpo),
  }

  // Releer y comparar: lo que el servidor NO guardó se detecta.
  casos.verificacion = {
    todo_igual: plano(
      verificacion.verifyMissionSettingsSaved(
        { site_name: 'Misión', map_zoom: 13, map_center: [42.3, -8.6] },
        { site_name: 'Misión', map_zoom: 13, map_center: [42.3, -8.6] }
      )
    ),
    nombre_distinto: plano(
      verificacion.verifyMissionSettingsSaved({ site_name: 'Misión' }, { site_name: 'Otra' })
    ),
    fecha_no_guardada: plano(
      verificacion.verifyMissionSettingsSaved(
        { mission_launch_at: '2026-10-01T09:00:00+02:00' },
        {},
        { mission_launch_at: '' }
      )
    ),
    fecha_igual_en_otra_zona: plano(
      verificacion.verifyMissionSettingsSaved(
        { mission_launch_at: '2026-10-01T09:00:00+02:00' },
        {},
        { mission_launch_at: '2026-10-01T07:00:00+00:00' }
      )
    ),
    jugador_sin_guardar: plano(
      verificacion.verifyPlayersSaved(
        [{ id: 'ANA', display_name: 'Ana', mode: 'solo', avatar_url: '' }],
        []
      )
    ),
  }
  return casos
}

// ---------------------------------------------------------------------------
// A5 · requisito de mochila y código de emergencia SE GUARDAN
// ---------------------------------------------------------------------------
function a5() {
  const rawConLegado = ficha(3, {
    answer: 'LEGADO',
    requirements: { items: [{ item_id: 'llave_maestra', quantity: 1, consume: false, label: 'Llave' }] },
    config: { objective: 'proximity_lock', game_id: 'simple_checkpoint', success_code: 'VIEJO' },
  })

  // Lo que el panel hace en `syncLocalStage`: marca lo que el editor tocó.
  const editarEnElPanel = (antes, despues) => campos.markEditedFields(antes, despues)

  // 1. El organizador cambia requisito y código en el editor.
  const base = resumen(3, 0)
  const editado = editarEnElPanel(
    base,
    resumen(3, 0, {
      required_item_id: 'orbe_fuego',
      required_item_label: 'Orbe de Fuego Arcano',
      required_item_quantity: 2,
      consume_required_item: true,
      requires_item: true,
      fallback_code: 'NUEVO-1',
      physical_fallback_code: 'NUEVO-1',
      config: { objective: 'proximity_lock', game_id: 'simple_checkpoint', success_code: 'NUEVO-1' },
    })
  )
  const cambiado = persistencia.mergeStageForSave(rawConLegado, editado)

  // 2. No toca nada: lo guardado se conserva tal cual.
  const sinTocar = persistencia.mergeStageForSave(rawConLegado, resumen(3, 0))

  // 2b. El resumen del servidor trae sueltos valores que NO son los que el servidor
  // aplica (un `requirements` y un `answer` mandan sobre ellos). Sin tocar nada,
  // guardar no puede cambiar lo que aplica el servidor.
  const rawContradictorio = ficha(5, {
    answer: 'MANDA',
    fallback_code: 'SUELTO',
    required_item_id: 'suelto',
    requirements: { items: [{ item_id: 'manda', quantity: 3, consume: true, label: 'El bueno' }] },
  })
  const resumenConSueltos = resumen(5, 0, { required_item_id: 'suelto', fallback_code: 'SUELTO', answer: 'MANDA' })
  const contradictorioSinTocar = persistencia.mergeStageForSave(rawContradictorio, resumenConSueltos)
  const hidratadoContradictorio = persistencia.hydrateStagesFromRaw([resumenConSueltos], [rawContradictorio])[0]

  // 3. Quita el requisito.
  const quitado = persistencia.mergeStageForSave(
    rawConLegado,
    editarEnElPanel(base, resumen(3, 0, { required_item_id: '', requires_item: false, consume_required_item: false }))
  )

  // 4. Vacía el código a propósito.
  const sinCodigo = persistencia.mergeStageForSave(
    rawConLegado,
    editarEnElPanel(
      base,
      resumen(3, 0, {
        fallback_code: '',
        physical_fallback_code: '',
        config: { objective: 'proximity_lock', game_id: 'simple_checkpoint', success_code: '' },
      })
    )
  )

  // 5. Nodo nuevo desde plantilla: el requisito viene en `config`.
  const deConfig = persistencia.mergeStageForSave(
    null,
    resumen('local-1', 0, {
      config: { objective: 'proximity_lock', game_id: 'simple_checkpoint', required_item_id: 'cinta_aislante', required_item_quantity: 1, required_item_consume: false },
    })
  )

  // 6. El resumen no trae requisito ni código: se completan desde lo guardado.
  const hidratados = persistencia.hydrateStagesFromRaw([resumen(3, 0)], [rawConLegado])

  // 6b. Cambiar de familia de juego descarta la config guardada: el requisito y el
  // código que SOLO vivían ahí no pueden perderse.
  const rawEnConfig = ficha(4, {
    type: 'motion_challenge',
    config: { objective: 'shake_charge', game_id: 'shake_charge', required_item_id: 'llave', required_item_quantity: 1, success_code: 'CODIGO-4' },
  })
  const antesDeCambiar = persistencia.hydrateStagesFromRaw([resumen(4, 0, { type: 'motion_challenge' })], [rawEnConfig])[0]
  const otraFamilia = editarEnElPanel(antesDeCambiar, { ...antesDeCambiar, type: 'signal_hunt' })
  const cambioDeFamilia = persistencia.mergeStageForSave(rawEnConfig, otraFamilia)

  // 7. Si el servidor "guarda" pero pierde el requisito, la verificación lo caza.
  const perdido = { ...cambiado, requirements: undefined, required_item_id: undefined, config: { ...cambiado.config, required_item_id: undefined } }
  const desajustes = persistencia.verifyPersistedStages([cambiado], [perdido])

  // 8. Las marcas: solo se ponen si algo cambió, y son pegajosas.
  const marcaNinguna = campos.markEditedFields(base, { ...base, title: 'Otro título' })
  const marcaRequisito = campos.markEditedFields(base, { ...base, required_item_id: 'x' })
  const pegajosa = campos.markEditedFields(marcaRequisito, { ...base, required_item_id: 'x' })

  return {
    cambiado: {
      requisito_leido: plano(campos.readRawItemRequirement(cambiado)),
      codigo_leido: campos.readRawManualCode(cambiado),
      tiene_requirements: 'requirements' in cambiado && cambiado.requirements !== undefined,
      answer: cambiado.answer,
      config_success_code: cambiado.config.success_code,
      config_required_item_id: cambiado.config.required_item_id,
      minigame_config_required_item_id: cambiado.minigame && cambiado.minigame.config.required_item_id,
      lleva_marcas_al_servidor: Object.keys(cambiado).filter((k) => k.startsWith('_edited')),
    },
    sin_tocar: {
      requirements: plano(sinTocar.requirements),
      answer: sinTocar.answer,
      requisito_leido: plano(campos.readRawItemRequirement(sinTocar)),
      codigo_leido: campos.readRawManualCode(sinTocar),
    },
    resumen_con_valores_sueltos: {
      requisito_antes: plano(campos.readRawItemRequirement(rawContradictorio)),
      requisito_despues: plano(campos.readRawItemRequirement(contradictorioSinTocar)),
      codigo_antes: campos.readRawManualCode(rawContradictorio),
      codigo_despues: campos.readRawManualCode(contradictorioSinTocar),
      el_editor_ve: {
        required_item_id: hidratadoContradictorio.required_item_id,
        required_item_quantity: hidratadoContradictorio.required_item_quantity,
        fallback_code: hidratadoContradictorio.fallback_code,
      },
    },
    quitado: {
      requisito_leido: plano(campos.readRawItemRequirement(quitado)),
      tiene_requirements: quitado.requirements !== undefined,
    },
    sin_codigo: { codigo_leido: campos.readRawManualCode(sinCodigo), answer: sinCodigo.answer },
    de_config: { requisito_leido: plano(campos.readRawItemRequirement(deConfig)), config_required_item_id: deConfig.config.required_item_id },
    hidratado: {
      required_item_id: hidratados[0].required_item_id,
      requires_item: hidratados[0].requires_item,
      fallback_code: hidratados[0].fallback_code,
    },
    cambio_de_familia: {
      requisito: plano(campos.readRawItemRequirement(cambioDeFamilia)),
      codigo: campos.readRawManualCode(cambioDeFamilia),
      tipo: cambioDeFamilia.type,
    },
    marcas: {
      sin_cambio_de_requisito: plano(Object.keys(marcaNinguna).filter((k) => k.startsWith('_edited'))),
      con_cambio_de_requisito: plano(Object.keys(marcaRequisito).filter((k) => k.startsWith('_edited'))),
      pegajosa: plano(Object.keys(pegajosa).filter((k) => k.startsWith('_edited'))),
    },
    verificacion_caza_la_perdida: plano(desajustes),
    codigo_guardado_o_vacio: {
      con_codigo: campos.savedFallbackCode({ fallback_code: 'saga-05' }),
      sin_codigo: campos.savedFallbackCode({ config: {} }),
    },
  }
}

// ---------------------------------------------------------------------------
// A6 · el cajón no devuelve coordenadas viejas
// ---------------------------------------------------------------------------
function a6() {
  const borradorViejo = { id: 1, title: 'Fuente', lat: 42.0, lon: -8.0, route_via: [[42.0, -8.0]], radius: 50 }
  const vivo = { id: 1, title: 'Fuente', lat: 42.5, lon: -8.5, route_via: [[42.2, -8.2], [42.3, -8.3]], route_track: [[1, 2], [3, 4]], radius: 50 }

  const tras = borrador.applyDraftPatch(borradorViejo, vivo, { title: 'Fuente nueva' })
  const tecleadas = borrador.applyDraftPatch(borradorViejo, vivo, { lat: 41.0 })

  return {
    tras_editar_el_titulo: plano(tras),
    con_coordenadas_tecleadas: plano(tecleadas),
    misma_geometria: borrador.sameGeometry(vivo, { ...vivo }),
    distinta_geometria: borrador.sameGeometry(borradorViejo, vivo),
    sincroniza_sin_copiar_si_es_igual: borrador.withMapGeometry(vivo, vivo) === vivo,
  }
}

// ---------------------------------------------------------------------------
// A7 · revisión de la misión y conflicto (409)
// ---------------------------------------------------------------------------
async function a7() {
  const casos = {}

  // La petición lleva la huella con la que se cargó.
  let simulado = fetchFalso(() => respuesta(200, { status: 'ok' }))
  entorno.fetch = simulado.fn
  await api.saveAdminStages(undefined, [ficha(0)], { stagesRevision: 'abc123' })
  casos.cuerpo_con_revision = plano(simulado.llamadas[0].cuerpo && Object.keys(simulado.llamadas[0].cuerpo).sort())
  casos.revision_enviada = simulado.llamadas[0].cuerpo.stages_revision

  // El servidor contesta 409.
  simulado = fetchFalso(() => respuesta(409, { status: 'conflict', reason: 'stages_changed', current_revision: 'zzz' }))
  entorno.fetch = simulado.fn
  casos.respuesta_409 = plano(await api.saveAdminStages(undefined, [ficha(0)], { stagesRevision: 'abc123' }))

  // El flujo lo convierte en un conflicto con mensaje claro, sin perder nada.
  let posts = 0
  const flujo409 = await flujo.runStagesSave(
    { status: 'ok', stages_revision: 'r1', stages: [resumen(0, 0)], profiles: [] },
    {
      fetchStages: async () => ({ status: 'ok', stages: [ficha(0)], stages_revision: 'r1' }),
      saveStages: async () => {
        posts += 1
        return { status: 'conflict', current_revision: 'r2' }
      },
      fetchOverview: async () => ({ status: 'ok' }),
      confirm: () => true,
    }
  )
  casos.flujo_409 = plano({ kind: flujo409.kind, currentRevision: flujo409.currentRevision, message: flujo409.message, posts })

  // Si ya se ve al leer que la huella cambió, ni se intenta guardar.
  posts = 0
  const previo = await flujo.runStagesSave(
    { status: 'ok', stages_revision: 'r1', stages: [resumen(0, 0)], profiles: [] },
    {
      fetchStages: async () => ({ status: 'ok', stages: [ficha(0)], stages_revision: 'r2' }),
      saveStages: async () => {
        posts += 1
        return { status: 'ok' }
      },
      fetchOverview: async () => ({ status: 'ok' }),
      confirm: () => true,
    }
  )
  casos.conflicto_visto_al_leer = plano({ kind: previo.kind, currentRevision: previo.currentRevision, posts })

  // Con revisión nueva conocida, el guardado normal la usa y la devuelve.
  const enviados = []
  const bien = await flujo.runStagesSave(
    { status: 'ok', stages_revision: 'r1', stages: [resumen(0, 0)], profiles: [] },
    {
      fetchStages: async () => ({ status: 'ok', stages: [ficha(0)], stages_revision: 'r1' }),
      saveStages: async (nodos, opciones) => {
        enviados.push(plano(opciones))
        return { status: 'ok' }
      },
      fetchOverview: async () => ({ status: 'ok', stages_revision: 'r2', stages: [resumen(0, 0)] }),
      confirm: () => true,
    }
  )
  casos.guardado_normal = plano({ kind: bien.kind, stagesRevision: bien.stagesRevision, opciones: enviados })
  return casos
}

// ---------------------------------------------------------------------------
// A12 · ensayo antes de reordenar/borrar con gente en ruta
// ---------------------------------------------------------------------------
async function a12() {
  const casos = {}
  const raw = [ficha(0), ficha(1), ficha(2)]
  const invertido = {
    status: 'ok',
    stages_revision: 'r1',
    stages: [resumen(1, 0), resumen(0, 1), resumen(2, 2)],
    profiles: [{ id: 'ana', display_name: 'Ana', level: 2 }],
  }
  const afectados = [{ user: 'ana', display_name: 'Ana', level_antes: 2, level_despues: 1, nodo_antes: 'Nodo 2', nodo_despues: 'Nodo 0' }]

  const montar = (confirma, ensayoRespuesta, guardaEnElEnsayo = false) => {
    const registro = { llamadas: [], mensajes: [] }
    let guardado = raw
    return {
      registro,
      deps: {
        fetchStages: async () => ({ status: 'ok', stages: guardado, stages_revision: 'r1' }),
        saveStages: async (nodos, opciones) => {
          registro.llamadas.push(plano(opciones))
          if (!opciones.dryRun || guardaEnElEnsayo) guardado = nodos
          return opciones.dryRun ? ensayoRespuesta : { status: 'ok' }
        },
        fetchOverview: async () => ({ status: 'ok', stages_revision: 'r2', stages: invertido.stages }),
        confirm: (mensaje) => {
          registro.mensajes.push(mensaje)
          return confirma
        },
      },
    }
  }

  // El organizador NO confirma: solo se hizo el ensayo, nada se guardó.
  let escenario = montar(false, { status: 'ok', dry_run: true, afectados })
  let r = await flujo.runStagesSave(invertido, escenario.deps)
  casos.sin_confirmar = plano({ kind: r.kind, llamadas: escenario.registro.llamadas, mensaje: escenario.registro.mensajes[0] })

  // Confirma: ensayo y después el guardado de verdad.
  escenario = montar(true, { status: 'ok', dry_run: true, afectados })
  r = await flujo.runStagesSave(invertido, escenario.deps)
  casos.confirmando = plano({ kind: r.kind, llamadas: escenario.registro.llamadas })

  // Nadie afectado: no pregunta.
  escenario = montar(false, { status: 'ok', dry_run: true, afectados: [] })
  r = await flujo.runStagesSave(invertido, escenario.deps)
  casos.nadie_afectado = plano({ kind: r.kind, preguntas: escenario.registro.mensajes.length })

  // Un servidor que no conoce el ensayo GUARDA de verdad: no se manda otra vez.
  escenario = montar(true, { status: 'ok' }, true)
  r = await flujo.runStagesSave(invertido, escenario.deps)
  casos.servidor_sin_ensayo = plano({ kind: r.kind, llamadas: escenario.registro.llamadas })

  // Sin cambios de orden ni de nodos, no hay ensayo.
  const igual = { status: 'ok', stages_revision: 'r1', stages: [resumen(0, 0), resumen(1, 1), resumen(2, 2)], profiles: [] }
  escenario = montar(true, { status: 'ok', dry_run: true, afectados })
  r = await flujo.runStagesSave(igual, escenario.deps)
  casos.sin_cambio_de_estructura = plano({ kind: r.kind, llamadas: escenario.registro.llamadas })

  // Aviso previo al mover: quién ya pasó por esa zona.
  const perfiles = [
    { id: 'ana', display_name: 'Ana', level: 5 },
    { id: 'bea', display_name: 'Bea', level: 1 },
    { id: 'cai', display_name: 'Cai', level: 0, finished: true },
  ]
  casos.aviso_al_reordenar = {
    tres: guardas.confirmationForStructuralChange('reordenar', 'Fuente', perfiles, 3),
    nadie: guardas.confirmationForStructuralChange('reordenar', 'Fuente', [{ id: 'x', level: 1 }], 3),
    jugadores_pasados: plano(guardas.playersPastIndex(perfiles, 1).map((j) => j.id)),
  }
  return casos
}

// ---------------------------------------------------------------------------
// A13 · fecha de salida futura con gente jugando
// ---------------------------------------------------------------------------
function a13() {
  const ahora = Date.parse('2026-09-30T12:00:00+02:00')
  const perfiles = [
    { id: 'ana', level: 3 },
    { id: 'bea', level: 0, last_seen: Math.floor(ahora / 1000) - 60 },
    { id: 'cai', level: 0 },
    { id: 'dan', level: 4, finished: true },
  ]
  return {
    futura_con_gente: plano(
      guardas.playersBlockedByNewLaunch('', '2026-10-05T09:00:00+02:00', perfiles, ahora).map((p) => p.id)
    ),
    pasada: plano(guardas.playersBlockedByNewLaunch('', '2026-09-01T09:00:00+02:00', perfiles, ahora).map((p) => p.id)),
    sin_cambio: plano(
      guardas.playersBlockedByNewLaunch('2026-10-05T09:00:00+02:00', '2026-10-05T07:00:00+00:00', perfiles, ahora).map((p) => p.id)
    ),
    vacia: plano(guardas.playersBlockedByNewLaunch('', '', perfiles, ahora).map((p) => p.id)),
  }
}

// ---------------------------------------------------------------------------
// A15 · errores en castellano, bloqueo con segundos, sesión caducada, borradores
// ---------------------------------------------------------------------------
async function a15() {
  const casos = {}
  const http = (status, detalle, cuerpo = null) => new errores.AdminHttpError(status, detalle, cuerpo)

  casos.mensajes = {
    contrasena_mala: errores.describeAdminError(http(401, 'invalid admin password'), 'login'),
    bloqueo: errores.describeAdminError(http(429, 'too many failed attempts; retry in 45s'), 'login'),
    bloqueo_largo: errores.describeAdminError(http(429, 'too many failed attempts; retry in 754s'), 'login'),
    sesion: errores.describeAdminError(http(403, 'bad password')),
    cambio_de_clave: errores.describeAdminError(http(403, 'password change required')),
    conflicto: errores.describeAdminError(http(409, '')),
    servidor: errores.describeAdminError(http(500, '')),
    validacion: errores.describeAdminError(
      http(400, 'invalid stages', { errors: [{ index: 2, field: 'title', detail: 'title is required' }] }),
      'guardar'
    ),
  }
  const fallo = new TypeError('Failed to fetch')
  casos.mensajes.sin_red = errores.describeAdminError(fallo, 'guardar')
  casos.segundos_de_bloqueo = errores.lockoutSeconds(http(429, 'too many failed attempts; retry in 45s'))
  casos.segundos_otro_error = errores.lockoutSeconds(http(401, 'x'))

  // El login real (adminPostJson) lanza un error con estado y detalle.
  entorno.fetch = fetchFalso(() => respuesta(429, { detail: 'too many failed attempts; retry in 30s' })).fn
  try {
    await api.loginAdmin('x')
    casos.login_lanza = null
  } catch (err) {
    casos.login_lanza = plano({ es_admin_http: errores.isAdminHttpError(err), status: err.status, detail: err.detail, segundos: errores.lockoutSeconds(err) })
  }

  // Un 403 avisa a la aplicación (vuelta al login sin perder trabajo); el resto no.
  const avisos = []
  const probar = async (status, cuerpo) => {
    entorno.eventos.length = 0
    entorno.fetch = fetchFalso(() => respuesta(status, cuerpo)).fn
    try {
      await api.fetchAdminReactOverview()
    } catch {
      // esperado
    }
    avisos.push({ status, detalle: cuerpo.detail, avisos: entorno.eventos.length })
  }
  await probar(403, { detail: 'forbidden' })
  await probar(403, { detail: 'password change required' })
  await probar(401, { detail: 'nope' })
  await probar(500, { detail: 'boom' })
  casos.aviso_de_sesion_caducada = plano(avisos)

  // El guardado que recibe 403 también avisa.
  entorno.eventos.length = 0
  entorno.fetch = fetchFalso(() => respuesta(403, { status: 'error' })).fn
  const guardado403 = await api.saveAdminStages(undefined, [ficha(0)], {})
  casos.guardado_403 = plano({ status: guardado403.status, avisos: entorno.eventos.length, mensaje: guardado403.message })

  // Borradores: se guardan, se leen, se borran; con el almacenamiento roto no revienta.
  const memoria = new Map()
  const almacen = {
    getItem: (k) => (memoria.has(k) ? memoria.get(k) : null),
    setItem: (k, v) => memoria.set(k, v),
    removeItem: (k) => memoria.delete(k),
  }
  const bundle = { savedAt: 1000, reason: 'session', stages: [{ id: 1 }], players: [{ id: 'ana' }], mission: { site_name: 'A' } }
  const guardo = borradores.writeAdminDrafts(bundle, almacen)
  const leido = borradores.readAdminDrafts(almacen)
  borradores.clearAdminDrafts(almacen)
  const roto = {
    getItem: () => {
      throw new Error('bloqueado')
    },
    setItem: () => {
      throw new Error('QuotaExceededError')
    },
    removeItem: () => {
      throw new Error('bloqueado')
    },
  }
  casos.borradores = plano({
    guardo,
    leido,
    tras_borrar: borradores.readAdminDrafts(almacen),
    con_almacenamiento_roto: {
      escribir: borradores.writeAdminDrafts(bundle, roto),
      leer: borradores.readAdminDrafts(roto),
    },
    reciente: borradores.isDraftFresh({ savedAt: 1000 }, 1000 + 60000),
    caducado: borradores.isDraftFresh({ savedAt: 1000 }, 1000 + 13 * 3600 * 1000),
    edad: borradores.describeDraftAge(1000, 1000 + 5 * 60 * 1000),
  })
  return casos
}

// ---------------------------------------------------------------------------
// A16 · los borradores no se pisan al recargar; IDs
// ---------------------------------------------------------------------------
function a16() {
  const actual = {
    status: 'ok',
    stages_revision: 'base',
    stages: [resumen(0, 0, { title: 'Movido sin guardar', lat: 1.5 })],
    profiles: [{ id: 'ana', level: 1 }],
    counts: { players: 1, profiles: 1, stages: 1, finished_profiles: 0, family_counts: {} },
    config: { site_name: 'Viejo' },
  }
  const servidor = {
    status: 'ok',
    stages_revision: 'otra',
    stages: [resumen(0, 0, { title: 'Del servidor' })],
    profiles: [{ id: 'ana', level: 4 }],
    player_profiles: [{ id: 'ana' }],
    counts: { players: 1, profiles: 1, stages: 1, finished_profiles: 1, family_counts: {} },
    config: { site_name: 'Nuevo' },
  }
  const mezclado = vista.mergeServerPeople(actual, servidor)

  const borradores = [
    { id: 'ANA', original_id: 'ANA' },
    { id: 'Bea', original_id: 'Bea' },
    { id: ' ANA ' },
    { id: '' },
  ]
  return {
    fusion: {
      titulo_del_nodo: mezclado.stages[0].title,
      lat_del_nodo: mezclado.stages[0].lat,
      revision: mezclado.stages_revision,
      nivel_de_ana: mezclado.profiles[0].level,
      ajustes: mezclado.config.site_name,
      terminados: mezclado.counts.finished_profiles,
    },
    sin_clave_de_mision: plano(vista.withoutMissionPass({ site_name: 'A', mission_pass: 'secreta' })),
    repetidos: plano(jugadores.findDuplicatePlayerIds(borradores)),
    huerfanos: plano(jugadores.findOrphanedPlayerIds(['ANA', 'Bea', 'Cai'], [{ id: 'ANA' }, { id: 'Nuevo' }])),
    id_cambiado: {
      cambiado: jugadores.isPlayerIdChanged({ id: 'ANA2', original_id: 'ANA' }, 0),
      igual: jugadores.isPlayerIdChanged({ id: ' ANA ', original_id: 'ANA' }, 0),
      nuevo: jugadores.isPlayerIdChanged({ id: 'X' }, 0),
    },
  }
}

// ---------------------------------------------------------------------------
// A17 · «N pendientes» no se corta en las 200 filas cargadas
// ---------------------------------------------------------------------------
function a17() {
  const filas = (n, estado) => Array.from({ length: n }, (_, i) => ({ status: estado, created_at: '2026-09-30T10:' + String(i % 60).padStart(2, '0') + ':00Z' }))
  return {
    tope: plano(eventos.describePendingCount(filas(200, 'pending'), 200)),
    total_del_servidor: plano(eventos.describePendingCount(filas(200, 'pending'), 200, 1234)),
    pocas: plano(eventos.describePendingCount(filas(3, 'pending'), 200)),
    mezcla_bajo_tope: plano(eventos.describePendingCount([{ status: 'pending' }, { status: 'synced' }], 200)),
    orden_ascendente: plano(eventos.sortEventsNewestFirst([{ created_at: '2026-09-30T10:00:00Z', id: 'a' }, { created_at: '2026-09-30T12:00:00Z', id: 'b' }]).map((e) => e.id)),
    orden_descendente: plano(eventos.sortEventsNewestFirst([{ created_at: '2026-09-30T12:00:00Z', id: 'b' }, { created_at: '2026-09-30T10:00:00Z', id: 'a' }]).map((e) => e.id)),
    sin_fecha: plano(eventos.sortEventsNewestFirst([{ created_at: '', id: 'x' }, { created_at: '', id: 'y' }]).map((e) => e.id)),
  }
}

// ---------------------------------------------------------------------------
// A18 · relleno de la trampa de palabras, centro/zoom vacíos, HTML escapado
// ---------------------------------------------------------------------------
function a18() {
  const vacia = familias.normalizeAdminConfigForFamily('word_trap', { game_id: 'trampa_palabras', questions: [] })
  const dos = familias.normalizeAdminConfigForFamily('word_trap', {
    game_id: 'trampa_palabras',
    questions: [
      { question: 'Uno', options: ['a', 'b', 'c', 'd'], correct_index: 1 },
      { question: '   ', options: ['', '', '', ''] },
      { question: 'Dos', options: ['a', 'b', '', ''], correct_index: 0 },
    ],
  })
  const nodoTrampa = (preguntas) => ({
    index: 4,
    title: 'Trampa',
    type: 'word_trap',
    config: { game_id: 'trampa_palabras', questions: preguntas },
  })
  const completas = Array.from({ length: 4 }, (_, i) => ({ question: 'P' + i, options: ['a', 'b', 'c', 'd'] }))

  return {
    sin_relleno: {
      preguntas: vacia.questions.length,
      hay_relleno: JSON.stringify(vacia).includes('Pregunta trampa'),
    },
    solo_las_escritas: plano(dos.questions.map((q) => q.question)),
    nodos_incompletos: plano(comprobaciones.incompleteWordTrapNodes([nodoTrampa([completas[0]]), nodoTrampa(completas)]).map((n) => ({ index: n.index, complete: n.complete }))),
    mensaje: comprobaciones.validateStagesBeforeSave([nodoTrampa([completas[0]])]),
    mision_completa_pasa: comprobaciones.validateStagesBeforeSave([nodoTrampa(completas)]),
    mapa: {
      vacio: plano(verificacion.readMapSettings({ map_center_lat: '', map_center_lon: '', map_zoom: '' })),
      valido: plano(verificacion.readMapSettings({ map_center_lat: '42,5', map_center_lon: '-8.6', map_zoom: '13.4' })),
      solo_la_latitud: plano(verificacion.readMapSettings({ map_center_lat: '42', map_center_lon: '', map_zoom: '13' })),
      latitud_absurda: plano(verificacion.readMapSettings({ map_center_lat: '400', map_center_lon: '0', map_zoom: '13' })),
      zoom_absurdo: plano(verificacion.readMapSettings({ map_center_lat: '42', map_center_lon: '-8', map_zoom: '99' })),
      cero_legitimo: plano(verificacion.readMapSettings({ map_center_lat: '0', map_center_lon: '0', map_zoom: '5' })),
    },
    escapado: escapado.escapeHtml('<img src=x onerror="alert(1)">&\'"'),
  }
}

// ---------------------------------------------------------------------------
// A4 · la validación de la misión (los botones de guardar pasan por aquí)
// ---------------------------------------------------------------------------
function a4() {
  const conRequisito = (id, extra = {}) => resumen('n' + id, id, extra)
  const sinEntrega = [conRequisito(0, { required_item_id: 'objeto_que_nadie_da', requires_item: true })]
  const conEntrega = [
    conRequisito(0, { physical_item_id: 'llave_dorada', physical_node_kind: 'collectible' }),
    conRequisito(1, { required_item_id: 'llave_dorada', requires_item: true }),
  ]
  const enConfig = [conRequisito(0, { config: { required_item_id: 'objeto_que_nadie_da' } })]
  const quitado = [conRequisito(0, { required_item_id: 'objeto_que_nadie_da', requires_item: false })]
  return {
    sin_entrega: comprobaciones.validateStagesBeforeSave(sinEntrega),
    con_entrega: comprobaciones.validateStagesBeforeSave(conEntrega),
    requisito_en_config: comprobaciones.validateStagesBeforeSave(enConfig),
    requisito_quitado: comprobaciones.validateStagesBeforeSave(quitado),
  }
}

async function principal() {
  salida.A1 = await a1()
  salida.A2 = await a2()
  salida.A3 = await a3()
  salida.A4 = a4()
  salida.A5 = a5()
  salida.A6 = a6()
  salida.A7 = await a7()
  salida.A12 = await a12()
  salida.A13 = a13()
  salida.A15 = await a15()
  salida.A16 = a16()
  salida.A17 = a17()
  salida.A18 = a18()
  process.stdout.write(JSON.stringify(salida))
}

principal().catch((error) => {
  process.stderr.write(String((error && error.stack) || error))
  process.exit(1)
})

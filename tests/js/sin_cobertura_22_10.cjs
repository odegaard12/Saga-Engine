// Revisión del 22/10/2026, juego sin cobertura: un «vaciar mochila» no tira los nodos hechos sin red, el objeto no se
// gasta si el avance no se pudo guardar y la pegatina se acepta sin red con las mismas formas que con red. Ejecuta los
// módulos TS tal cual (entorno_navegador.cjs) y vuelca en JSON lo que hacen; lo comprueba
// tests/test_sin_cobertura_22_10_js.py.
'use strict'

const { crearEntorno } = require('./entorno_navegador.cjs')

const esperar = (ms) => new Promise((r) => setTimeout(r, ms))

const tipos = async (mp, u) => {
  // No hay lector exportado de la cola entera: se cuentan avances y el total.
  return { avances: await mp.contarAvancesPendentes(u), total: await mp.contarPendientes(u) }
}

/* Un reinicio del panel: de la cola sólo sale lo anterior a SU marca, y el nivel sólo baja con la de avances. */
async function reinicio() {
  const salida = {}

  // Vaciar la mochila: sube `reset_at` y la de mochila; la de avances sigue donde estaba (0: nunca se reinició; o
  // la de un reinicio de progreso que este móvil ya aplicó).
  for (const [nombre, avancesDesde, vistoAntes] of [
    ['mochila', 0, null],
    ['mochilaTrasOtro', 1000, '1000'],
  ]) {
    const e = crearEntorno()
    if (vistoAntes) e.local.setItem('saga:nodo-reset-visto:A', vistoAntes)
    const mp = e.cargar('src/player/offline/missionPack.ts')
    const rs = e.cargar('src/player/offline/reseteoDelServidor.ts')
    await mp.queueOfflineEvent({ user: 'A', type: 'node_completed', payload: { code: 'X' } })
    await mp.queueOfflineEvent({ user: 'A', type: 'item_collected', payload: {} })
    await esperar(5)
    const marca = Date.now()
    const bajaNivel = await rs.aplicarResetDelServidor('A', {
      user: 'A',
      inventory_snapshot: { items: [], reset_at: marca, inventory_reset_at: marca, progress_reset_at: avancesDesde },
    })
    salida[nombre] = { bajaNivel, ...(await tipos(mp, 'A')) }
  }

  // Bajar de nivel: se mueve la de avances. Lo de antes se va; lo de después de la marca se queda.
  {
    const e = crearEntorno()
    const mp = e.cargar('src/player/offline/missionPack.ts')
    const rs = e.cargar('src/player/offline/reseteoDelServidor.ts')
    await mp.queueOfflineEvent({ user: 'A', type: 'node_completed', payload: { code: 'VIEJO' } })
    await esperar(5)
    const marca = Date.now()
    await esperar(5)
    await mp.queueOfflineEvent({ user: 'A', type: 'node_completed', payload: { code: 'NUEVO' } })
    const partida = {
      user: 'A',
      inventory_snapshot: { items: [], reset_at: marca, progress_reset_at: marca, inventory_reset_at: 1000 },
    }
    const bajaNivel = await rs.aplicarResetDelServidor('A', partida)
    // La misma marca otra vez (el refresco de 30 s): ya no es un reinicio nuevo.
    const otraVez = await rs.aplicarResetDelServidor('A', partida)
    salida.progreso = { bajaNivel, otraVez, ...(await tipos(mp, 'A')) }
  }

  // Base de antes de separar las marcas: vale `reset_at` para todo (como `_marca_de` en main.py).
  {
    const e = crearEntorno()
    const mp = e.cargar('src/player/offline/missionPack.ts')
    const rs = e.cargar('src/player/offline/reseteoDelServidor.ts')
    await mp.queueOfflineEvent({ user: 'A', type: 'node_completed', payload: {} })
    await esperar(5)
    const bajaNivel = await rs.aplicarResetDelServidor('A', {
      user: 'A',
      inventory_snapshot: { items: [], reset_at: Date.now() },
    })
    salida.antiguo = { bajaNivel, ...(await tipos(mp, 'A')) }
  }

  return salida
}

const nodoConObjeto = {
  id: 7,
  title: 'Puerta',
  success: { conditions: [{ kind: 'code', value: 'ABRE' }] },
  requirements: { items: [{ item_id: 'llave', label: 'Llave', quantity: 1, consume: true }] },
}

/* Sin espacio al encolar: el objeto NO se gasta y el jugador puede repetir; con espacio, avanza y se gasta. */
async function objetoSinEspacio() {
  const e = crearEntorno()
  const inv = e.cargar('src/player/offline/inventory.ts')
  const mp = e.cargar('src/player/offline/missionPack.ts')
  const alm = e.cargar('src/player/offline/almacenamiento.ts')
  const { countOwnedItems } = e.cargar('src/player/rewards/stageItemRequirement.ts')
  inv.collectInventoryItem({ user: 'A', itemId: 'llave', item_id: 'llave', label: 'Llave', quantity: 1 })
  const antes = countOwnedItems('A', 'llave')
  const payload = { user: 'A', level: 0, stages: [nodoConObjeto, { id: 8 }] }

  e.cuota.idbPutFalla = true
  let error = null
  try {
    await mp.advanceLocalProgress({ payload, currentStage: nodoConObjeto, code: 'abre' })
  } catch (err) {
    error = err
  }
  const trasFallo = countOwnedItems('A', 'llave')

  e.cuota.idbPutFalla = false
  const bien = await mp.advanceLocalProgress({ payload, currentStage: nodoConObjeto, code: 'abre' })
  return {
    antes,
    lanzo: Boolean(error),
    esCuota: alm.esErrorDeCuota(error),
    trasFallo,
    ok: bien.ok,
    nivel: bien.ok ? bien.payload.level : null,
    trasAvanzar: countOwnedItems('A', 'llave'),
    avancesEnCola: await mp.contarAvancesPendentes('A'),
  }
}

/* La pegatina sin red: con guiones, espacios o guiones bajos de más, como acepta el servidor (`_plano`). */
async function pegatinaSinRed() {
  const e = crearEntorno()
  const mp = e.cargar('src/player/offline/missionPack.ts')
  const { sha256Hex } = e.cargar('src/player/utils/sha256.ts')
  // Como `proyectar_nodo` en mision.py: el código tal cual y sin espacios, guiones ni guiones bajos.
  const conHash = { id: 3, title: 'Hash', qr_hashes: ['SAGA_01', 'SAGA01'].map((c) => sha256Hex(`3:codigo:${c}`)) }
  const enClaro = { id: 4, title: 'Claro', qr_payload: 'SAGA_01' }
  const prueba = async (stage, code) => {
    const r = await mp.advanceLocalProgress({
      payload: { user: 'A', level: 0, stages: [stage, { id: 99 }] },
      currentStage: stage,
      code,
      aMano: true,
    })
    return r.ok
  }
  return {
    hashExacto: await prueba(conHash, 'SAGA_01'),
    hashGuion: await prueba(conHash, 'saga-01'),
    hashEspacio: await prueba(conHash, 'saga 01'),
    hashOtro: await prueba(conHash, 'SAGA-02'),
    claroGuion: await prueba(enClaro, 'SAGA-01'),
    claroEspacio: await prueba(enClaro, 'saga 01'),
    claroOtro: await prueba(enClaro, 'SAGA 02'),
  }
}

async function main() {
  const salida = {}
  const casos = { reinicio, objetoSinEspacio, pegatinaSinRed }
  for (const [nombre, fn] of Object.entries(casos)) {
    try {
      salida[nombre] = await fn()
    } catch (error) {
      salida[nombre] = { __error: String((error && error.stack) || error) }
    }
  }
  process.stdout.write(JSON.stringify(salida))
  process.exit(0)
}

main()

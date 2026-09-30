/**
 * Requisito de mochila y código de emergencia de un nodo: lo que el editor
 * enseña, lo que el servidor guarda y cómo pasar de una cosa a la otra sin
 * perder nada por el camino.
 *
 * El problema (informe A5): el editor escribe `required_item_id`,
 * `requires_item` y `consume_required_item` en el nodo, y el código de
 * emergencia en `fallback_code`/`config.success_code`, pero `mergeStageForSave`
 * copiaba una lista fija de campos que no los incluía. Se «guardaban», el panel
 * decía «✓ Guardado» y al recargar seguían igual que antes. Y el servidor, por
 * su parte, lee estos datos de VARIOS sitios con un orden de prioridad
 * (`read_stage_item_requirement` y `_build_success_conditions` en
 * backend/app/runtime/core_engine.py); si solo se cambia uno de los sitios de
 * menor prioridad, el cambio se ignora.
 *
 * Aquí se leen y se escriben con las MISMAS reglas de prioridad que el
 * servidor, y solo se toca el nodo cuando lo que quiere el editor es distinto
 * de lo que ya está guardado. Todo es puro: se prueba sin navegador
 * (tests/js/admin_frontend.cjs).
 */

export type ItemRequirement = {
  item_id: string
  quantity: number
  consume: boolean
  label: string
}

/** Nombre de cada objeto de la lista de «requiere un objeto de la mochila» del editor. */
export const REQUIRED_ITEM_LABELS: Record<string, string> = {
  llave_maestra: 'Llave Maestra',
  emp_device: 'Dispositivo EMP',
  decodificador_cuantico: 'Decodificador Cuántico',
  escaner_biometrico: 'Escáner Biométrico',
  amuleto_guardian: 'Amuleto del Guardián',
  elixir_alquimia: 'Elixir de Alquimia',
  escudo_runico: 'Escudo Rúnico',
  orbe_fuego: 'Orbe de Fuego Arcano',
  reliquia_sagrada: 'Reliquia Sagrada',
  amuleto_vision: 'Amuleto de Visión',
}

type Registro = Record<string, unknown>

function comoRegistro(valor: unknown): Registro {
  return valor && typeof valor === 'object' && !Array.isArray(valor) ? (valor as Registro) : {}
}

function texto(valor: unknown): string {
  return valor === null || valor === undefined ? '' : String(valor).trim()
}

function entero(valor: unknown, porDefecto = 1): number {
  const numero = Math.trunc(Number(valor))
  return Number.isFinite(numero) && numero > 0 ? numero : porDefecto
}

function normalizarRequisito(crudo: Registro): ItemRequirement | null {
  const itemId = texto(crudo.item_id || crudo.required_item_id)
  if (!itemId) return null
  return {
    item_id: itemId,
    quantity: entero(crudo.quantity || crudo.required_item_quantity, 1),
    consume: Boolean(crudo.consume || crudo.required_item_consume),
    label: texto(crudo.label || crudo.required_item_label) || itemId,
  }
}

/**
 * El requisito que el SERVIDOR aplicaría a este nodo guardado (espejo de
 * `read_stage_item_requirement`): primero `requirements.items[0]`, después
 * `required_item_id` del nodo y, por último, el de su `config`.
 */
export function readRawItemRequirement(raw: unknown): ItemRequirement | null {
  const nodo = comoRegistro(raw)

  const items = comoRegistro(nodo.requirements).items
  if (Array.isArray(items) && items.length > 0 && items[0] && typeof items[0] === 'object') {
    const primero = normalizarRequisito(items[0] as Registro)
    if (primero) return primero
  }

  const config = comoRegistro(nodo.config)
  const itemId = texto(nodo.required_item_id || nodo.requiredItemId || config.required_item_id)
  if (!itemId) return null

  return {
    item_id: itemId,
    quantity: entero(nodo.required_item_quantity || config.required_item_quantity, 1),
    consume: Boolean(nodo.consume_required_item || config.required_item_consume),
    label: texto(nodo.required_item_label || config.required_item_label) || itemId,
  }
}

/**
 * El código de emergencia de un nodo guardado, ya limpio y en mayúsculas: el del
 * editor (`config.success_code`) y, si no hay, la cadena antigua del servidor
 * (`answer`, `success_code`, `fallback_code`... de `_build_success_conditions`).
 *
 * Ojo: el servidor puede aceptar DOS códigos a la vez (el `answer` heredado y el
 * del editor). Aquí se devuelve el que el editor enseña y cambia; al reescribirlo
 * (`writeManualCode`) se dejan todos iguales, así que no queda un segundo código
 * escondido. Antes, si el `answer` heredado mandaba, cambiar solo
 * `config.success_code` no servía de nada.
 */
export function readRawManualCode(raw: unknown): string {
  const nodo = comoRegistro(raw)
  const config = comoRegistro(nodo.config)
  const aceptados = Array.isArray(config.accepted_codes) ? config.accepted_codes : []

  const primero = [
    config.success_code,
    nodo.answer,
    nodo.success_code,
    nodo.fallback_code,
    nodo.physical_fallback_code,
    config.fallback_code,
    aceptados.length > 0 ? aceptados[0] : undefined,
  ].find((valor) => Boolean(valor))

  return texto(primero).toUpperCase()
}

/** TODOS los códigos de emergencia distintos que tiene el nodo, en mayúsculas (el servidor puede aceptar varios). */
export function readAllManualCodes(raw: unknown): string[] {
  const nodo = comoRegistro(raw)
  const config = comoRegistro(nodo.config)
  const valores = [
    nodo.answer,
    nodo.success_code,
    nodo.fallback_code,
    nodo.physical_fallback_code,
    config.success_code,
    config.fallback_code,
  ]
    .map((valor) => texto(valor).toUpperCase())
    .filter(Boolean)
  return Array.from(new Set(valores))
}

/** El código que muestra el editor: lo guardado, o cadena vacía. NUNCA un valor inventado. */
export function savedFallbackCode(stage: unknown): string {
  const nodo = comoRegistro(stage)
  const config = comoRegistro(nodo.config)
  const primero = [
    nodo.fallback_code,
    nodo.physical_fallback_code,
    config.success_code,
    config.fallback_code,
  ].find((valor) => typeof valor === 'string' && valor.trim())
  return texto(primero).toUpperCase()
}

/**
 * Lo que el editor quiere que sea el requisito de este nodo:
 * - `undefined`: el editor no ha tocado nada (no hay información): conservar lo guardado.
 * - `null`: el organizador ha quitado el requisito.
 * - un requisito: ese.
 */
export function wantedRequirement(
  stage: unknown,
  localConfig: unknown,
  previous: ItemRequirement | null
): ItemRequirement | null | undefined {
  const nodo = comoRegistro(stage)
  const config = comoRegistro(localConfig)

  if (nodo.requires_item === false) return null

  const construir = (
    itemId: string,
    cantidad: unknown,
    consumir: unknown,
    etiqueta: unknown
  ): ItemRequirement | null => {
    const id = texto(itemId)
    if (!id) return null
    const base = previous && previous.item_id === id ? previous : null
    return {
      item_id: id,
      quantity: entero(cantidad ?? base?.quantity, 1),
      consume: consumir === undefined || consumir === null ? Boolean(base?.consume) : Boolean(consumir),
      label: texto(etiqueta) || base?.label || id,
    }
  }

  if (Object.prototype.hasOwnProperty.call(nodo, 'required_item_id') && typeof nodo.required_item_id === 'string') {
    return construir(
      nodo.required_item_id,
      nodo.required_item_quantity ?? config.required_item_quantity,
      nodo.consume_required_item ?? config.required_item_consume,
      nodo.required_item_label ?? config.required_item_label
    )
  }

  if (typeof config.required_item_id === 'string') {
    return construir(
      config.required_item_id,
      config.required_item_quantity,
      config.required_item_consume,
      config.required_item_label
    )
  }

  return undefined
}

/**
 * Lo que el editor quiere que sea el código de emergencia:
 * `undefined` = no ha tocado nada; `''` = lo ha vaciado a propósito; otro = ese código.
 */
export function wantedManualCode(stage: unknown, localConfig: unknown): string | undefined {
  const nodo = comoRegistro(stage)
  const config = comoRegistro(localConfig)
  const candidatos = [nodo.fallback_code, nodo.physical_fallback_code, config.success_code, config.fallback_code]

  if (!candidatos.some((valor) => typeof valor === 'string')) return undefined
  const primero = candidatos.find((valor) => typeof valor === 'string' && valor.trim())
  return texto(primero).toUpperCase()
}

export function sameRequirement(a: ItemRequirement | null, b: ItemRequirement | null): boolean {
  if (a === null || b === null) return a === b
  return (
    a.item_id === b.item_id &&
    a.quantity === b.quantity &&
    a.consume === b.consume &&
    a.label === b.label
  )
}

const CLAVES_REQUISITO_NODO = [
  'required_item_id',
  'requiredItemId',
  'required_item_label',
  'required_item_quantity',
  'consume_required_item',
  'requires_item',
]

const CLAVES_REQUISITO_CONFIG = [
  'required_item_id',
  'required_item_label',
  'required_item_quantity',
  'required_item_consume',
]

/**
 * Marcas de "esto lo ha tocado el editor". Sin ellas no se puede distinguir un
 * campo que el organizador cambió de uno que el resumen del servidor trajo ya
 * puesto (el resumen copia los `required_item_*` y los códigos sueltos del nodo,
 * que pueden no ser los que el servidor aplica de verdad). Solo un nodo marcado se
 * reescribe al guardar; los demás conservan lo guardado tal cual.
 */
export const MARCA_REQUISITO = '_edited_requirement'
export const MARCA_CODIGO = '_edited_code'

function distinto(a: unknown, b: unknown) {
  return JSON.stringify(a ?? null) !== JSON.stringify(b ?? null)
}

/**
 * Devuelve el nodo nuevo con las marcas de edición puestas si, respecto al
 * anterior, ha cambiado algo del requisito de mochila o del código de emergencia.
 * Las marcas son pegajosas: una vez puestas no se quitan hasta recargar.
 */
export function markEditedFields<T extends Registro>(anterior: Registro | null | undefined, siguiente: T): T {
  const antes = comoRegistro(anterior)
  const antesConfig = comoRegistro(antes.config)
  const despuesConfig = comoRegistro(siguiente.config)

  // Cambiar de familia de juego descarta la config guardada: lo que solo vivía
  // ahí (requisito, código) hay que reescribirlo desde lo que enseña el editor.
  const cambioDeFamilia = antes.type !== undefined && distinto(antes.type, siguiente.type)

  const requisito =
    cambioDeFamilia ||
    Boolean(antes[MARCA_REQUISITO]) ||
    CLAVES_REQUISITO_NODO.some((clave) => distinto(antes[clave], siguiente[clave])) ||
    CLAVES_REQUISITO_CONFIG.some((clave) => distinto(antesConfig[clave], despuesConfig[clave]))

  const codigo =
    cambioDeFamilia ||
    Boolean(antes[MARCA_CODIGO]) ||
    ['fallback_code', 'physical_fallback_code'].some((clave) => distinto(antes[clave], siguiente[clave])) ||
    ['success_code', 'fallback_code'].some((clave) => distinto(antesConfig[clave], despuesConfig[clave]))

  const faltaRequisito = requisito && siguiente[MARCA_REQUISITO] !== true
  const faltaCodigo = codigo && siguiente[MARCA_CODIGO] !== true
  if (!faltaRequisito && !faltaCodigo) return siguiente

  return {
    ...siguiente,
    ...(requisito ? { [MARCA_REQUISITO]: true } : {}),
    ...(codigo ? { [MARCA_CODIGO]: true } : {}),
  }
}

/**
 * Escribe el requisito en TODOS los sitios donde el servidor podría leerlo, y
 * borra `requirements`, que tiene prioridad sobre todos y, si se dejara, haría
 * que el cambio se ignorase. Modifica `destino` (y su `config`, que se copia).
 */
export function writeRequirement(destino: Registro, requisito: ItemRequirement | null) {
  delete destino.requirements
  for (const clave of CLAVES_REQUISITO_NODO) delete destino[clave]

  const config = { ...comoRegistro(destino.config) }
  for (const clave of CLAVES_REQUISITO_CONFIG) delete config[clave]

  if (requisito) {
    destino.required_item_id = requisito.item_id
    destino.required_item_label = requisito.label
    destino.required_item_quantity = requisito.quantity
    destino.consume_required_item = requisito.consume
    config.required_item_id = requisito.item_id
    config.required_item_label = requisito.label
    config.required_item_quantity = requisito.quantity
    config.required_item_consume = requisito.consume
  }

  destino.config = config
}

/**
 * Escribe el código de emergencia donde el servidor lo lee, empezando por
 * `answer`, que es el que manda. Con `''` lo quita de todos ellos.
 */
export function writeManualCode(destino: Registro, codigo: string) {
  const config = { ...comoRegistro(destino.config) }

  if (codigo) {
    destino.answer = codigo
    destino.fallback_code = codigo
    destino.physical_fallback_code = codigo
    if ('success_code' in destino) destino.success_code = codigo
    config.success_code = codigo
    if ('fallback_code' in config) config.fallback_code = codigo
  } else {
    destino.answer = ''
    delete destino.success_code
    delete destino.fallback_code
    delete destino.physical_fallback_code
    delete config.success_code
    delete config.fallback_code
  }

  destino.config = config
}

/**
 * Aplica al nodo que se va a guardar lo que el editor pide para el requisito
 * y el código de emergencia.
 *
 * La comparación es contra el nodo RESULTANTE (`destino`), no contra el que había
 * guardado: al cambiar de familia de juego la config guardada se descarta, y un
 * requisito o un código que solo vivían ahí se perderían aunque «no hubiera
 * cambiado nada» respecto a lo guardado.
 */
export function applyEditorFieldsToRaw(
  destino: Registro,
  rawStage: unknown,
  stage: unknown,
  localConfig: unknown
) {
  // Un nodo que ya estaba guardado solo se reescribe si el editor lo TOCÓ (marca);
  // uno nuevo no tiene nada guardado que conservar.
  const nodo = comoRegistro(stage)
  const esNuevo = !rawStage

  if (esNuevo || nodo[MARCA_REQUISITO] === true) {
    const requisitoQuerido = wantedRequirement(stage, localConfig, readRawItemRequirement(rawStage))
    if (requisitoQuerido !== undefined && !sameRequirement(readRawItemRequirement(destino), requisitoQuerido)) {
      writeRequirement(destino, requisitoQuerido)
    }
  }

  if (esNuevo || nodo[MARCA_CODIGO] === true) {
    const codigoQuerido = wantedManualCode(stage, localConfig)
    if (codigoQuerido !== undefined) {
      // Debe quedar UN solo código, el que enseña el editor: un `answer` heredado con
      // otro valor seguiría valiendo a escondidas.
      const presentes = readAllManualCodes(destino)
      const yaEsAsi = codigoQuerido === '' ? presentes.length === 0 : presentes.length === 1 && presentes[0] === codigoQuerido
      if (!yaEsAsi) writeManualCode(destino, codigoQuerido)
    }
  }

  return destino
}

/**
 * Pone en un nodo del resumen del servidor el requisito y el código de emergencia
 * que el SERVIDOR aplicaría, leídos del nodo guardado. El resumen no los trae, o
 * los trae tal cual estén sueltos en el nodo (que no siempre es lo que vale: un
 * `requirements` o un `answer` mandan sobre ellos). Se usa solo al cargar datos
 * del servidor, nunca sobre lo que se está editando.
 */
export function hydrateStageFromRaw<T extends Registro>(stage: T, raw: unknown): T {
  if (!raw) return stage

  let siguiente: Registro = stage

  const requisito = readRawItemRequirement(raw)
  if (requisito) {
    siguiente = {
      ...siguiente,
      required_item_id: requisito.item_id,
      required_item_label: requisito.label,
      required_item_quantity: requisito.quantity,
      consume_required_item: requisito.consume,
      requires_item: true,
    }
  }

  const codigo = readRawManualCode(raw)
  if (codigo) {
    siguiente = { ...siguiente, fallback_code: codigo, physical_fallback_code: codigo }
  }

  return siguiente as T
}

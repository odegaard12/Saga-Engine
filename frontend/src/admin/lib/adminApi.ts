import {
  AdminHttpError,
  describeAdminError,
  describeValidationErrors,
  extractErrorDetail,
  isAdminHttpError,
  notifyAdminSessionExpired,
} from './adminErrors'

export type AdminPhysicalNodeKind = 'collectible' | 'requirement' | 'clue' | 'bonus'

export type AdminReactOverviewStage = {
  id?: number | string
  index: number
  title: string
  type: string
  raw_type?: string
  type_fallback_reason?: string
  label?: string
  lat?: number | null
  lon?: number | null
  radius?: number | null
  entry_mode?: string
  require_proximity?: boolean
  has_hint?: boolean
  has_manual_fallback?: boolean
  content?: string
  intro_title?: string
  intro_body?: string
  objective?: string
  config_summary?: string[]
  messages?: {
    hint?: string
    gps_unavailable?: string
    locked?: string
  }
  physical_node_kind?: AdminPhysicalNodeKind
  physical_item_kind?: AdminPhysicalNodeKind
  physical_item_id?: string
  physical_item_label?: string
  qr_payload?: string
  physical_qr?: {
    item_id: string
    label: string
    kind: AdminPhysicalNodeKind
    payload: string
    card_text?: string
    updated_at?: string
  }
  /** Puntos de moldeado de la ruta del tramo que LLEGA a este nodo: [[lat, lon], ...] */
  route_via?: Array<[number, number]>
  /** Trazado real del tramo que llega a este nodo (GPX de campo) */
  route_track?: Array<[number, number]>
  /**
   * Requisito de mochila y código de emergencia. El resumen del servidor no los
   * devuelve: el panel los completa leyendo el nodo guardado (ver
   * `hydrateStagesFromRaw` en stageFields.ts) y los vuelve a escribir al guardar.
   */
  required_item_id?: string
  required_item_label?: string
  required_item_quantity?: number
  consume_required_item?: boolean
  requires_item?: boolean
  fallback_code?: string
  physical_fallback_code?: string
}

export type AdminRawStage = Record<string, unknown>

export type AdminProfileAction =
  'reset_profile' | 'level_prev' | 'level_next' | 'mark_finished' | 'restore_node'

export type AdminProfileActionResponse = {
  status: 'ok' | 'error' | 'fail'
  detail?: string
  message?: string
  profile_id?: string
  action?: AdminProfileAction
  previous_level?: number
  level?: number
  finished?: boolean
  total_stages?: number
}

export type AdminConfigSaveResponse = {
  status: 'ok' | 'fail'
  message?: string
  httpStatus?: number
}

export type AdminLoginResponse = {
  status: 'ok' | 'fail' | 'password_change_required'
  message?: string
  must_change?: boolean
  /** Hasta cuándo vale la sesión (segundos desde 1970), si el servidor lo dice. */
  session_expires_at?: number
}

export type AdminStagesResponse = {
  status: 'ok' | 'fail'
  message?: string
  stages?: AdminRawStage[]
  /** Huella de la lista de nodos tal y como está guardada AHORA (contrato 1). */
  stages_revision?: string
  httpStatus?: number
}

/** A quién le cambia el nodo con un guardado (contrato 2: `dry_run`). */
export type AdminAffectedPlayer = {
  user: string
  display_name?: string
  level_antes?: number | null
  level_despues?: number | null
  nodo_antes?: string | number | null
  nodo_despues?: string | number | null
}

export type AdminSaveResponse = {
  status: 'ok' | 'fail' | 'conflict'
  message?: string
  httpStatus?: number
  /** Solo en un ensayo (`dry_run: true`): el servidor NO guardó nada. */
  dry_run?: boolean
  afectados?: AdminAffectedPlayer[]
  /** Solo en un conflicto (409 `stages_changed`): la huella que hay ahora. */
  reason?: string
  current_revision?: string
  /** Errores de validación por nodo (400). */
  errors?: Array<{ index?: number | null; field?: string; detail?: string }>
  stages_revision?: string
}

export type AdminSaveOptions = {
  /** La huella con la que se cargaron los nodos que se están editando. */
  stagesRevision?: string
  /** Pide solo el ensayo: a quién afectaría, sin guardar nada. */
  dryRun?: boolean
}

export type AdminReactOverviewProfile = {
  id: string
  display_name: string
  mode?: string
  status?: string
  color?: string
  avatar_url?: string
  avatar_initials?: string
  level?: number | null
  finished?: boolean
  presence?: string
  gps_status?: string
  last_seen?: number | string | null
  inventory_snapshot?: any
}

export type AdminReactOverviewResponse = {
  status: 'ok' | 'fail' | 'password_change_required'
  message?: string
  config?: {
    site_name?: string
    admin_title?: string
    admin_subtitle?: string
    player_theme?: string
    map_center?: [number, number]
    map_zoom?: number
    login_title?: string
    login_subtitle?: string
    login_instructions?: string
    prologue_title?: string
    prologue_subtitle?: string
    prologue_image_url?: string
    prologue_body?: string
    mapbox_token?: string
    mapbox_style?: string
    /** Si la puerta de misión está activa. Nunca llega la clave, sólo el estado. */
    mission_pass_enabled?: boolean
    /** El servidor rechaza avances lejos del nodo (ver runtime/proximidad.py). */
    require_server_proximity?: boolean
  }
  counts?: {
    players: number
    profiles: number
    stages: number
    finished_profiles: number
    family_counts: Record<string, number>
    /** Mismos nodos, contados por las 5 familias de presentación del admin. */
    display_family_counts?: Record<string, number>
  }
  families?: Array<{ id: string; label: string }>
  /** Las 5 familias de presentación del admin (displayFamilies.ts). */
  display_families?: Array<{ id: string; label: string }>
  stages?: AdminReactOverviewStage[]
  /**
   * Huella de la lista de nodos cuando se cargó esta vista (contrato 1). Se
   * devuelve tal cual al guardar: si otra pestaña o persona guardó antes, el
   * servidor contesta 409 en vez de pisarla.
   */
  stages_revision?: string
  profiles?: AdminReactOverviewProfile[]
  /**
   * Los perfiles completos, con la foto incrustada.
   *
   * Vienen por aquí y no por /api/config, que es público: allí eran 134 KB de
   * los 135 KB que el jugador se bajaba cada treinta segundos, y dejaban las
   * caras de los catorce al alcance de cualquiera. El panel las necesita
   * enteras para editarlas.
   */
  player_profiles?: Array<Record<string, unknown>>
}

async function readJsonBody(res: Response): Promise<unknown> {
  try {
    return await res.json()
  } catch {
    return null
  }
}

/**
 * Convierte una respuesta que no es 2xx en un `AdminHttpError` con el detalle
 * que mandó el servidor. Si es un 403 de sesión, además avisa a la aplicación
 * (evento en `window`) para que vuelva al login SIN tirar el trabajo pendiente:
 * antes cada panel se quedaba con un «HTTP 403» a secas, en inglés.
 */
async function httpErrorFrom(res: Response): Promise<AdminHttpError> {
  const body = await readJsonBody(res)
  const detail = extractErrorDetail(body)
  notifyAdminSessionExpired(res.status, detail)
  return new AdminHttpError(res.status, detail, body)
}

async function adminPostJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    throw await httpErrorFrom(res)
  }

  return res.json() as Promise<T>
}

export function loginAdmin(password: string) {
  return adminPostJson<AdminLoginResponse>('/api/admin/login', { password })
}

/**
 * Cambiar la contraseña de admin. Con fetch propio, no `adminPostJson`: los
 * errores del servidor ("demasiado corta", "no coinciden") vienen en el
 * cuerpo con código 400 y hay que enseñárselos a quien la está cambiando.
 */
export async function changeAdminPassword(
  actual: string,
  nueva: string,
  confirmar: string
): Promise<{ ok: boolean; detalle?: string }> {
  const res = await fetch('/api/admin/change-password', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: actual, new_password: nueva, confirm_password: confirmar }),
  })
  let cuerpo: { status?: string; detail?: string } = {}
  try {
    cuerpo = await res.json()
  } catch {
    cuerpo = {}
  }
  return res.ok && cuerpo.status === 'ok'
    ? { ok: true }
    : { ok: false, detalle: cuerpo.detail || `HTTP ${res.status}` }
}

export function logoutAdmin() {
  return adminPostJson<AdminLoginResponse>('/api/admin/logout', {})
}

export function fetchAdminReactOverview(password?: string) {
  return adminPostJson<AdminReactOverviewResponse>(
    '/api/admin/react-overview',
    password ? { password } : {}
  )
}

export type SagaBackup = {
  status: string
  format: string
  format_version: number
  exported_at: number
  engine_version: string
  counts: { stages: number; profiles: number; route_points: number }
  [key: string]: unknown
}

/** Copia de respaldo completa: nodos, juegos, historia, jugadores y trazado. */
export function fetchMissionBackup(password?: string) {
  return adminPostJson<SagaBackup>('/api/admin/export', password ? { password } : {})
}

/**
 * La contraseña, si se pasa, viaja UNA vez y con su nombre de siempre. Antes se
 * probaban cinco nombres distintos (`admin_pass`, `admin_key`, `key`...) y, si
 * la primera fallaba, las cuatro restantes: hasta quince peticiones para un solo
 * guardado. El panel trabaja con la cookie de sesión y nunca la pasa.
 */
function conClave(password: string | undefined, cuerpo: Record<string, unknown>) {
  return password ? { password, ...cuerpo } : cuerpo
}

function normalizeAdminStagesPayloadResilient(payload: unknown): AdminStagesResponse {
  if (Array.isArray(payload)) {
    return { status: 'ok', stages: payload as AdminRawStage[] }
  }

  if (!payload || typeof payload !== 'object') {
    return { status: 'fail', message: 'Empty response from admin stages endpoint.' }
  }

  const obj = payload as Record<string, unknown>
  const rawStatus = typeof obj.status === 'string' ? obj.status : 'ok'
  const message = typeof obj.message === 'string' ? obj.message : undefined

  const stages = Array.isArray(obj.stages)
    ? obj.stages
    : Array.isArray(obj.data)
      ? obj.data
      : Array.isArray(obj.items)
        ? obj.items
        : Array.isArray(obj.nodes)
          ? obj.nodes
          : undefined

  if (rawStatus === 'fail') {
    return { status: 'fail', message: message || 'Admin stages endpoint returned fail.' }
  }

  if (!stages) {
    return { status: 'fail', message: message || 'Admin stages response did not include stages.' }
  }

  const revision =
    typeof obj.stages_revision === 'string' && obj.stages_revision ? obj.stages_revision : undefined

  return {
    status: 'ok',
    stages: stages as AdminRawStage[],
    ...(revision ? { stages_revision: revision } : {}),
  }
}

/**
 * La lista de nodos tal y como está guardada en el servidor, entera (con los
 * códigos de respaldo y todo lo que el resumen del panel no trae).
 *
 * Nunca lanza: si algo falla devuelve `{ status: 'fail', message }` con el
 * motivo en castellano. QUIEN GUARDA no puede continuar si esto falla: guardar
 * sin haber leído los nodos reales borraba los códigos de respaldo de todos.
 */
export async function fetchAdminStages(password?: string): Promise<AdminStagesResponse> {
  try {
    const res = await fetch('/api/admin/stages', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(conClave(password, {})),
    })

    if (!res.ok) {
      const fallo = await httpErrorFrom(res)
      return {
        status: 'fail',
        message: describeAdminError(fallo, 'cargar'),
        httpStatus: res.status,
      }
    }

    const normalized = normalizeAdminStagesPayloadResilient(await readJsonBody(res))
    return normalized.status === 'ok'
      ? normalized
      : {
          ...normalized,
          message: normalized.message || 'El servidor no devolvió la lista de nodos.',
        }
  } catch (err) {
    return {
      status: 'fail',
      message: describeAdminError(err, 'cargar'),
      httpStatus: isAdminHttpError(err) ? err.status : undefined,
    }
  }
}

function normalizeAdminSaveBody(status: number, payload: unknown): AdminSaveResponse {
  const obj = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
  const rawStatus = typeof obj.status === 'string' ? obj.status.toLowerCase() : ''
  const revision = (valor: unknown) => (typeof valor === 'string' && valor ? valor : undefined)

  // Conflicto de revisión (contrato 1): otro guardado se adelantó.
  if (status === 409 || rawStatus === 'conflict') {
    return {
      status: 'conflict',
      httpStatus: status,
      reason: typeof obj.reason === 'string' ? obj.reason : 'stages_changed',
      current_revision: revision(obj.current_revision),
      message:
        'La misión ha cambiado en el servidor desde que la cargaste (otra pestaña u otra persona ha guardado).',
    }
  }

  if (status >= 400) {
    const detalle = extractErrorDetail(payload)
    const errores = Array.isArray(obj.errors)
      ? (obj.errors as AdminSaveResponse['errors'])
      : undefined
    const validaciones = describeValidationErrors(errores)
    return {
      status: 'fail',
      httpStatus: status,
      errors: errores,
      message: validaciones
        ? `El servidor ha rechazado la misión: ${validaciones}.`
        : describeAdminError(new AdminHttpError(status, detalle, payload), 'guardar'),
    }
  }

  if (rawStatus !== 'ok' && rawStatus !== 'success') {
    const mensaje =
      typeof obj.message === 'string'
        ? obj.message
        : typeof obj.detail === 'string'
          ? obj.detail
          : ''
    return {
      status: 'fail',
      httpStatus: status,
      message:
        mensaje || `El servidor no confirmó el guardado (estado «${rawStatus || 'sin estado'}»).`,
    }
  }

  return {
    status: 'ok',
    httpStatus: status,
    dry_run: obj.dry_run === true,
    afectados: Array.isArray(obj.afectados) ? (obj.afectados as AdminAffectedPlayer[]) : undefined,
    stages_revision: revision(obj.stages_revision),
  }
}

/**
 * Guarda los nodos. UNA sola petición `{ stages, stages_revision? }`.
 *
 * - `stagesRevision` es la huella con la que se cargó lo que se está editando
 *   (contrato 1). Si otra persona guardó antes, el servidor contesta 409 y aquí
 *   sale `{ status: 'conflict' }` en vez de pisarla.
 * - `dryRun` pide solo el ensayo (contrato 2): a quién le cambiaría el nodo.
 *   Un servidor que no lo conozca GUARDARÍA de verdad y contestaría sin
 *   `dry_run: true`: quien llama tiene que comprobarlo (ver adminSaveFlow.ts).
 */
export async function saveAdminStages(
  password: string | undefined,
  stages: AdminRawStage[],
  options: AdminSaveOptions = {}
): Promise<AdminSaveResponse> {
  try {
    const res = await fetch('/api/admin/save', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(
        conClave(password, {
          stages,
          ...(options.stagesRevision ? { stages_revision: options.stagesRevision } : {}),
          ...(options.dryRun ? { dry_run: true } : {}),
        })
      ),
    })

    const payload = await readJsonBody(res)
    if (!res.ok) notifyAdminSessionExpired(res.status, extractErrorDetail(payload))
    return normalizeAdminSaveBody(res.status, payload)
  } catch (err) {
    return {
      status: 'fail',
      message: describeAdminError(err, 'guardar'),
      httpStatus: isAdminHttpError(err) ? err.status : undefined,
    }
  }
}

function normalizeAdminConfigSavePayload(payload: unknown): AdminConfigSaveResponse {
  if (!payload || typeof payload !== 'object') {
    return {
      status: 'fail',
      message: 'El servidor no ha contestado al guardar los ajustes.',
    }
  }

  const obj = payload as Record<string, unknown>
  const rawStatus = typeof obj.status === 'string' ? obj.status.toLowerCase() : ''

  const message =
    typeof obj.message === 'string'
      ? obj.message
      : typeof obj.detail === 'string'
        ? obj.detail
        : undefined

  if (rawStatus !== 'ok' && rawStatus !== 'success') {
    return {
      status: 'fail',
      message:
        message || `El servidor no confirmó el guardado (estado «${rawStatus || 'sin estado'}»).`,
    }
  }

  return {
    status: 'ok',
    message,
  }
}

/**
 * Guarda los ajustes. UNA sola petición con la forma que el servidor exige:
 * `{ config: {...} }` (contrato 3: sin `config` contesta 400 `missing_config`).
 *
 * Antes se probaban `{config}`, `{data: config}` y `{...config}`: el servidor
 * hace `data.get("config") or {}` y contesta «ok» sin cambiar nada con las otras
 * dos, así que si la primera petición se perdía por la red, la segunda «triunfaba»
 * sin guardar un solo campo. Quien llama debe releer y comparar después
 * (adminConfigVerify.ts): un «ok» del servidor no prueba que se guardara.
 */
export async function saveAdminConfig(
  password: string | undefined,
  config: Record<string, unknown>
): Promise<AdminConfigSaveResponse> {
  try {
    const res = await fetch('/api/admin/save-config', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(conClave(password, { config })),
    })

    const payload = await readJsonBody(res)

    if (!res.ok) {
      const detalle = extractErrorDetail(payload)
      notifyAdminSessionExpired(res.status, detalle)
      return {
        status: 'fail',
        httpStatus: res.status,
        message: describeAdminError(new AdminHttpError(res.status, detalle, payload), 'guardar'),
      }
    }

    return { ...normalizeAdminConfigSavePayload(payload), httpStatus: res.status }
  } catch (err) {
    return {
      status: 'fail',
      message: describeAdminError(err, 'guardar'),
      httpStatus: isAdminHttpError(err) ? err.status : undefined,
    }
  }
}

export function runAdminProfileAction(profileId: string, action: AdminProfileAction) {
  return adminPostJson<AdminProfileActionResponse>('/api/admin/profile-action', {
    profile_id: profileId,
    action,
  })
}

/**
 * A diferencia de adminPostJson, esta NO lanza en un HTTP que no sea 2xx: el
 * endpoint del banco de pruebas contesta 409 con un cuerpo útil
 * (`players_in_progress`) cuando hay gente de verdad jugando, y hace falta
 * leerlo, no perderlo en una excepción genérica.
 */
async function adminPostJsonConEstado(
  url: string,
  body: unknown
): Promise<{ httpStatus: number; data: any }> {
  const res = await fetch(url, {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  let data: any = null
  try {
    data = await res.json()
  } catch {
    data = null
  }

  if (!res.ok) notifyAdminSessionExpired(res.status, extractErrorDetail(data))

  return { httpStatus: res.status, data }
}

export function runSimulationBench(params: {
  player_count: number
  device: string
  network: string
  force?: boolean
}) {
  return adminPostJsonConEstado('/api/admin/simulation/run', params)
}

export function cleanupSimulationBench() {
  return adminPostJsonConEstado('/api/admin/simulation/cleanup', {})
}

export function runLongSessionPauseBench(params: {
  device: string
  pause_at?: number
  force?: boolean
}) {
  return adminPostJsonConEstado('/api/admin/simulation/long-session', params)
}

/** Estados válidos de un evento, ver backend/app/storage/event_log.py. */
export type AdminEventStatus = 'pending' | 'synced' | 'failed' | 'ignored'

export type AdminEvent = {
  id: string
  type: string
  status: AdminEventStatus
  source: string
  created_at: string
  user?: string
  team_id?: string
  node_id?: string
  payload?: Record<string, unknown>
  synced_at?: string
  error?: string
}

export type AdminEventsResponse = {
  status: 'ok' | 'error'
  detail?: string
  events?: AdminEvent[]
  /**
   * Cuántos eventos pendientes hay en TOTAL, no solo entre los que llegan en
   * esta página (que se corta en `limit`). Si el servidor no lo manda, el panel
   * no puede afirmar un número exacto cuando la lista llega al tope: dice «200+».
   */
  pending_count?: number
  total_count?: number
}

/** Lista de eventos del registro de actividad (heartbeats, QR, acciones de admin...). */
export function fetchAdminEvents(
  params: { limit?: number; status?: string; user?: string; type?: string } = {}
) {
  return adminPostJson<AdminEventsResponse>('/api/admin/events', params)
}

export type AdminMarkEventResponse = {
  status: 'ok' | 'error'
  detail?: string
  event?: AdminEvent
}

/** Cambia el estado de un evento (p.ej. "synced" para marcarlo como leído). */
export function markAdminEvent(eventId: string, status: AdminEventStatus, error?: string) {
  return adminPostJson<AdminMarkEventResponse>('/api/admin/events/mark', {
    event_id: eventId,
    status,
    ...(error ? { error } : {}),
  })
}

export type AntiCheatSuspicion = {
  reason: string
  at: number
  evidence?: Record<string, unknown>
  // Ausente = sospecha (entradas de antes de que existiera este campo). El
  // motor antitrampas SAGA Engine sólo escribe 'info' para notas neutras
  // como "usó posición manual" (ver backend/app/runtime/anti_cheat.py).
  severity?: 'suspicion' | 'info'
}

export type AntiCheatPlayerFlags = {
  user: string
  display_name: string
  count: number
  suspicion_count: number
  info_count: number
  suspicions: AntiCheatSuspicion[]
}

export type AntiCheatFlagsResponse = {
  status: 'ok' | 'error'
  detail?: string
  server_ts?: number
  players?: AntiCheatPlayerFlags[]
}

/**
 * Sospechas de trampa anotadas por el servidor (ver
 * backend/app/runtime/anti_cheat.py): velocidad imposible, nodos completados
 * sin haber estado cerca, retos superados demasiado rápido, o eventos
 * offline con fecha futura. Sólo lectura -esto nunca toca la clasificación
 * por sí solo, lo decide el organizador a mano-.
 */
export function fetchAntiCheatFlags(password?: string) {
  return adminPostJson<AntiCheatFlagsResponse>(
    '/api/admin/anti-cheat-flags',
    password ? { password } : {}
  )
}

export type AdminDatosPersonalesConteo = {
  fotos: number
  ficheros_de_imagen: number
  posiciones_gps: number
  registro_de_partida?: number
}

export type AdminDatosPersonalesResponse = {
  status: 'ok' | 'error'
  detail?: string
  accion?: 'contar' | 'borrar'
  datos?: AdminDatosPersonalesConteo
  para_borrar?: string
  borrado?: {
    fotos: number
    imagenes: number
    posiciones_gps: number
    registro_de_partida?: number
  }
  queda?: AdminDatosPersonalesConteo
}

/** Sólo cuenta lo que hay guardado (fotos, posiciones GPS): no borra nada. */
export function fetchDatosPersonales() {
  return adminPostJson<AdminDatosPersonalesResponse>('/api/admin/datos-personales', {})
}

/**
 * Borra fotos de campo y/o posiciones GPS de verdad. Requiere la confirmación
 * exacta que exige el backend (ver CONFIRMACION_BORRADO en admin.py):
 * llamar a esto sin haber confirmado con la persona primero es un borrado sin
 * vuelta atrás de datos de personas reales.
 */
export function purgeDatosPersonales(opts: { fotos?: boolean; posiciones?: boolean } = {}) {
  return adminPostJson<AdminDatosPersonalesResponse>('/api/admin/datos-personales', {
    confirmacion: 'BORRAR',
    ...opts,
  })
}

// ---------------------------------------------------------------------------
// Registro de partida (ver backend/app/runtime/match_log.py)
// ---------------------------------------------------------------------------

export type MatchLogEntry = {
  id: string
  type: string
  user: string
  display_name: string
  created_at: string
  client_created_at?: string
  /** Cuándo PASÓ (hora del móvil si la trae). El servidor la calcula al listar. */
  occurred_at?: string
  severity?: 'suspicion' | 'info'
  payload?: Record<string, unknown>
}

export type MatchLogResponse = {
  status: 'ok' | 'error'
  detail?: string
  entries?: MatchLogEntry[]
  count?: number
}

export type MatchLogQuery = {
  user?: string
  desde?: string
  hasta?: string
  type?: string
  limit?: number
  /** Sólo las filas de sospecha de trampa. */
  solo_sospechas?: boolean
  /** Sólo lo hecho sin cobertura o subido en diferido. */
  solo_sin_cobertura?: boolean
}

/** Línea de tiempo de un jugador (o de todos) entre dos fechas. Sólo lectura. */
export function fetchMatchLog(query: MatchLogQuery = {}) {
  return adminPostJson<MatchLogResponse>('/api/admin/match-log', query)
}

/**
 * Descarga la misma línea de tiempo en JSON o CSV. Usa fetch propio -no
 * adminPostJson- porque la respuesta no siempre es JSON (el CSV llega como
 * texto con cabecera de descarga) y hay que quedarse con el Blob entero.
 */
export async function downloadMatchLogExport(
  query: MatchLogQuery & { formato: 'json' | 'csv' }
): Promise<Blob> {
  const res = await fetch('/api/admin/match-log/export', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { Accept: '*/*', 'Content-Type': 'application/json' },
    body: JSON.stringify(query),
  })
  if (!res.ok) {
    throw await httpErrorFrom(res)
  }
  return res.blob()
}

// ---------------------------------------------------------------------------
// Exportar partida (ver backend/app/runtime/exportar_partida.py)
// ---------------------------------------------------------------------------

export type ResumenExportacion = {
  status: 'ok'
  registro_activo: boolean
  jugadores: number
  nodos: number
  filas_registro: number
  sospechas: number
  errores: number
  auditoria: number
}

/** Cuánto hay registrado (para el panel «Exportar partida»). */
export function fetchResumenExportacion() {
  return adminPostJson<ResumenExportacion>('/api/admin/partida/resumen', {})
}

/** El nombre que propone el servidor en `Content-Disposition` (o uno por defecto). */
export function nombreDeDescarga(cabecera: string | null, defecto: string): string {
  if (!cabecera) return defecto
  const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(cabecera)
  if (utf8) {
    try {
      return decodeURIComponent(utf8[1].trim())
    } catch {
      // cae al nombre simple
    }
  }
  const simple = /filename="?([^";]+)"?/i.exec(cabecera)
  return simple ? simple[1].trim() : defecto
}

/** El ZIP de la partida, como Blob (no se guarda en ningún sitio hasta que el navegador lo baja). */
export async function descargarExportacionPartida(opciones: {
  anonimizar: boolean
}): Promise<{ blob: Blob; nombre: string }> {
  const res = await fetch('/api/admin/partida/exportar', {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { Accept: 'application/zip', 'Content-Type': 'application/json' },
    body: JSON.stringify({ anonimizar: opciones.anonimizar }),
  })
  if (!res.ok) {
    throw await httpErrorFrom(res)
  }
  const blob = await res.blob()
  return {
    blob,
    nombre: nombreDeDescarga(res.headers.get('Content-Disposition'), 'saga-partida.zip'),
  }
}

// ---------------------------------------------------------------------------
// Vestuario desbloqueable (ver backend/app/runtime/desbloqueos.py)
// ---------------------------------------------------------------------------

export type ReglaVestuario = {
  id: string
  cuando: { tipo: string; nodo?: string; n?: number; km?: number }
  da: string[]
  texto?: string
  nota?: string
}

export type PiezaDelCatalogo = {
  clave: string
  tipo: 'mx' | 'ropa' | 'hair' | 'item' | 'gesto' | string
  nombre: string
  libre: boolean
  bloqueable: boolean
  se_consigue?: string
  sin_regla?: boolean
}

export type PiezaDeJugador = {
  por: string
  fuente: string
  sospecha: boolean
  concedido_ms: number
  retirado: boolean
}

export type DesbloqueablesResponse = {
  status: 'ok'
  config: {
    activos: boolean
    revision: number
    bloqueados: string[] | null
    reglas: ReglaVestuario[]
    activado_ms: number
  }
  catalogo: PiezaDelCatalogo[]
  reglas: ReglaVestuario[]
  propuesta: ReglaVestuario[]
  tipos: { tipo: string; etiqueta: string; parametros: string[] }[]
  nodos: { id: string; title: string }[]
  jugadores: {
    user: string
    display_name: string
    piezas: Record<string, PiezaDeJugador>
    metros: number
  }[]
  eventos: {
    id: number
    jugador: string
    clave: string
    accion: string
    fuente: string
    por: string
    sospecha: number
    motivo: string
    creado_ms: number
  }[]
  combinaciones_libres: number
}

export type SustitucionDeAvatar = {
  jugador: string
  quita: string[]
  antes: unknown
  despues: unknown
}

export type EnsayoDesbloqueables = {
  status: 'ok'
  concederia: Record<string, { display_name: string; claves: string[]; sospecha: boolean }>
  sustituciones: SustitucionDeAvatar[]
}

export function fetchDesbloqueables() {
  return adminPostJson<DesbloqueablesResponse>('/api/admin/desbloqueables', {})
}

/** ¿A quién se le daría qué? No escribe nada. */
export function ensayarDesbloqueables(body: {
  reglas?: ReglaVestuario[]
  bloqueados?: string[] | null
  activar?: boolean
}) {
  return adminPostJson<EnsayoDesbloqueables>('/api/admin/desbloqueables/ensayar', body)
}

/**
 * Guarda el interruptor, el catálogo o las reglas. Devuelve el código HTTP: 409
 * si otra pestaña guardó antes (revisión vieja), 400 si una regla no vale.
 */
export function guardarDesbloqueables(body: {
  revision: number
  activos?: boolean
  reglas?: ReglaVestuario[]
  bloqueados?: string[] | null
  aplicar_a_lo_jugado?: boolean
}) {
  return adminPostJsonConEstado('/api/admin/desbloqueables/guardar', body)
}

export function concederDesbloqueo(body: {
  jugadores?: string[]
  todos?: boolean
  claves: string[]
  motivo?: string
}) {
  return adminPostJson<{ status: 'ok'; concedidos: Record<string, string[]> }>(
    '/api/admin/desbloqueos/conceder',
    body
  )
}

export function retirarDesbloqueo(body: { jugador: string; clave: string; motivo?: string }) {
  return adminPostJson<{ status: 'ok'; retirado: boolean; avatar: unknown }>(
    '/api/admin/desbloqueos/retirar',
    body
  )
}

// ---------------------------------------------------------------------------
// Tiempos calculados por el servidor (ver backend/app/runtime/tiempos_de_nodo.py)
// ---------------------------------------------------------------------------

export type TiempoDeNodo = {
  level: number
  node_id: string
  title: string
  declared_ms: number | null
  observed_ms: number | null
  applied_ms: number | null
  fuente: 'observado' | 'declarado' | 'sin_apertura' | 'sin_hora' | 'sin_registro' | string
  penalty_ms: number | null
  manual: boolean | null
  origen: 'online' | 'offline' | null
  opened_at_ms: number | null
  completed_at_ms: number | null
  /** Cómo se comprobó la proximidad: cerca, lejos, modo_prueba, sin_gps (no penaliza). */
  proximidad?: 'cerca' | 'lejos' | 'modo_prueba' | 'sin_gps' | string | null
  prueba?: boolean
  sospechas: { reason: string; severity: string; at: number }[]
}

export type TiemposResponse = {
  status: 'ok'
  server_ts: number
  total_nodes: number
  jugadores: {
    user: string
    display_name: string
    level: number
    finished: boolean
    finished_at: number | null
    total_time_ms: number
    penalties_ms: number
    suspicion_count: number
    nodos_modo_prueba?: string[]
    nodos_sin_gps?: string[]
    nodos: TiempoDeNodo[]
  }[]
}

export function fetchTiempos() {
  return adminPostJson<TiemposResponse>('/api/admin/tiempos', {})
}

/* Avisos al organizador por ntfy (ver backend/app/routers/integraciones.py). */

export type TipoDeAvisoNtfy = 'fin' | 'primero' | 'sospecha' | 'sin_senal' | 'errores'

export interface AvisosNtfyEstado {
  configurado: boolean
  con_token: boolean
  activo: boolean
  tipos: Record<TipoDeAvisoNtfy, boolean>
}

export function fetchAvisosNtfy() {
  return adminPostJson<AvisosNtfyEstado>('/api/admin/avisos', {})
}

export function guardarAvisosNtfy(cambios: {
  activo: boolean
  tipos: Record<TipoDeAvisoNtfy, boolean>
}) {
  return adminPostJson<AvisosNtfyEstado>('/api/admin/avisos/guardar', cambios)
}

export function probarAvisosNtfy() {
  return adminPostJson<{ status: string; detail: string }>('/api/admin/avisos/prueba', {})
}

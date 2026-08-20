import type {
  FieldProofsPayload,
  FieldProofUploadResponse,
  PlayerGamePayload,
  PublicConfig,
  TeamStatusPayload,
} from '../types/player'

function withTimeoutSignal(timeoutMs: number) {
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs)

  return {
    signal: controller.signal,
    cleanup: () => window.clearTimeout(timeoutId),
  }
}

export type BuildInfoPayload = {
  status: 'ok' | 'error'
  version: string
  commit: string
  built_at?: string
}

export type AdvanceResponse = {
  /**
   * `behind` es el servidor diciendo "no he avanzado, voy por detrás de ti":
   * el móvil completó nodos sin cobertura y todavía no los ha sincronizado.
   * Antes esto llegaba como `ok` y el nodo se perdía sin que nadie se enterase.
   */
  status: 'ok' | 'fail' | 'behind'
  user: string
  /** Nivel real del servidor. Viene siempre, pase lo que pase. */
  level?: number
  /** Igual que `level`, en las respuestas `behind`. */
  server_level?: number
  /** Desde qué nodo dijo el móvil que avanzaba. Vuelve en las respuestas `behind`. */
  level_before?: number
  /** El servidor ya tenía este nodo hecho: no ha vuelto a avanzar. */
  duplicate?: boolean
  reason?: string
  requirement?: Record<string, unknown>
}

// En el monte hay tramos con una barra de cobertura: la conexión no falla, se
// queda colgada. Sin límite de tiempo el móvil espera lo que quiera el navegador
// (minutos) y el jugador se come la ruleta después de resolver el reto. Con
// límite, salta el respaldo local: avanza en el móvil y el progreso sube después.
async function postJson<T>(url: string, body: unknown, timeoutMs = 8000): Promise<T> {
  const timeout = withTimeoutSignal(timeoutMs)

  try {
    const res = await fetch(url, {
      method: 'POST',
      signal: timeout.signal,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const fallo = new Error(`Request failed: HTTP ${res.status}`) as Error & { status?: number }
      // El numero hace falta arriba: un 403 es la sesion caducada y tiene
      // arreglo, y no se puede confundir con estar sin cobertura.
      fallo.status = res.status
      throw fallo
    }

    return (await res.json()) as T
  } finally {
    timeout.cleanup()
  }
}

/** La sesion del jugador ha caducado: el servidor rechaza, pero hay red. */
export function esSesionCaducada(error: unknown): boolean {
  const status = (error as { status?: number } | null)?.status
  return status === 401 || status === 403
}

export async function fetchBuildInfo(): Promise<BuildInfoPayload> {
  const timeout = withTimeoutSignal(2000)

  try {
    const res = await fetch(`/api/version?_=${Date.now()}`, {
      signal: timeout.signal,
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        'Cache-Control': 'no-cache',
      },
    })

    if (!res.ok) {
      throw new Error(`Failed to load version: HTTP ${res.status}`)
    }

    return res.json() as Promise<BuildInfoPayload>
  } finally {
    timeout.cleanup()
  }
}

export async function fetchPlayerGame(
  user: string,
  options: { offlinePack?: boolean; fotosPorUrl?: boolean } = {}
): Promise<PlayerGamePayload> {
  const params = new URLSearchParams()
  if (options.offlinePack) params.set('offline_pack', 'true')
  // Le dice al servidor que este cliente sabe pedir las fotos por su URL, así
  // que no hace falta que se las meta dentro del JSON. Mientras no se pida,
  // el servidor las manda dentro como siempre: un móvil con la aplicación
  // vieja cacheada no puede quedarse sin ellas.
  if (options.fotosPorUrl) params.set('fotos_por_url', 'true')
  params.set('_', String(Date.now()))
  const suffix = `?${params.toString()}`
  const timeout = withTimeoutSignal(5000)

  try {
    const res = await fetch(`/api/game/${encodeURIComponent(user)}${suffix}`, {
      signal: timeout.signal,
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
    })

    if (!res.ok) {
      throw new Error(`Failed to load player payload: HTTP ${res.status}`)
    }

    return res.json() as Promise<PlayerGamePayload>
  } finally {
    timeout.cleanup()
  }
}

export async function fetchPublicConfig(): Promise<PublicConfig> {
  const timeout = withTimeoutSignal(7000)

  try {
    const res = await fetch(`/api/config?_=${Date.now()}`, {
      signal: timeout.signal,
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
    })

    if (!res.ok) {
      throw new Error(`Failed to load config: HTTP ${res.status}`)
    }

    return res.json() as Promise<PublicConfig>
  } finally {
    timeout.cleanup()
  }
}

export async function fetchTeamStatus(user: string): Promise<TeamStatusPayload> {
  const timeout = withTimeoutSignal(3000)

  try {
    const res = await fetch(`/api/team/${encodeURIComponent(user)}`, {
      signal: timeout.signal,
      headers: {
        Accept: 'application/json',
      },
    })

    if (!res.ok) {
      throw new Error(`Failed to load team payload: HTTP ${res.status}`)
    }

    return res.json() as Promise<TeamStatusPayload>
  } finally {
    timeout.cleanup()
  }
}

export async function advancePlayer(
  user: string,
  code: string,
  time_spent_ms?: number,
  penalty_ms?: number,
  /** El código lo ha escrito el jugador a mano, no lo manda un minijuego. */
  manual?: boolean,
  /**
   * Desde qué nodo se avanza.
   *
   * Con cobertura mala una petición puede tardar más que el corte y el móvil la
   * vuelve a mandar aunque la primera sí llegase. Con este número el servidor
   * reconoce el eco y no avanza dos veces: sin él, el jugador se saltaba un
   * nodo entero.
   */
  level_before?: number,
  /**
   * Cómo vaciar la cola de nodos completados sin cobertura.
   *
   * Se inyecta desde arriba para no atar este módulo al almacén del jugador.
   */
  vaciarCola?: () => Promise<unknown>
) {
  const cuerpo = {
    user,
    code,
    time_spent_ms,
    penalty_ms,
    manual: Boolean(manual),
    level_before,
  }

  try {
    const respuesta = await postJson<AdvanceResponse>('/api/advance', cuerpo)

    /**
     * "Voy por detrás de ti": hay nodos hechos sin cobertura sin sincronizar.
     *
     * El servidor no puede avanzar sin ellos —no sabe por qué nodo va el
     * jugador—, así que se vacía la cola y se vuelve a intentar una vez. Si
     * después sigue por detrás, se devuelve tal cual y quien llame decide.
     */
    if (respuesta.status === 'behind' && vaciarCola) {
      await vaciarCola().catch(() => undefined)
      return await postJson<AdvanceResponse>('/api/advance', cuerpo)
    }

    return respuesta
  } catch (error) {
    if (!esSesionCaducada(error)) throw error

    /**
     * La sesión caducada se renueva sola y se reintenta.
     *
     * El pase de jugador dura un rato y se entrega al pedir la partida. Si
     * caduca, el servidor rechaza el avance con un 403: el nodo NO se guarda,
     * el tiempo NO se anota, y la aplicación lo daba por bueno igual porque el
     * fallo caía en el mismo sitio que estar sin cobertura. El jugador veía
     * "nodo superado" y el marcador en 00:00, que es justo lo que pasaba.
     *
     * Pedir la partida vuelve a entregar el pase, así que se pide y se manda
     * otra vez. Sin que el jugador se entere.
     */
    await fetchPlayerGame(user).catch(() => undefined)
    return await postJson<AdvanceResponse>('/api/advance', cuerpo)
  }
}

export type HeartbeatResponse = {
  status: string
  user: string
  live_status?: Record<string, unknown>
  /** La tabla de equipo, si se pidió con `equipo: true`. */
  team?: TeamStatusPayload
}

export function sendHeartbeat(args: {
  user: string
  lat?: number
  lon?: number
  gps_status?: string
  source?: string
  /**
   * Que el latido traiga de vuelta la tabla de equipo.
   *
   * Antes eran dos peticiones cada 5 segundos —«aquí estoy yo» y «dónde están
   * los demás»— cuando es la misma conversación: 1 440 por hora y por móvil,
   * tres cuartas partes de todo lo que recibía la Raspberry.
   */
  equipo?: boolean
}) {
  // Se manda cada 5 s: más de 5 s esperando sólo sirve para encadenar latidos
  // colgados. Si se pierde uno, el siguiente lleva la posición buena igual.
  return postJson<HeartbeatResponse>('/api/heartbeat', args, 5000)
}

export async function fetchFieldProofs(user: string): Promise<FieldProofsPayload> {
  const timeout = withTimeoutSignal(3000)

  try {
    const res = await fetch(`/api/field-proofs?user=${encodeURIComponent(user)}`, {
      signal: timeout.signal,
      headers: {
        Accept: 'application/json',
      },
    })

    if (!res.ok) {
      throw new Error(`Failed to load field proofs: HTTP ${res.status}`)
    }

    return res.json() as Promise<FieldProofsPayload>
  } finally {
    timeout.cleanup()
  }
}

export function uploadFieldProof(args: {
  user: string
  image_data_url: string
  lat: number
  lon: number
  note?: string
  stage_id?: string
  stage_title?: string
}) {
  return postJson<FieldProofUploadResponse>('/api/field-proofs', args)
}

export async function deleteFieldProof(
  user: string,
  proofId: string
): Promise<{ status: 'ok'; id: string }> {
  const res = await fetch(
    `/api/field-proofs/${encodeURIComponent(proofId)}?user=${encodeURIComponent(user)}`,
    {
      method: 'DELETE',
      headers: {
        Accept: 'application/json',
      },
    }
  )

  if (!res.ok) {
    throw new Error(`Failed to delete field proof: HTTP ${res.status}`)
  }

  return res.json() as Promise<{ status: 'ok'; id: string }>
}

export function getFieldProofsDownloadUrl(user: string): string {
  return `/api/field-proofs/download?user=${encodeURIComponent(user)}`
}

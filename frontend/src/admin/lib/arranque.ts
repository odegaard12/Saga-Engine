/**
 * Entrar al panel en UNA ida y vuelta (15/11, admin con muy poca cobertura).
 *
 * Con 2G (1,2 s de latencia por petición) lo que más pesaba al entrar no eran los bytes sino las rondas seguidas:
 * entrar, luego la vista general y los nodos, luego la configuración pública. `POST /api/admin/arranque` lo trae todo
 * junto (y el login puede traerlo ya en su respuesta, con `arranque: true`).
 *
 * Lo ya recibido se recuerda en memoria con su huella: la siguiente vez (botón «Recargar») el servidor sólo manda lo
 * que cambió y para lo demás contesta `{ sin_cambios: true }`. Tras recargar la pestaña no hay memoria, así que no se
 * manda ninguna huella y llega todo: el servidor nunca dice «sin cambios» de algo que el panel no tiene.
 *
 * Es de datos puros (sin React ni red): las pruebas lo cargan tal cual.
 */
import type {
  AdminArranqueRespuesta,
  AdminArranqueVivo,
  AdminReactOverviewResponse,
  AdminStagesResponse,
} from './adminApi'

type Parte = 'overview' | 'stages' | 'config'
const PARTES: Parte[] = ['overview', 'stages', 'config']

export type ArranqueResuelto = {
  vista: AdminReactOverviewResponse
  guardados: AdminStagesResponse
  publica: Record<string, unknown> | null
  vivo: AdminArranqueVivo | null
}

type Memoria = {
  overview?: AdminReactOverviewResponse
  stages?: AdminStagesResponse
  config?: Record<string, unknown>
  huellas: Partial<Record<Parte, string>>
}

let memoria: Memoria = { huellas: {} }

function clonar<T>(valor: T): T {
  const sc = (globalThis as { structuredClone?: <U>(v: U) => U }).structuredClone
  return typeof sc === 'function' ? sc(valor) : (JSON.parse(JSON.stringify(valor)) as T)
}

/** Las huellas de lo que ya tenemos (para que el servidor no lo repita), o `undefined` si no tenemos nada. */
export function huellasConocidas(): Partial<Record<Parte, string>> | undefined {
  const huellas: Partial<Record<Parte, string>> = {}
  for (const parte of PARTES) {
    if (memoria[parte] && memoria.huellas[parte]) huellas[parte] = memoria.huellas[parte]
  }
  return Object.keys(huellas).length ? huellas : undefined
}

export function olvidarArranque() {
  memoria = { huellas: {} }
}

function esSinCambios(valor: unknown): boolean {
  return (
    Boolean(valor) &&
    typeof valor === 'object' &&
    (valor as { sin_cambios?: unknown }).sin_cambios === true
  )
}

/**
 * Junta lo que llegó con lo que ya había. `null` si la respuesta no sirve (hay que pedirlo por el camino de siempre):
 * no es `ok`, falta una parte, o dice «sin cambios» de algo que no tenemos.
 */
export function resolverArranque(
  r: AdminArranqueRespuesta | null | undefined
): ArranqueResuelto | null {
  if (!r || r.status !== 'ok') return null

  const nuevas: Memoria = { huellas: {} }
  for (const parte of PARTES) {
    const bruta = r[parte]
    if (!bruta || typeof bruta !== 'object') continue
    const valor = esSinCambios(bruta) ? memoria[parte] : bruta
    if (!valor) return null // «sin cambios» de algo que no tenemos
    ;(nuevas as Record<string, unknown>)[parte] = clonar(valor)
    const huella = r.huellas?.[parte]
    if (typeof huella === 'string' && huella) nuevas.huellas[parte] = huella
  }

  const vista = nuevas.overview
  const guardados = nuevas.stages
  if (!vista || vista.status !== 'ok') return null
  if (!guardados || guardados.status !== 'ok' || !Array.isArray(guardados.stages)) return null

  memoria = nuevas
  return {
    vista: clonar(vista),
    guardados: clonar(guardados),
    publica: nuevas.config ? clonar(nuevas.config) : null,
    vivo: r.live && r.live.status === 'ok' && Array.isArray(r.live.profiles) ? r.live : null,
  }
}

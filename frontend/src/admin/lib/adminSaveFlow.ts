/**
 * El guardado de la misión, paso a paso y sin depender de React.
 *
 * Vivía dentro de `saveLocalStages` (AdminApp) y tenía cuatro fallos que solo se
 * veían en un mal día de cobertura (informe A1-A4, A7, A12):
 *
 *  - Si el servidor guardaba pero la relectura fallaba, el panel se quedaba con
 *    los nodos nuevos con id `local-...` y el segundo «Guardar» los guardaba OTRA
 *    vez con un id distinto: nodos duplicados.
 *  - Si la lectura de los nodos guardados fallaba, seguía con una versión
 *    recortada (sin `answer` ni `rune`) y BORRABA los códigos de respaldo de
 *    todos los nodos.
 *  - Dos personas (o dos pestañas) editando: la última en guardar pisaba a la
 *    otra sin enterarse.
 *  - Reordenar o borrar con gente en ruta: el aviso comparaba con niveles de
 *    cuando se cargó el panel.
 *
 * Aquí el orden es siempre el mismo y cada rama devuelve un resultado que la
 * pantalla sabe contar. Las dependencias (red, `confirm`) se inyectan para
 * poder probar todo esto con simulaciones (tests/js/admin_frontend.cjs).
 */
import type {
  AdminAffectedPlayer,
  AdminRawStage,
  AdminReactOverviewResponse,
  AdminSaveOptions,
  AdminSaveResponse,
  AdminStagesResponse,
} from './adminApi'
import {
  hydrateStagesFromRaw,
  jugadoresDesprazadosPolGardado,
  mergeOverviewIntoRawStages,
  stageIdSequenceChanged,
  verifyPersistedStages,
} from './adminStagePersistence'

export type SaveDeps = {
  fetchStages: () => Promise<AdminStagesResponse>
  saveStages: (stages: AdminRawStage[], options: AdminSaveOptions) => Promise<AdminSaveResponse>
  fetchOverview: () => Promise<AdminReactOverviewResponse>
  confirm: (message: string) => boolean
  /**
   * Se llama EN CUANTO el servidor confirma el guardado real, antes de releer o
   * verificar nada: ahí el panel cambia los ids `local-...` por los guardados.
   */
  onPosted?: (persisted: AdminRawStage[]) => void
}

export type SaveOutcome =
  | {
      kind: 'saved'
      persisted: AdminRawStage[]
      refreshed: AdminReactOverviewResponse | null
      stagesRevision?: string
      notice: string
    }
  | { kind: 'cancelled'; message: string }
  | { kind: 'conflict'; message: string; currentRevision?: string }
  | {
      kind: 'error'
      message: string
      /** true si el servidor SÍ llegó a guardar (falló lo de después). */
      postDone: boolean
      persisted?: AdminRawStage[]
      refreshed?: AdminReactOverviewResponse | null
      stagesRevision?: string
    }

export const MENSAJE_SIN_LECTURA =
  'No se ha guardado nada: no se pudo leer la misión que hay en el servidor. ' +
  'Guardar sin leerla borraría los códigos de respaldo de todos los nodos. ' +
  'Tus cambios siguen aquí; reintenta cuando haya red.'

export const MENSAJE_CONFLICTO =
  'La misión ha cambiado en el servidor desde que la cargaste (otra pestaña u otra persona ha guardado). ' +
  'No se ha guardado nada, para no pisar sus cambios.'

function describirNodo(nodo: unknown, nivel: unknown): string {
  const titulo = typeof nodo === 'string' || typeof nodo === 'number' ? String(nodo).trim() : ''
  const posicion = typeof nivel === 'number' && Number.isFinite(nivel) ? `nodo ${nivel + 1}` : ''
  if (titulo && posicion) return `${posicion} «${titulo}»`
  return titulo ? `«${titulo}»` : posicion || 'fuera de la misión'
}

/** El texto de la confirmación cuando el guardado desplaza a jugadores. */
export function describeAffectedPlayers(afectados: AdminAffectedPlayer[], max = 8): string {
  const lineas = afectados.slice(0, max).map((jugador) => {
    const nombre = jugador.display_name || jugador.user
    return `• ${nombre}: ${describirNodo(jugador.nodo_antes, jugador.level_antes)} → ${describirNodo(
      jugador.nodo_despues,
      jugador.level_despues
    )}`
  })
  const resto = afectados.length > max ? `\n… y ${afectados.length - max} más` : ''

  return (
    `Este guardado cambia el punto de la misión de ${afectados.length} jugador(es):\n\n` +
    `${lineas.join('\n')}${resto}\n\n` +
    'Verán un nodo distinto del que esperaban: repetirán uno ya hecho o se saltarán otro. ' +
    '¿Guardar de todos modos?'
  )
}

function conflicto(respuesta: AdminSaveResponse | { current_revision?: string }): SaveOutcome {
  return {
    kind: 'conflict',
    message: MENSAJE_CONFLICTO,
    currentRevision: respuesta.current_revision,
  }
}

export async function runStagesSave(
  overview: AdminReactOverviewResponse,
  deps: SaveDeps
): Promise<SaveOutcome> {
  const overviewStages = overview.stages || []
  const revisionBase = overview.stages_revision || undefined

  // 1. Leer los nodos guardados. Es OBLIGATORIO: sin ellos no se puede fusionar
  //    sin perder lo que el resumen del panel no trae.
  const leidos = await deps.fetchStages()
  if (leidos.status !== 'ok' || !Array.isArray(leidos.stages)) {
    return {
      kind: 'error',
      postDone: false,
      message: `${MENSAJE_SIN_LECTURA}${leidos.message ? ` (${leidos.message})` : ''}`,
    }
  }

  // 2. Si ya se ve que alguien guardó antes, no hace falta ni intentarlo.
  if (revisionBase && leidos.stages_revision && revisionBase !== leidos.stages_revision) {
    return conflicto({ current_revision: leidos.stages_revision })
  }
  const stagesRevision = revisionBase ?? leidos.stages_revision

  // 3. Fusionar lo editado con lo guardado.
  const persisted = mergeOverviewIntoRawStages(leidos.stages, overviewStages)

  // 4. Si cambian los ids o su orden (borrar, reordenar, insertar), ensayo:
  //    el servidor dice a quién le cambia el nodo, con los niveles de AHORA.
  let guardadoYa: AdminSaveResponse | null = null

  if (stageIdSequenceChanged(leidos.stages, persisted)) {
    const ensayo = await deps.saveStages(persisted, { stagesRevision, dryRun: true })

    if (ensayo.status === 'conflict') return conflicto(ensayo)
    if (ensayo.status !== 'ok') {
      return {
        kind: 'error',
        postDone: false,
        message: `No se pudo comprobar a qué jugadores afecta el cambio, así que no se ha guardado: ${
          ensayo.message || 'sin respuesta'
        }`,
      }
    }

    if (ensayo.dry_run !== true) {
      // Un servidor que no conoce el ensayo GUARDA DE VERDAD y contesta ok sin
      // `dry_run`. Ya está guardado: no se manda otra vez.
      guardadoYa = ensayo
    } else {
      const afectados: AdminAffectedPlayer[] = Array.isArray(ensayo.afectados)
        ? ensayo.afectados
        : jugadoresDesprazadosPolGardado(leidos.stages, persisted, overview.profiles || []).map(
            (jugador) => ({
              user: jugador.id,
              display_name: jugador.display_name,
              level_antes: jugador.level,
            })
          )

      if (afectados.length > 0 && !deps.confirm(describeAffectedPlayers(afectados))) {
        return {
          kind: 'cancelled',
          message: 'Guardado cancelado: el cambio desplazaba a jugadores en curso.',
        }
      }
    }
  }

  // 5. El guardado de verdad.
  if (!guardadoYa) {
    const guardado = await deps.saveStages(persisted, { stagesRevision })
    if (guardado.status === 'conflict') return conflicto(guardado)
    if (guardado.status !== 'ok') {
      return {
        kind: 'error',
        postDone: false,
        message: guardado.message || 'El servidor no ha guardado la misión.',
      }
    }
  }

  // Guardado. A partir de aquí nada de lo que falle puede dejar al panel con ids
  // `local-...` de nodos que ya existen en el servidor.
  deps.onPosted?.(persisted)

  // 6. Releer lo guardado y la vista completa, a la vez y SIN lanzar.
  const [verificado, vista] = await Promise.all([
    deps.fetchStages().catch((): AdminStagesResponse => ({ status: 'fail' })),
    deps.fetchOverview().catch((): null => null),
  ])

  const refrescada =
    vista && vista.status === 'ok'
      ? {
          ...vista,
          stages: hydrateStagesFromRaw(
            vista.stages || [],
            verificado.status === 'ok' ? verificado.stages || [] : persisted
          ),
        }
      : null

  const nuevaRevision = refrescada?.stages_revision || verificado.stages_revision

  if (verificado.status !== 'ok') {
    return {
      kind: 'error',
      postDone: true,
      persisted,
      refreshed: refrescada,
      stagesRevision: nuevaRevision,
      message:
        'La misión SÍ se ha guardado en el servidor, pero no se ha podido comprobar' +
        `${verificado.message ? ` (${verificado.message})` : ''}. ` +
        'Recarga la misión para confirmarlo antes de seguir editando.',
    }
  }

  const desajustes = verifyPersistedStages(persisted, verificado.stages || [])
  if (desajustes.length > 0) {
    return {
      kind: 'error',
      postDone: true,
      persisted,
      refreshed: refrescada,
      stagesRevision: nuevaRevision,
      message: `El servidor no guardó exactamente lo enviado: ${desajustes.slice(0, 6).join(', ')}`,
    }
  }

  return {
    kind: 'saved',
    persisted,
    refreshed: refrescada,
    stagesRevision: nuevaRevision,
    notice: refrescada
      ? 'Guardado y verificado contra el servidor. Datos de la misión recargados.'
      : 'Guardado y verificado. No se pudo recargar la vista: pulsa Recargar cuando haya red.',
  }
}

import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'

import type { PlayerGamePayload } from '../../types/player'
import { cargarTodo } from '../offline/cargaCompleta'
import type { EstadoDeLoGuardado } from '../offline/revisiones'
import { aplicarTema } from '../../shared/tema'
import { NOTICES, type LoadState, type NoticeTone } from '../playerAppBase'

/**
 * La carga de la misión al entrar.
 *
 * Salido de `PlayerApp.tsx` (auditoría 23/10) tal cual: es el efecto que pone
 * la pantalla de carga, baja lo que falte y deja la partida en `ready` (o en
 * `error` si no hay con qué entrar). La partida sigue siendo el `useState` de
 * PlayerApp: aquí sólo llega su setter.
 */
export function useCargaDeMision({
  user,
  setState,
  setConfigRecibidaEn,
  setAvisoGuardado,
  setOfflineListo,
  initialLoadDoneRef,
  entrarIgualmenteRef,
  reintentosDeCargaRef,
  payloadRef,
  NRef,
  showNotice,
}: {
  user: string
  setState: Dispatch<SetStateAction<LoadState>>
  setConfigRecibidaEn: Dispatch<SetStateAction<number | null>>
  setAvisoGuardado: Dispatch<SetStateAction<EstadoDeLoGuardado | null>>
  setOfflineListo: Dispatch<SetStateAction<boolean | null>>
  initialLoadDoneRef: MutableRefObject<boolean>
  entrarIgualmenteRef: MutableRefObject<boolean>
  reintentosDeCargaRef: MutableRefObject<number>
  payloadRef: MutableRefObject<PlayerGamePayload | null>
  NRef: MutableRefObject<(typeof NOTICES)[keyof typeof NOTICES]>
  showNotice: (message: string, tone: NoticeTone) => void
}) {
  /**
   * La entrada: UNA comprobación de lo que tiene el móvil frente a lo último
   * publicado, parte por parte — app, misión y mapa —, y sólo se baja lo que
   * falta o ha cambiado.
   *
   * Con cobertura y algo que bajar sale la pantalla de carga, con una barra por
   * parte, y no se entra hasta tenerlo todo (o hasta pulsar «Entrar igualmente»,
   * que avisa de que no está listo para jugar sin cobertura). Si nada cambió se
   * entra en un par de segundos, sin pantalla. Sin cobertura se entra directo con
   * lo guardado, diciendo si está incompleto o viejo.
   *
   * Todo lo que se baja, se baja AQUÍ. Ya no queda nada bajando de fondo mientras
   * se juega: ni el mapa, ni la app, ni las fotos de campo.
   */
  useEffect(() => {
    let cancelled = false
    entrarIgualmenteRef.current = false

    async function run() {
      try {
        /**
         * Sin numeros falsos.
         *
         * Aqui se mandaba un progreso de 0 sobre 100, asi que la pantalla
         * enseñaba un 0% clavado mientras en realidad iba trabajando: parecia
         * colgada, sobre todo la primera vez, que es justo la que mas tarda.
         * Sin progreso la barra va en modo indeterminado, que si dice la
         * verdad: esto avanza, pero todavia no se cuanto queda.
         */
        setState({
          status: 'loading',
          mapProgress: { done: 0, total: 0, detail: 'Conectando con la misión…' },
        })

        const resultado = await cargarTodo(user, {
          modo: 'entrada',
          playerUrl: `/player/${encodeURIComponent(user)}`,
          alCambiar: (estado, detalle) => {
            if (cancelled) return
            setState({
              status: 'loading',
              mapProgress: { done: 0, total: 0, detail: detalle || 'Preparando la misión…' },
              carga: estado ?? undefined,
            })
          },
          alConocerConfig: (configConocida) => {
            // El tema, en cuanto se sabe cuál es: lo que viene después puede
            // tardar minutos la primera vez y no puede pasarse con el equivocado.
            if (!cancelled) aplicarTema(configConocida.player_theme)
          },
          cancelado: () => cancelled,
          entrarIgualmente: () => entrarIgualmenteRef.current,
          reintentos: () => reintentosDeCargaRef.current,
          payloadEnPantalla: () => payloadRef.current,
        })

        if (cancelled || !resultado.payload || !resultado.config) return

        // El tema, en cuanto se sabe cuál es (la misión pudo cambiarlo).
        aplicarTema(resultado.config.player_theme)

        setConfigRecibidaEn(resultado.configRecibidaEn)
        setAvisoGuardado(
          resultado.loGuardado && !resultado.loGuardado.todoEnOrden ? resultado.loGuardado : null
        )
        setOfflineListo(
          resultado.cobertura
            ? resultado.faltan.length === 0
            : Boolean(resultado.loGuardado?.todoEnOrden)
        )

        initialLoadDoneRef.current = true
        setState({ status: 'ready', payload: resultado.payload, config: resultado.config })

        if (resultado.entroIgualmente) {
          const textos = NRef.current
          showNotice(
            textos.entraSinTerminar(
              resultado.faltan.map((id) => textos.partesDeLaCarga[id]).join(', ')
            ),
            'warn'
          )
        }
      } catch (error) {
        // Sin cobertura y sin nada guardado no hay con qué entrar.
        const message = error instanceof Error ? error.message : 'Unknown load error'

        if (!cancelled) {
          initialLoadDoneRef.current = true
          setState({ status: 'error', message })
        }
      }
    }

    run()

    return () => {
      cancelled = true
    }
  // Mismas dependencias que en PlayerApp: lo demás son refs y setters estables.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])
}

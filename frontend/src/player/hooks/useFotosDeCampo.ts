import { useCallback, useEffect, useRef, useState } from 'react'

import { fetchFieldProofs } from '../../shared/api'
import type { FieldProof } from '../../types/player'
import {
  cacheFieldProofAssets,
  cacheFieldProofs,
  getCachedFieldProofs,
} from '../offline/fieldProofCache'
import { listarFotosPendentes } from '../offline/localFirst'

/**
 * Las fotos de campo: las que están en el servidor y las que van de camino.
 *
 * Salido de `PlayerApp.tsx`, que hacía a la vez el GPS, la sincronización, la
 * cámara, la interfaz y el arranque de los minijuegos en 2 700 líneas. En un
 * fichero así no se ve dónde acaban los hooks, y eso ya costó una caída en
 * producción: un `useRef` colocado después de un `return` temprano tiró la
 * aplicación entera con el error 310 de React.
 *
 * Aquí dentro hay dos listas y no una, y ése es el detalle que importa:
 *
 * - Las del **servidor**, que son las que han subido.
 * - Las **pendientes**, guardadas en el móvil mientras no hay cobertura.
 *
 * Se pintan las dos juntas. Sin las pendientes, el jugador hace una foto en el
 * monte, no la ve por ningún lado y da por hecho que ha fallado. Y en cuanto
 * una sube hay que quitarla de la lista de pendientes en el acto, o se queda
 * contada dos veces —«fotos de campo 1/2», la misma foto repetida.
 */
export function useFotosDeCampo(user: string) {
  const [delServidor, setDelServidor] = useState<FieldProof[]>([])
  const [pendientes, setPendientes] = useState<FieldProof[]>([])

  const repasarPendientes = useCallback(async (quen: string) => {
    const guardadas = await listarFotosPendentes(quen).catch(() => [])

    setPendientes(
      guardadas.map((f) => ({
        id: f.id,
        user: quen,
        stage_id: f.stage_id,
        stage_title: f.stage_title,
        lat: f.lat,
        lon: f.lon,
        note: f.note,
        image_url: f.image_data_url,
        created_at: Date.now(),
        status: 'subindo',
      }))
    )
  }, [])

  const refrescar = useCallback(async () => {
    const payload = await fetchFieldProofs(user)
    setDelServidor(Array.isArray(payload.proofs) ? payload.proofs : [])
    // Las que ya subieron se borran del almacén local, así que esto las quita
    // de pendientes sin tener que emparejarlas con nada.
    void repasarPendientes(user)
    return payload
  }, [user, repasarPendientes])

  // Quien llama necesita poder refrescar desde sitios que se declaran antes.
  const refrescarRef = useRef(refrescar)
  refrescarRef.current = refrescar

  useEffect(() => {
    let cancelado = false
    let intervalo: number | null = null

    async function cargar() {
      // Con la pantalla apagada no se piden: son fotos que nadie está mirando,
      // y en una ruta de tres horas eso son 240 peticiones por hora tiradas.
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        return
      }

      try {
        const payload = await fetchFieldProofs(user)
        const fotos = Array.isArray(payload.proofs) ? payload.proofs : []

        cacheFieldProofs(user, fotos)
        void cacheFieldProofAssets(fotos)

        if (!cancelado) setDelServidor(fotos)
      } catch {
        // Sin cobertura se pintan las últimas conocidas, no una galería vacía.
        const guardadas = getCachedFieldProofs(user)
        if (!cancelado) setDelServidor(guardadas.proofs)
      }
    }

    void cargar()
    intervalo = window.setInterval(cargar, 15000)

    return () => {
      cancelado = true
      if (intervalo !== null) window.clearInterval(intervalo)
    }
  }, [user])

  /**
   * Cuando una foto guardada termina de subir, se quitan las dos listas.
   *
   * Se pintaba la copia local mientras esperaba y la del servidor cuando
   * llegaba: sin este aviso quedaban las dos a la vez.
   */
  useEffect(() => {
    function alSubir() {
      void repasarPendientes(user)
      void refrescarRef.current()
    }

    window.addEventListener('saga:foto-subida', alSubir)
    return () => window.removeEventListener('saga:foto-subida', alSubir)
  }, [user, repasarPendientes])

  return {
    /** Lo que se pinta: primero lo que va de camino, después lo que ya subió. */
    todas: [...pendientes, ...delServidor],
    delServidor,
    pendientes,
    setDelServidor,
    repasarPendientes,
    refrescar,
  }
}

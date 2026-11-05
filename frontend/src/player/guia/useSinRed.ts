import { useEffect, useState } from 'react'
import { getOfflineMissionSummary } from '../offline/missionPack'
import { loadOfflineSnapshot } from '../offline/localFirst'
import { sinCoberturaAhora } from '../offline/redEstado'

/**
 * ¿Hay red, y cuántos avances esperan a subir? Para la Guía (estado «sin red»).
 *
 * «Sin red» es `sinCoberturaAhora` (lo que dijeron las últimas peticiones, no sólo el icono). Los pendientes, la
 * misma cuenta que «Avanzado: guardar y sincronizar» (MissionPackPanel), y sólo se leen SIN red: con red suben solos
 * en segundos y la Guía no tiene nada que decir de ellos.
 */
export function useSinRed(user: string): { enLinea: boolean; pendientes: number } {
  const [estado, setEstado] = useState({ enLinea: true, pendientes: 0 })

  useEffect(() => {
    let vivo = true
    const mirar = async () => {
      if (!sinCoberturaAhora()) {
        if (vivo)
          setEstado((p) => (p.enLinea && p.pendientes === 0 ? p : { enLinea: true, pendientes: 0 }))
        return
      }
      let enCola = 0
      try {
        enCola = loadOfflineSnapshot(user).queued_events.length
      } catch {
        enCola = 0
      }
      const resumen = await getOfflineMissionSummary(user).catch(() => null)
      const pendientes = enCola + (resumen?.pendingEvents || 0)
      if (vivo)
        setEstado((p) =>
          !p.enLinea && p.pendientes === pendientes ? p : { enLinea: false, pendientes }
        )
    }
    const alCambiar = () => void mirar()
    void mirar()
    const id = window.setInterval(alCambiar, 5000)
    window.addEventListener('online', alCambiar)
    window.addEventListener('offline', alCambiar)
    return () => {
      vivo = false
      window.clearInterval(id)
      window.removeEventListener('online', alCambiar)
      window.removeEventListener('offline', alCambiar)
    }
  }, [user])

  return estado
}

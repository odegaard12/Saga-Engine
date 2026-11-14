import { useEffect, useState } from 'react'
import { contarAvancesPendentes } from '../offline/missionPack'
import { loadOfflineSnapshot } from '../offline/localFirst'
import { sinCoberturaAhora } from '../offline/redEstado'
import { cadaMientrasVisible } from '../../shared/cadaMientrasVisible'

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
        enCola = loadOfflineSnapshot(user).queued_events.filter((evento) => evento.type === 'node_completed').length
      } catch {
        enCola = 0
      }
      // 13/11 (auditoría de batería): sólo la cola. `getOfflineMissionSummary` leía el paquete ENTERO de la misión
      // (200-500 KB con fotos) cada 5 s, justo sin cobertura, para usar un solo número: los eventos pendientes.
      // 14/11: sólo los avances de NODO, como el chip de cobertura («1 avance esperando» frente a «3 avances esperan»:
      // esta cuenta incluía también aperturas y posiciones, que suben cuando les toca y no son noticia).
      const enIndexedDb = await contarAvancesPendentes(user).catch(() => 0)
      const pendientes = enCola + enIndexedDb
      if (vivo)
        setEstado((p) =>
          !p.enLinea && p.pendientes === pendientes ? p : { enLinea: false, pendientes }
        )
    }
    const alCambiar = () => void mirar()
    void mirar()
    const parar = cadaMientrasVisible(alCambiar, 5000)
    window.addEventListener('online', alCambiar)
    window.addEventListener('offline', alCambiar)
    return () => {
      vivo = false
      parar()
      window.removeEventListener('online', alCambiar)
      window.removeEventListener('offline', alCambiar)
    }
  }, [user])

  return estado
}

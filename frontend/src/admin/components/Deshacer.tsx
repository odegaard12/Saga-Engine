import { useEffect, useState } from 'react'
import { descartarOperacion, estaRetenida, type Operacion } from '../lib/accionesDeJugador'

/** Reloj de medio segundo mientras haya algo con cuenta atrás (no gasta nada si no). */
function useAhora(activo: boolean): number {
  const [ahora, setAhora] = useState(() => Date.now())
  useEffect(() => {
    if (!activo) return
    setAhora(Date.now())
    const reloj = setInterval(() => setAhora(Date.now()), 500)
    return () => clearInterval(reloj)
  }, [activo])
  return ahora
}

/**
 * «Deshacer» de los toques rápidos (+1 min, +30 s): la acción ya está en la cola pero no se envía hasta pasados unos
 * segundos; hasta entonces se puede quitar y no ha pasado nada. `jugador` limita la lista a uno (la ficha).
 */
export default function Deshacer({
  pendientes,
  jugador,
  nombreDe,
}: {
  pendientes: Operacion[]
  jugador?: string
  nombreDe?: (id: string) => string
}) {
  const retenidas = pendientes.filter((o) => (!jugador || o.profileId === jugador) && estaRetenida(o))
  const ahora = useAhora(retenidas.length > 0)
  if (retenidas.length === 0) return null
  return (
    <>
      {retenidas.map((op) => {
        const quedan = Math.max(0, Math.ceil(((op.retenerHastaMs || 0) - ahora) / 1000))
        const quien = !jugador && nombreDe ? `${nombreDe(op.profileId)}: ` : ''
        return (
          <div key={op.opId} className="r8-deshacer" role="status">
            <span>
              {quien}
              {op.etiqueta} · {quedan > 0 ? `se envía en ${quedan} s` : 'enviando…'}
            </span>
            <button type="button" onClick={() => descartarOperacion(op.opId)}>
              Deshacer
            </button>
          </div>
        )
      })}
    </>
  )
}

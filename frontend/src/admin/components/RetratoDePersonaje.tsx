import { useEffect, useState } from 'react'
import { aspectoDe, MX_NOMBRES, type MxId } from '../../player/avatares3d/mixamo/catalogo'
import { urlDeCara } from '../../player/avatares3d/mixamo/rutas'

/**
 * El personaje 3D de cada jugador en el panel: su cara redonda junto a la foto, con el nombre del personaje al pasar
 * por encima. Sale de la misma ficha que ve el móvil (`/api/config`, con el aspecto ya resuelto: el elegido, el de la
 * versión 2D o el que le toca por su id), pedida una vez para todo el panel.
 */
let pedido: Promise<Map<string, MxId>> | null = null

function personajes(): Promise<Map<string, MxId>> {
  pedido ??= fetch('/api/config', { credentials: 'include' })
    .then((r) => (r.ok ? r.json() : {}))
    .then((cfg: { player_profiles?: { id?: string }[] }) => {
      const m = new Map<string, MxId>()
      for (const p of cfg.player_profiles ?? []) if (p.id) m.set(String(p.id), aspectoDe(p).mx)
      return m
    })
    .catch(() => {
      pedido = null
      return new Map<string, MxId>()
    })
  return pedido
}

export function RetratoDePersonaje({ jugadorId, lado = 30 }: { jugadorId: string; lado?: number }) {
  const [mx, setMx] = useState<MxId | null>(null)
  useEffect(() => {
    let vivo = true
    // Si el jugador aún no está en la misión guardada, el que le tocaría por su id (lo mismo que verá el móvil).
    void personajes().then(
      (m) => vivo && setMx(m.get(jugadorId) ?? aspectoDe({ id: jugadorId }).mx)
    )
    return () => {
      vivo = false
    }
  }, [jugadorId])
  const url = mx ? urlDeCara(mx) : null
  if (!mx || !url) return null
  return (
    <img
      src={url}
      alt={`Personaje: ${MX_NOMBRES[mx]}`}
      title={`Personaje: ${MX_NOMBRES[mx]}`}
      width={lado}
      height={lado}
      loading="lazy"
      style={{
        width: lado,
        height: lado,
        borderRadius: '50%',
        objectFit: 'cover',
        background: '#dfe7ee',
        border: '2px solid rgba(255,255,255,0.85)',
        boxShadow: '0 2px 6px rgba(15,23,42,0.25)',
        flex: '0 0 auto',
      }}
    />
  )
}

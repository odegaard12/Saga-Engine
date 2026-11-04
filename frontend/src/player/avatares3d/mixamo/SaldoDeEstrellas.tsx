import { useEffect, useState } from 'react'
import { EVENTO_DESBLOQUEOS, leerCopia, type Desbloqueos } from './desbloqueosTienda'

/**
 * «★ N» sobre el botón de la tienda del mapa (2/11, a petición de Óscar: «dónde se ve el saldo»).
 *
 * Sólo lee: la copia del móvil y lo que llega por EVENTO_DESBLOQUEOS (lo pide AvisoDeDesbloqueo al arrancar y tras cada
 * nodo). Si el vestuario desbloqueable está apagado o no hay precios, no pinta nada. El saldo en 0 también se ve
 * («★ 0»: ahí el jugador entiende que las estrellas existen).
 */
export function saldoVisible(d: Desbloqueos | null | undefined): number | null {
  if (!d?.activos || Object.keys(d.estrellas?.precios ?? {}).length === 0) return null
  return Math.max(0, d.estrellas?.saldo ?? 0)
}

export function SaldoDeEstrellas({ usuario }: { usuario: string }) {
  const [datos, setDatos] = useState<Desbloqueos | null>(() => (usuario ? leerCopia(usuario) : null))
  useEffect(() => {
    setDatos(usuario ? leerCopia(usuario) : null)
    const alLlegar = (ev: Event) => {
      const d = (ev as CustomEvent<Desbloqueos>).detail
      if (d) setDatos(d)
    }
    window.addEventListener(EVENTO_DESBLOQUEOS, alLlegar)
    return () => window.removeEventListener(EVENTO_DESBLOQUEOS, alLlegar)
  }, [usuario])
  const saldo = saldoVisible(datos)
  if (saldo === null) return null
  return (
    <span
      aria-hidden="true"
      data-saga-saldo-estrellas=""
      style={{
        position: 'absolute',
        top: -8,
        left: '50%',
        transform: 'translateX(-50%)',
        padding: '1px 7px',
        borderRadius: 999,
        background: '#facc15',
        color: '#1c1400',
        font: '800 11px/1.3 system-ui, sans-serif',
        boxShadow: '0 2px 6px rgba(0, 0, 0, 0.4)',
        pointerEvents: 'none',
        whiteSpace: 'nowrap',
      }}
    >
      ★ {saldo}
    </span>
  )
}

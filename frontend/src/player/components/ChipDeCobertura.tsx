import { useEffect, useState, type CSSProperties } from 'react'
import { useI18n } from '../../i18n/useI18n'
import { contarAvancesPendentes } from '../offline/missionPack'
import { sinCoberturaAhora } from '../offline/redEstado'
import { estadoDeCobertura, TEXTOS_DE_COBERTURA, type EstadoDeCobertura } from '../offline/estadoDeCobertura'
import { pizarra } from './PlayerShell'

/**
 * Un chip bajo el del tiempo que sólo aparece cuando hace falta: sin cobertura, o con avances de nodo esperando en el móvil.
 * Lee el estado de red y la cola que ya existen; no hace ninguna petición. Se refresca cada 6 s mientras la página
 * está a la vista y al cambiar online/offline.
 */
export function ChipDeCobertura({ user, mobile }: { user: string; mobile: boolean }) {
  const { locale } = useI18n()
  const tx = TEXTOS_DE_COBERTURA[locale === 'gl' || locale === 'en' ? locale : 'es']
  const [estado, setEstado] = useState<EstadoDeCobertura | null>(null)

  useEffect(() => {
    let vivo = true
    const leer = async () => {
      if (document.visibilityState === 'hidden') return
      // Sólo los avances de nodo: lo demás de la cola (aperturas, posiciones) sube cuando le toca y no es noticia.
      const n = await contarAvancesPendentes(user).catch(() => 0)
      if (!vivo) return
      const nuevo = estadoDeCobertura(sinCoberturaAhora(), n)
      setEstado((previo) => (previo?.tipo === nuevo?.tipo && previo?.n === nuevo?.n ? previo : nuevo))
    }
    void leer()
    const id = window.setInterval(() => void leer(), 6000)
    const alCambiar = () => void leer()
    window.addEventListener('online', alCambiar)
    window.addEventListener('offline', alCambiar)
    document.addEventListener('visibilitychange', alCambiar)
    return () => {
      vivo = false
      window.clearInterval(id)
      window.removeEventListener('online', alCambiar)
      window.removeEventListener('offline', alCambiar)
      document.removeEventListener('visibilitychange', alCambiar)
    }
  }, [user])

  if (!estado) return null
  const texto = estado.tipo === 'sin_red' ? tx.sinRed : estado.tipo === 'esperando' ? tx.esperando(estado.n) : tx.sincronizando(estado.n)
  const punto = estado.tipo === 'sincronizando' ? 'rgb(var(--theme-info))' : AMBAR
  return (
    <div role="status" aria-live="polite" data-cobertura={estado.tipo} style={chip(mobile)}>
      <i style={{ ...puntoBase, background: punto }} aria-hidden="true" />
      {texto}
    </div>
  )
}

const AMBAR = '#fbbf24' // no-tema: ámbar = aviso (D1: verde sólo «hecho», rojo sólo error)
const puntoBase: CSSProperties = { width: 8, height: 8, borderRadius: 999, flex: 'none' }

function chip(mobile: boolean): CSSProperties {
  return {
    position: 'fixed',
    right: mobile ? 20 : 16,
    // Debajo del chip del tiempo (78 + 30 + 6), y del reloj de la pegatina si se ve.
    top: 'calc(max(env(safe-area-inset-top) + 114px, var(--saga-reloj-qr-bajo, 0px) + 44px))',
    zIndex: 600,
    boxSizing: 'border-box',
    maxWidth: 'calc(100% - 40px)',
    minHeight: 26,
    display: 'flex',
    alignItems: 'center',
    gap: 7,
    padding: '5px 11px',
    borderRadius: 'var(--saga-radio-pildora)',
    fontSize: 'var(--saga-texto-xs)',
    fontWeight: 700,
    lineHeight: 1.2,
    color: '#f8fafc',
    background: pizarra.background,
    border: pizarra.border,
    boxShadow: 'var(--saga-sombra-1)',
    pointerEvents: 'none',
  }
}

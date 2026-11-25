import { useEffect, useState, type CSSProperties } from 'react'
import { useI18n } from '../../i18n/useI18n'
import { cadaMientrasVisible } from '../../shared/cadaMientrasVisible'
import { contarAvancesPendentes } from '../offline/cola'
import { accesoHaCaducado, perfilNoExiste, sinRedAhora, VENTANA_SIN_RED_LARGA_MS } from '../offline/redEstado'
import { estadoDeCobertura, TEXTOS_DE_COBERTURA, type EstadoDeCobertura } from '../offline/estadoDeCobertura'
import { EVENTO_AJUSTE_DEL_PANEL } from '../offline/cambiosDelPanel'
import { pizarra } from './PlayerShell'
import { usePresencia, useValorCongelado } from '../ui/movimiento'

/**
 * Un chip bajo el del tiempo que sólo aparece cuando hace falta: sin cobertura, o con avances de nodo esperando en el móvil.
 * Lee el estado de red y la cola que ya existen; no hace ninguna petición. Se refresca cada 6 s mientras la página
 * está a la vista y al cambiar online/offline.
 */
export function ChipDeCobertura({ user, mobile }: { user: string; mobile: boolean }) {
  const { locale } = useI18n()
  const tx = TEXTOS_DE_COBERTURA[locale]
  const [estado, setEstado] = useState<EstadoDeCobertura | null>(null)
  // 24/11: «El organizador ha ajustado tu partida», 5 s, en este mismo hueco (el freno lo pone quien lo lanza).
  const [ajuste, setAjuste] = useState(false)

  useEffect(() => {
    let quitar = 0
    const alAjuste = () => {
      setAjuste(true)
      window.clearTimeout(quitar)
      quitar = window.setTimeout(() => setAjuste(false), 5000)
    }
    window.addEventListener(EVENTO_AJUSTE_DEL_PANEL, alAjuste)
    return () => {
      window.removeEventListener(EVENTO_AJUSTE_DEL_PANEL, alAjuste)
      window.clearTimeout(quitar)
    }
  }, [])

  useEffect(() => {
    let vivo = true
    const leer = async () => {
      if (document.visibilityState === 'hidden') return
      // Sólo los avances de nodo: lo demás de la cola (aperturas, posiciones) sube cuando le toca y no es noticia.
      const n = await contarAvancesPendentes(user).catch(() => 0)
      if (!vivo) return
      const nuevo = estadoDeCobertura(sinRedAhora(VENTANA_SIN_RED_LARGA_MS), n, accesoHaCaducado(), perfilNoExiste())
      setEstado((previo) => (previo?.tipo === nuevo?.tipo && previo?.n === nuevo?.n ? previo : nuevo))
    }
    void leer()
    // 14/11: sin pantalla no se sondea; al volver `cadaMientrasVisible` lee al momento (ya no hace falta `visibilitychange`).
    const parar = cadaMientrasVisible(() => void leer(), 6000)
    const alCambiar = () => void leer()
    window.addEventListener('online', alCambiar)
    window.addEventListener('offline', alCambiar)
    return () => {
      vivo = false
      parar()
      window.removeEventListener('online', alCambiar)
      window.removeEventListener('offline', alCambiar)
    }
  }, [user])

  // 21/11: entra y sale con `.saga-aviso` (al volver la cobertura se borraba en seco); mientras sale, el último texto.
  // Lo de la red manda: el aviso del organizador sólo ocupa el hueco si está libre.
  // Siempre el MISMO objeto: con uno nuevo en cada pintada, `useValorCongelado` repintaba sin fin y tumbaba la app.
  const mostrado: EstadoDeCobertura | null = estado ?? (ajuste ? AJUSTE_DEL_PANEL : null)
  const presencia = usePresencia(Boolean(mostrado))
  const visto = useValorCongelado(mostrado, Boolean(mostrado))
  if (!presencia.montada || !visto) return null
  const texto =
    visto.tipo === 'sin_red'
      ? tx.sinRed
      : visto.tipo === 'esperando'
        ? tx.esperando(visto.n)
        : visto.tipo === 'acceso_caducado'
          ? tx.accesoCaducado
          : visto.tipo === 'perfil_inexistente'
            ? tx.perfilInexistente
            : visto.tipo === 'ajuste_panel'
              ? tx.ajustePanel
              : tx.sincronizando(visto.n)
  const punto = visto.tipo === 'sincronizando' || visto.tipo === 'ajuste_panel' ? 'rgb(var(--theme-info))' : AMBAR
  return (
    <div
      className="saga-aviso"
      data-estado={presencia.estado}
      data-animando={presencia.animando ? 'true' : 'false'}
      onTransitionEnd={presencia.alTerminar}
      role="status"
      aria-live="polite"
      data-cobertura={visto.tipo}
      title={texto}
      style={chip(mobile)}
    >
      <i style={{ ...puntoBase, background: punto }} aria-hidden="true" />
      {texto}
    </div>
  )
}

const AJUSTE_DEL_PANEL: EstadoDeCobertura = { tipo: 'ajuste_panel', n: 0 }
const AMBAR ='#fbbf24' // no-tema: ámbar = aviso (D1: verde sólo «hecho», rojo sólo error)
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
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  }
}

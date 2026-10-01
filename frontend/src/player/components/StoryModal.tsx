import { useEffect, useRef, useState } from 'react'
import { renderMarkdown } from '../utils/formatMarkdown'
import { usePresencia } from '../ui/movimiento'
import { useCubreElMapa } from '../hooks/useCubreElMapa'

interface StoryModalProps {
  title: string
  subtitle?: string
  body: string
  buttonText: string
  onClose: () => void
}

/**
 * Tarjeta flotante sobre el fondo difuminado -diseno "B", aprobado.
 *
 * Antes: pantalla completa solida, sin tarjeta. Ahora la historia vive en su
 * propia tarjeta de color plano, con el mapa detras desenfocado: sigue
 * tapando lo de debajo -que es lo que hay que hacer con un momento de
 * historia- pero se ve que hay un juego esperando detras.
 *
 * Mismo lenguaje exacto que "antes de salir", la mochila y las herramientas:
 * `--theme-card` de fondo, esquina 18, sombra del tema, kicker en naranja,
 * titulo grande y boton solido con texto oscuro.
 */
export function StoryModal({ title, subtitle, body, buttonText, onClose }: StoryModalProps) {
  // Mientras está en pantalla (se monta sólo cuando toca) tapa el mapa entero.
  useCubreElMapa(true)

  /**
   * Entra y SALE con el mismo movimiento que el resto de paneles.
   *
   * El padre la monta y la desmonta (`{showPrologue && <StoryModal/>}`), o sea
   * que al pulsar el boton desaparecia de golpe. Ahora el boton solo pide
   * cerrar: la tarjeta se va con su transicion y `onClose` se llama cuando el
   * navegador avisa de que termino, que es cuando el padre la puede quitar.
   */
  const [cerrando, setCerrando] = useState(false)
  const presencia = usePresencia(!cerrando)
  // UNA sola vez: `onClose` del padre cambia de identidad en cada render, y en
  // el punto de control «registrar el paso» no puede enviarse dos veces.
  const avisadoRef = useRef(false)
  useEffect(() => {
    if (!cerrando || presencia.montada || avisadoRef.current) return
    avisadoRef.current = true
    onClose()
  }, [cerrando, presencia.montada, onClose])

  if (!presencia.montada) return null

  return (
    <div
      className="saga-mov-capa"
      data-saga-anim="historia-fondo"
      data-estado={presencia.estado}
      data-animando={presencia.animando ? 'true' : 'false'}
      onTransitionEnd={presencia.alTerminar}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 16px)',
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)',
        // Fondo difuminado, no un velo fino: el prologo tapa lo de debajo
        // -ya paso una vez que se viera otro panel a traves-, pero se
        // adivina el mapa.
        background: 'rgba(var(--theme-ink-deep), .84)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        color: '#fff',
      }}
    >
      <div
        className="saga-mov-tarjeta"
        data-saga-anim="historia-tarjeta"
        data-estado={presencia.estado}
        data-animando={presencia.animando ? 'true' : 'false'}
        style={{
          width: '100%',
          maxWidth: 460,
          maxHeight: '100%',
          background: 'var(--theme-card)',
          borderRadius: 18,
          boxShadow: 'var(--theme-card-shadow)',
          padding: '22px 19px 19px',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
        }}
      >
        <div
          style={{
            fontSize: 9.5,
            letterSpacing: '.18em',
            color: 'var(--theme-primary)',
            fontWeight: 900,
            textTransform: 'uppercase',
          }}
        >
          {subtitle || 'Historia'}
        </div>

        <h1
          style={{
            margin: '6px 0 14px',
            fontSize: 'clamp(21px, 5.6vw, 26px)',
            lineHeight: 1.08,
            fontWeight: 900,
            letterSpacing: '-0.025em',
            color: '#ffffff',
          }}
        >
          {title}
        </h1>

        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            fontSize: 13.5,
            color: 'rgba(255,255,255,.72)',
            lineHeight: 1.6,
            marginBottom: 18,
          }}
        >
          {renderMarkdown(body)}
        </div>

        <button
          type="button"
          disabled={cerrando}
          onClick={() => setCerrando(true)}
          style={{
            width: '100%',
            minHeight: 48,
            padding: '0 16px',
            background: 'var(--theme-primary)',
            color: 'var(--theme-card)',
            border: 0,
            borderRadius: 11,
            fontSize: 13,
            fontWeight: 900,
            letterSpacing: '.02em',
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          {buttonText}
        </button>
      </div>
    </div>
  )
}

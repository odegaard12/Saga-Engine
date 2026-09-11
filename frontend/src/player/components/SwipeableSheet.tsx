import { useRef, useState, useEffect, CSSProperties, ReactNode } from 'react'

interface SwipeableSheetProps {
  open: boolean
  onClose: () => void
  children: ReactNode
  sheetStyle?: CSSProperties
}

export function SwipeableSheet({ open, onClose, children, sheetStyle }: SwipeableSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null)

  /**
   * La hoja ahora SE CIERRA, no desaparece.
   *
   * Antes: `if (!open && offsetY === 0) return null`. Al pulsar la X o el
   * fondo, `open` pasaba a falso con el desplazamiento a cero, asi que la
   * condicion se cumplia en el mismo instante y la hoja se DESMONTABA de
   * golpe: el panel mas grande de la pantalla se esfumaba sin transicion.
   * La animacion de bajada solo existia arrastrandola con el dedo mas de
   * 100px, que es el unico camino que alguien habia probado.
   *
   * Ahora se queda montada mientras se desliza hacia abajo y se desmonta
   * cuando termina. Entra y sale por el mismo sitio.
   */
  const [montada, setMontada] = useState(open)
  const [saliendo, setSaliendo] = useState(false)

  useEffect(() => {
    if (open) {
      setMontada(true)
      setSaliendo(false)
      return undefined
    }

    if (!montada) return undefined

    setSaliendo(true)
    const id = window.setTimeout(() => {
      setMontada(false)
      setSaliendo(false)
    }, 280)
    return () => window.clearTimeout(id)
  }, [open, montada])

  if (!montada) return null

  const dynamicSheetStyle: CSSProperties = {
    ...sheet,
    ...sheetStyle,
    transform: saliendo ? 'translateY(100%)' : 'translateY(0)',
    transition: 'transform 0.28s cubic-bezier(0.32, 0.72, 0, 1)',
    // Sin la animacion de entrada mientras sale: se pisaban y la hoja daba
    // un salto hacia arriba justo antes de bajar.
    animation: saliendo ? 'none' : undefined,
  }

  return (
    <div style={overlay}>
      <div
        style={{
          ...backdrop,
          opacity: open && !saliendo ? 1 : 0,
        }}
        onClick={onClose}
      />

      <aside
        ref={sheetRef}
        // La clase ya NO la pinta el tema: su regla -brasa y esquina cortada
        // con !important- se quito al pasar esta hoja a tarjeta solida del
        // diseño "B", porque le ganaba a los estilos en linea. Se conserva
        // como gancho para poder encontrarla desde fuera (pruebas, medidas).
        className="saga-hoja"
        style={dynamicSheetStyle}
        aria-modal="true"
        role="dialog"
        onClick={(event) => event.stopPropagation()}
      >
        {/* La zona de arrastre se fue: al mover la hoja con el dedo quedaba
            mal -se despegaba a medias y volvia de golpe- y ya no aportaba
            nada, porque el boton de cerrar vuelve a verse (antes se
            escondia solo y arrastrar era la unica salida). Se cierra con la
            X o tocando fuera. De paso se recuperan los 22px que ocupaba. */}
        <div
          className="saga-sin-scrollbar"
          style={{
            flex: 1,
            overflowY: 'auto',
            // "Se desplaza hacia los datos si muevo el dedo" -en la
            // clasificación, arrastrando con el dedo el podio se corría de
            // lado-. Sin `overflowX: hidden` ni `touchAction`, iOS deja que
            // un scroll vertical arrastre tambien el contenido en horizontal
            // si algo se desborda un pixel -aqui, el podio con tres avatares
            // de tamaños distintos y separadores, justo en el borde del
            // ancho disponible-. Bloqueado en las dos direcciones a la vez.
            overflowX: 'hidden',
            touchAction: 'pan-y',
            display: 'flex',
            flexDirection: 'column',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          {children}
        </div>
      </aside>
    </div>
  )
}

const overlay: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 4100,
  display: 'flex',
  alignItems: 'flex-end',
  justifyContent: 'center',
  padding: 12,
  pointerEvents: 'none', // Let children capture events
}

// "Difumina el fondo al estar abierto": lo pedia con razon. Este fondo
// usaba `var(--theme-blur)`, y esa variable vale `none` en el tema de fuego
// -es la unica de las tres que si lo desactiva-, asi que Mochila,
// Ferramentas y Clasificacion se abrian sobre un velo oscuro SIN desenfoque
// ninguno, mientras que el prologo y "antes de salir" -que no dependen de
// esta variable- si difuminaban. Mismo valor fijo que esos dos, para que
// las cinco hojas se comporten igual sin depender de que tema este puesto.
const backdrop: CSSProperties = {
  position: 'absolute',
  inset: 0,
  background: 'rgba(var(--theme-ink-deep), .5)',
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  pointerEvents: 'auto',
  transition: 'opacity 0.3s ease',
}

const sheet: CSSProperties = {
  position: 'relative',
  zIndex: 2,
  width: 'min(100%, 520px)',
  borderRadius: 'var(--theme-radius-panel)',
  background: 'rgba(var(--theme-ink-deep), .95)',
  padding: '8px 16px calc(16px + env(safe-area-inset-bottom, 0px))',
  display: 'flex',
  flexDirection: 'column',
  maxHeight: '85vh',
  color: '#f8fafc',
  backdropFilter: 'var(--theme-blur)',
  WebkitBackdropFilter: 'var(--theme-blur)',
  pointerEvents: 'auto',
}

// Zona de arrastre para cerrar deslizando. Llevaba un tirador visual -una
// pildora blanca fija que no seguia al tema y se veia mal sobre la brasa de
// fuego-; se quito el dibujo y se dejo la zona de arrastre, que sigue
// funcionando igual.
const dragHandleWrapper: CSSProperties = {
  display: 'flex',
  justifyContent: 'center',
  padding: '10px 0 12px',
  cursor: 'grab',
}

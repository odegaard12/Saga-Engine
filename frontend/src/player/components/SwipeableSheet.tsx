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
  /**
   * TERCERA CAUSA DEL "TODO DE GOLPE": entraba sin entrar.
   *
   * Salir ya estaba resuelto, pero ENTRAR no: al montarse, `saliendo` es
   * falso, asi que el primer fotograma ya se pintaba en `translateY(0)`. La
   * hoja aparecia colocada. Mochila y Ferramentas lo disimulaban porque su
   * `sheetStyle` traia una `animation` propia (`sagaLoginRise`) -que ademas
   * peleaba con esta `transform`-, pero la Clasificacion no traia ninguna:
   * se plantaba entera, de una pieza. Ahora las tres entran igual, deslizando
   * desde abajo, con las mismas fichas de tiempo que todo lo demas.
   */
  // Arranca en `open`, no en falso: hay hojas que se montan YA abiertas
  // -quien las usa las renderiza solo cuando toca-, y con el valor falso el
  // primer fotograma ya se pintaba colocada. Naciendo fuera, entra igual
  // dandole igual si el padre la monta antes o a la vez.
  const [entrando, setEntrando] = useState(open)

  useEffect(() => {
    if (open) {
      setMontada(true)
      setSaliendo(false)
      return undefined
    }

    if (!montada) return undefined

    setSaliendo(true)
    // 220 = `--saga-motion-sale`: el temporizador que desmonta y la
    // transicion que se ve tienen que durar lo mismo, o se corta el
    // movimiento antes de acabar (o se queda un hueco despues).
    const id = window.setTimeout(() => {
      setMontada(false)
      setSaliendo(false)
    }, 220)
    return () => window.clearTimeout(id)
  }, [open, montada])

  useEffect(() => {
    if (!open) return undefined
    setEntrando(true)
    // Dos fotogramas: uno para que el navegador pinte la hoja abajo del todo
    // y otro para cambiarla de sitio. En uno solo los dos estados se funden
    // en el mismo repintado y no hay nada que animar.
    const id = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => setEntrando(false))
    })
    return () => window.cancelAnimationFrame(id)
  }, [open])

  if (!montada) return null

  const fuera = saliendo || entrando

  const dynamicSheetStyle: CSSProperties = {
    ...sheet,
    ...sheetStyle,
    transform: fuera ? 'translateY(100%)' : 'translateY(0)',
    transition: `transform ${
      saliendo ? 'var(--saga-motion-sale)' : 'var(--saga-motion-entra)'
    } var(--saga-motion-curva)`,
    // Ninguna `animation` de CSS, nunca: una animacion con fotogramas clave
    // GANA a la propiedad `transform` de la linea de arriba mientras corre, y
    // lo que se veia entonces era la animacion de quien pasase el estilo, no
    // este deslizamiento. Un solo movimiento, definido en un solo sitio.
    animation: 'none',
  }

  return (
    <div style={overlay}>
      <div
        data-saga-anim="hoja-fondo"
        style={{
          ...backdrop,
          opacity: open && !fuera ? 1 : 0,
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
  // Sin relleno: "clasificacion pegar abajo tambien sin espacio". La hoja se
  // apoya en el borde de la pantalla igual que la barra de abajo; la curva
  // se la queda solo arriba, que es donde se ve.
  padding: 0,
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
  // 20 arriba y 0 abajo, el mismo par que la barra inferior. Redondear las
  // cuatro esquinas con el borde de abajo pegado a la pantalla dejaba dos
  // muescas de fondo; `--theme-radius-panel` ademas vale 3px en el tema de
  // fuego -esquina cortada-, que aqui no es lo pedido ("dejar bordes curvos").
  borderRadius: '20px 20px 0 0',
  // Tarjeta solida del diseño "B", no un cristal teñido de tinta: es lo que
  // ya hacen la barra de abajo, el prologo y "antes de salir".
  background: 'var(--theme-card)',
  boxShadow: 'var(--theme-card-shadow)',
  padding: '0 16px calc(14px + env(safe-area-inset-bottom, 0px))',
  display: 'flex',
  flexDirection: 'column',
  maxHeight: '85dvh',
  color: '#f8fafc',
  pointerEvents: 'auto',
}


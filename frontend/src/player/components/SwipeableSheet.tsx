import { useState, type CSSProperties, type ReactNode } from 'react'
import { useCubreElMapa } from '../hooks/useCubreElMapa'
import {
  TRANSICION_FONDO_ENTRA,
  TRANSICION_FONDO_SALE,
  TRANSICION_HOJA_ENTRA,
  TRANSICION_HOJA_SALE,
  useArrastrarParaCerrar,
} from '../hooks/useArrastrarParaCerrar'
import { usePrefiereMenosMovimiento, usePresencia } from '../ui/movimiento'

interface SwipeableSheetProps {
  open: boolean
  onClose: () => void
  children: ReactNode
  sheetStyle?: CSSProperties
}

/**
 * Hoja que sube desde abajo, sigue al dedo al arrastrarla hacia abajo y baja
 * sola al cerrar. Las tres cosas con las mismas fichas de tiempo
 * (`--saga-dur-*`, `--saga-curva-*` en mobile-themes.css), y solo con
 * `transform` y `opacity`.
 *
 * Historia que conviene no repetir (cada punto costo una ronda de pruebas):
 *
 * 1. SE CIERRA, NO DESAPARECE. Antes `if (!open && offsetY === 0) return null`
 *    desmontaba la hoja en el mismo instante de pulsar la X: el panel mas
 *    grande de la pantalla se esfumaba sin transicion. Ahora se queda montada
 *    mientras baja y se desmonta cuando el navegador dice que acabo
 *    (`transitionend`); el temporizador es solo la red de seguridad. Uno igual
 *    de largo que la transicion la gana SIEMPRE -la transicion arranca un
 *    fotograma despues del cambio de estado- y desmontaba a medias: el banco
 *    midio entradas de 260 ms y salidas que no disparaban ningun evento.
 *
 * 2. ENTRAR TAMBIEN ES MOVERSE. Al montarse con el primer fotograma ya en
 *    `translateY(0)` la hoja aparecia colocada. Nace fuera (abajo) y un par de
 *    fotogramas despues se coloca. Va en `usePresencia`, que es el contrato
 *    comun a todos los paneles.
 *
 * 3. NINGUNA `animation` DE CSS. Una animacion con fotogramas clave GANA a la
 *    propiedad `transform` mientras corre, y entonces lo que se veia era la de
 *    quien pasase `sheetStyle`, no este deslizamiento.
 *
 * 4. ARRASTRAR: ver `useArrastrarParaCerrar`. Se quito una vez porque
 *    "se despegaba a medias y volvia de golpe" (un `touchmove` pasivo: el
 *    scroll y la hoja se movian a la vez). Ahora solo arrastra con el
 *    contenido arriba del todo, sin scroll a la vez, y al soltar o se cierra
 *    desde donde esta o vuelve con la curva de entrada.
 *
 * Con "reducir movimiento" la hoja no se desplaza: entra y sale con un
 * fundido.
 */
export function SwipeableSheet({ open, onClose, children, sheetStyle }: SwipeableSheetProps) {
  // La hoja lleva un fondo desenfocado que ocupa toda la pantalla: el mapa de
  // detras no necesita latir mientras este abierta (ver useCubreElMapa).
  useCubreElMapa(open)

  const reducido = usePrefiereMenosMovimiento()
  const presencia = usePresencia(open)
  const [hoja, setHoja] = useState<HTMLElement | null>(null)
  const [fondo, setFondo] = useState<HTMLElement | null>(null)

  useArrastrarParaCerrar({ hoja, fondo, activo: open, abierta: open, onClose })

  if (!presencia.montada) return null

  const saliendo = presencia.estado === 'saliendo'
  const fuera = presencia.estado !== 'abierta'

  const dynamicSheetStyle: CSSProperties = {
    ...sheet,
    ...sheetStyle,
    transform: !reducido && fuera ? 'translate3d(0, 100%, 0)' : 'translate3d(0, 0, 0)',
    opacity: reducido && fuera ? 0 : 1,
    transition: reducido
      ? `opacity ${saliendo ? 'var(--saga-motion-sale) var(--saga-curva-sale)' : 'var(--saga-dur-media) var(--saga-curva-entra)'}`
      : saliendo
        ? TRANSICION_HOJA_SALE
        : TRANSICION_HOJA_ENTRA,
    willChange: presencia.animando ? 'transform, opacity' : undefined,
    // Ninguna `animation` de CSS, nunca (punto 3).
    animation: 'none',
  }

  return (
    <div style={overlay}>
      <div
        ref={setFondo}
        data-saga-anim="hoja-fondo"
        style={{
          ...backdrop,
          opacity: open && !fuera ? 1 : 0,
          transition: saliendo ? TRANSICION_FONDO_SALE : TRANSICION_FONDO_ENTRA,
          willChange: presencia.animando ? 'opacity' : undefined,
        }}
        onClick={onClose}
      />

      <aside
        ref={setHoja}
        // La clase ya NO la pinta el tema: su regla -brasa y esquina cortada
        // con !important- se quito al pasar esta hoja a tarjeta solida del
        // diseño "B", porque le ganaba a los estilos en linea. Se conserva
        // como gancho para poder encontrarla desde fuera (pruebas, medidas).
        className="saga-hoja"
        data-estado={presencia.estado}
        style={dynamicSheetStyle}
        onTransitionEnd={presencia.alTerminar}
        aria-modal="true"
        role="dialog"
        onClick={(event) => event.stopPropagation()}
      >
        {/* Sin zona de arrastre dibujada: el gesto vale desde cualquier punto
            de la hoja con el contenido arriba del todo. Se cierra tambien con
            la X o tocando fuera. */}
        <div
          className="saga-sin-scrollbar"
          style={{
            flex: 1,
            // Sin esto, un hijo flex no encoge por debajo de su contenido
            // -es el minimo por defecto-, y entonces nunca le hace falta
            // desplazarse: crece tanto como necesite y es el padre el que
            // se pasa de alto. Con 0 aqui, el hueco disponible manda y el
            // sobrante se desplaza de verdad.
            minHeight: 0,
            overflowY: 'auto',
            // "Se desplaza hacia los datos si muevo el dedo" -en la
            // clasificación, arrastrando con el dedo el podio se corría de
            // lado-. Sin `overflowX: hidden` ni `touchAction`, iOS deja que
            // un scroll vertical arrastre tambien el contenido en horizontal
            // si algo se desborda un pixel. Bloqueado en las dos direcciones.
            overflowX: 'hidden',
            touchAction: 'pan-y',
            // Sin rebote de scroll: el tiron hacia abajo con el contenido
            // arriba es de la hoja (cerrar), no del contenido.
            overscrollBehaviorY: 'contain',
            display: 'flex',
            flexDirection: 'column',
            WebkitOverflowScrolling: 'touch',
            // El area segura va AQUI, no en la hoja: asi las filas llegan
            // hasta el borde mientras ruedas, y el margen solo aparece al
            // final del recorrido, que es donde hace falta.
            paddingBottom: 'calc(10px + env(safe-area-inset-bottom, 0px))',
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
  // Relleno de abajo CERO: se lo lleva el contenedor que rueda, ahi abajo.
  // Aqui dejaba una franja de tarjeta roja bajo el ultimo jugador -14px mas
  // los 34 del area segura del iPhone, casi 50- que no se completaba nunca
  // por mucho que deslizases, porque no era lista: era la propia tarjeta.
  padding: '0 16px 0',
  display: 'flex',
  flexDirection: 'column',
  maxHeight: '85dvh',
  color: '#f8fafc',
  pointerEvents: 'auto',
}


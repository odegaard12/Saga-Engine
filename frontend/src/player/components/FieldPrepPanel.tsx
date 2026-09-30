import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import {
  IconoBrujula,
  IconoCamara,
  IconoDescarga,
  IconoUbicacion,
} from './PlayerIcons'
import { createPortal } from 'react-dom'
import { useI18n } from '../../i18n/useI18n'
import type { PlayerGpsStatus } from '../../types/player'
import { formatearBytes } from '../offline/almacenamiento'
import type { ElementoDeLista } from '../offline/motorDeCarga'
import type { EstadoDeEspacio, FaseDePreparacion } from '../offline/usePreparacion'

export type EstadoPermiso = 'idle' | 'pidiendo' | 'ok' | 'error'

/**
 * Lo que sólo tiene sentido en «Prepararse»: el micrófono, el espacio, la guía de
 * instalar y la lista final. Sin esto el panel es el de siempre (los permisos de
 * la entrada al juego); con ello es la parte de abajo de la pantalla de carga.
 */
export interface PropsDePreparacion {
  fase: FaseDePreparacion
  permisoMicrofono: EstadoPermiso
  /** Si la ruta tiene algún reto que escucha; sin él no se pide el micrófono. */
  microfonoNecesario?: boolean
  onRequestMicrophone: () => void
  espacio: EstadoDeEspacio
  /** La lista final: App, Misión, Mapa, Permisos, Espacio. */
  lista: ElementoDeLista[]
  /** Está abierta como aplicación instalada (pantalla de inicio). */
  instalada: boolean
  onRequestStorage: () => void
  /** Pide de una vez todos los permisos que falten. */
  onPedirTodos: () => void
  onReintentar: () => void
  onCerrar: () => void
}

interface FieldPrepPanelProps {
  /** Sólo en «Prepararse». */
  preparacion?: PropsDePreparacion
  visible: boolean
  mobile: boolean
  /**
   * Incrustado dentro de la pantalla de carga, no flotando sobre el juego.
   *
   * Sin su velo propio ni su portal: la pantalla de carga YA es el fondo, y
   * poner otro encima seria oscurecer lo que ya esta oscuro. Solo la tarjeta.
   */
  incrustado?: boolean
  hasOfflineMission: boolean
  hasBrowserGps: boolean
  offlinePrepState: 'idle' | 'saving' | 'saved' | 'error'
  browserGpsStatus: PlayerGpsStatus
  onPrepareOfflinePack: () => void
  onRequestGps: () => void
  onDismiss: () => void
  /**
   * Cámara y movimiento van POR SEPARADO.
   *
   * Iban juntos en un solo estado y hacía falta que los dos saliesen bien para
   * darlo por hecho: conceder el movimiento no quitaba la fila, porque la cámara
   * había fallado, y no había forma de saber cuál faltaba.
   */
  permisoCamara: EstadoPermiso
  permisoMovimiento: EstadoPermiso
  onRequestCamera: () => void
  onRequestMotion: () => void
}

/**
 * Tarjeta de preparación antes de salir.
 *
 * Centrada y de cristal, como los minijuegos. Sólo enseña lo que falta: una fila
 * por cosa, con su botón. Lo que ya está hecho se resume abajo en una línea.
 */
/**
 * Los textos del panel, en los dos idiomas de las misiones.
 *
 * Estaban escritos a mano mezclados: unos en gallego ("Movemento", "Seguir
 * sen iso") y otros en castellano ("Lo denegaste. Ajustes del móvil ›
 * Safari"). El puente de idioma sólo pasa de gallego a castellano, así que en
 * una misión en gallego lo que estaba en castellano se quedaba así.
 */
const TEXTOS_PANEL = {
  es: {
    antetitulo: 'ANTES DE SALIR',
    todoListo: 'Todo listo',
    falta: 'Falta',
    faltan: (n: number) => `Faltan ${n} permisos`,
    listos: (a: number, b: number) => `${a} de ${b} listos`,
    misionOffline: 'Misión offline',
    paraJugarSinCobertura: 'Para jugar sin cobertura',
    descargando: 'Descargando…',
    descargar: 'Descargar',
    ubicacion: 'Ubicación',
    paraUbicacion: 'Tu flecha y la línea al siguiente nodo',
    buscando: 'Buscando…',
    permitir: 'Permitir',
    movimiento: 'Movimiento',
    paraMovimiento: 'La brújula y el laberinto',
    esperando: 'Esperando…',
    camara: 'Cámara',
    paraCamara: 'Escanear las pegatinas QR',
    listo: 'Listo',
    denegadoIos: 'Lo denegaste. Ajustes › Safari › permisos del sitio.',
    denegadoOtro: 'Lo denegaste. Toca el candado de la barra de direcciones › Permisos.',
    seguirSinEso: 'Seguir sin eso',
    microfono: 'Micrófono',
    paraMicrofono: 'Los retos que escuchan',
    microfonoNoHaceFalta: 'No hace falta en esta ruta',
    espacio: 'Espacio',
    paraEspacio: 'Que el navegador no borre lo descargado',
    proteger: 'Proteger',
    protegido: (uso: string, cuota: string) => `Datos protegidos · ${uso} de ${cuota}`,
    sinProteger: 'El navegador podría borrar los datos si va justo de espacio.',
    pocoEspacio: (libre: string) => `Queda poco espacio libre (${libre}). Libera espacio.`,
    instalarTitulo: 'Añádela a la pantalla de inicio',
    instalarCuerpo:
      'En iPhone, Safari borra los datos de una web que no está instalada si pasan 7 días sin abrirla. Toca Compartir › Añadir a pantalla de inicio y ábrela desde su icono.',
    listaFinal: 'Lista final',
    lista: {
      app: 'App',
      mision: 'Misión',
      mapa: 'Mapa',
      permisos: 'Permisos',
      espacio: 'Espacio',
    },
    pedirTodos: 'Pedir todos los permisos',
    reintentarDescarga: 'Reintentar la descarga',
    todoListoCerrar: 'Listo',
  },
  gl: {
    antetitulo: 'ANTES DE SAÍR',
    todoListo: 'Todo listo',
    falta: 'Falta',
    faltan: (n: number) => `Faltan ${n} permisos`,
    listos: (a: number, b: number) => `${a} de ${b} listos`,
    misionOffline: 'Misión offline',
    paraJugarSinCobertura: 'Para xogar sen cobertura',
    descargando: 'Descargando…',
    descargar: 'Descargar',
    ubicacion: 'Localización',
    paraUbicacion: 'A túa frecha e a liña ao seguinte nodo',
    buscando: 'Buscando…',
    permitir: 'Permitir',
    movimiento: 'Movemento',
    paraMovimiento: 'A brúxula e o labirinto',
    esperando: 'Agardando…',
    camara: 'Cámara',
    paraCamara: 'Escanear as pegatinas QR',
    listo: 'Listo',
    denegadoIos: 'Denegáchelo. Axustes › Safari › permisos do sitio.',
    denegadoOtro: 'Denegáchelo. Toca o cadeado da barra de enderezos › Permisos.',
    seguirSinEso: 'Seguir sen iso',
    microfono: 'Micrófono',
    paraMicrofono: 'Os retos que escoitan',
    microfonoNoHaceFalta: 'Non fai falta nesta ruta',
    espacio: 'Espazo',
    paraEspacio: 'Que o navegador non borre o descargado',
    proteger: 'Protexer',
    protegido: (uso: string, cuota: string) => `Datos protexidos · ${uso} de ${cuota}`,
    sinProteger: 'O navegador podería borrar os datos se vai xusto de espazo.',
    pocoEspacio: (libre: string) => `Queda pouco espazo libre (${libre}). Libera espazo.`,
    instalarTitulo: 'Engádea á pantalla de inicio',
    instalarCuerpo:
      'No iPhone, Safari borra os datos dunha web que non está instalada se pasan 7 días sen abrila. Toca Compartir › Engadir á pantalla de inicio e ábrea desde a súa icona.',
    listaFinal: 'Lista final',
    lista: {
      app: 'App',
      mision: 'Misión',
      mapa: 'Mapa',
      permisos: 'Permisos',
      espacio: 'Espazo',
    },
    pedirTodos: 'Pedir todos os permisos',
    reintentarDescarga: 'Tentar de novo a descarga',
    todoListoCerrar: 'Listo',
  },
}

/** iPhone o iPad (también el iPad que se presenta como Mac). */
function esIos(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

// Iconos de trazo, como los de PlayerIcons: aquí solo hacen falta dos más.
const trazo = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

function IconoMicro() {
  return (
    <svg width={20} height={20} {...trazo} aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0" />
      <path d="M12 18v3" />
    </svg>
  )
}

function IconoEspacio() {
  return (
    <svg width={20} height={20} {...trazo} aria-hidden="true">
      <ellipse cx="12" cy="6" rx="8" ry="3" />
      <path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6" />
      <path d="M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
    </svg>
  )
}

export function FieldPrepPanel({
  visible,
  mobile,
  incrustado = false,
  preparacion,
  hasOfflineMission,
  hasBrowserGps,
  offlinePrepState,
  browserGpsStatus,
  onPrepareOfflinePack,
  onRequestGps,
  onDismiss,
  permisoCamara,
  permisoMovimiento,
  onRequestCamera,
  onRequestMotion,
}: FieldPrepPanelProps) {
  /**
   * "Cierra de golpe sin animación" -y con razón: era `if (!visible) return
   * null`, el mismo fallo que ya se corrigió una vez en SwipeableSheet
   * (Mochila/Herramientas/Clasificación) pero que aquí, al ser un panel
   * distinto con su propio portal, no heredó el arreglo. Mismo patrón:
   * se queda montado mientras sale y se desmonta cuando termina.
   */
  const { locale } = useI18n()
  const tx = locale === 'gl' ? TEXTOS_PANEL.gl : TEXTOS_PANEL.es
  const [montado, setMontado] = useState(visible)
  const [saliendo, setSaliendo] = useState(false)

  useEffect(() => {
    if (visible) {
      setMontado(true)
      setSaliendo(false)
      return undefined
    }
    if (!montado) return undefined
    setSaliendo(true)
    // Red de seguridad, no reloj: ver la nota larga en SwipeableSheet. Un
    // temporizador que dura lo mismo que la transicion la corta siempre,
    // porque la transicion arranca un fotograma mas tarde. Quien avisa del
    // final es `onTransitionEnd`.
    const id = window.setTimeout(() => {
      setMontado(false)
      setSaliendo(false)
    }, 700)
    return () => window.clearTimeout(id)
  }, [visible, montado])

  if (!montado) return null

  /**
   * LAS CUATRO FILAS, SIEMPRE. Lo que cambia es su estado.
   *
   * Antes solo se pintaban las que faltaban, y la lista encogia sola segun
   * iban resolviendose: se abria con cuatro y a los pocos segundos quedaban
   * dos, con la tarjeta pegando un salto y el boton de abajo cambiandose de
   * sitio bajo el dedo. "Primero salen 4 pero luego quedan 2, es bruto."
   *
   * Con las cuatro puestas desde el primer fotograma no hay salto ninguno:
   * la altura de la tarjeta es la misma todo el rato y cada fila cambia su
   * boton por un visto cuando le toca. Ademas se ve lo que YA esta hecho,
   * que antes se resumia en unas etiquetas sueltas al final.
   */
  type Fila = {
    clave: string
    icono: ReactNode
    que: string
    para: string
    etiqueta: string
    accion: () => void
    ocupado: boolean
    fallo: boolean
    hecho: boolean
    /** Lo que se lee cuando está hecha, si no es el «Listo» de siempre. */
    textoHecho?: string
    /** Lo que se lee cuando falló, si no es el «lo denegaste» de los permisos. */
    textoFallo?: string
  }

  const filas: Fila[] = []

  // En «Prepararse» la descarga de la misión es la pantalla de carga de arriba,
  // con sus tres barras: la fila «Misión offline» sobraría y diría lo mismo dos veces.
  if (!preparacion) {
    filas.push({
      hecho: hasOfflineMission,
      clave: 'mision',
      icono: <IconoDescarga />,
      que: tx.misionOffline,
      para: tx.paraJugarSinCobertura,
      etiqueta: offlinePrepState === 'saving' ? tx.descargando : tx.descargar,
      accion: onPrepareOfflinePack,
      ocupado: offlinePrepState === 'saving',
      fallo: offlinePrepState === 'error',
    })
  }

  {
    filas.push({
      hecho: hasBrowserGps,
      clave: 'gps',
      icono: <IconoUbicacion />,
      que: tx.ubicacion,
      para: tx.paraUbicacion,
      etiqueta: browserGpsStatus === 'searching' ? tx.buscando : tx.permitir,
      accion: onRequestGps,
      ocupado: browserGpsStatus === 'searching',
      fallo: browserGpsStatus === 'error',
    })
  }

  /**
   * Cámara y movimiento, cada uno con su fila y su botón.
   *
   * Se probó a juntarlos en un botón y salió mal: como el estado de fallo miraba
   * los dos a la vez, conceder uno y que fallase el otro dejaba la fila diciendo
   * "lo denegaste" encima de un permiso que acababas de dar. Son dos avisos
   * distintos del sistema y tienen que verse como dos cosas distintas.
   */
  {
    filas.push({
      hecho: permisoMovimiento === 'ok',
      clave: 'movimiento',
      icono: <IconoBrujula />,
      que: tx.movimiento,
      para: tx.paraMovimiento,
      etiqueta: permisoMovimiento === 'pidiendo' ? tx.esperando : tx.permitir,
      accion: onRequestMotion,
      ocupado: permisoMovimiento === 'pidiendo',
      fallo: permisoMovimiento === 'error',
    })
  }

  {
    filas.push({
      hecho: permisoCamara === 'ok',
      clave: 'camara',
      icono: <IconoCamara />,
      que: tx.camara,
      para: tx.paraCamara,
      etiqueta: permisoCamara === 'pidiendo' ? tx.esperando : tx.permitir,
      accion: onRequestCamera,
      ocupado: permisoCamara === 'pidiendo',
      fallo: permisoCamara === 'error',
    })
  }

  /**
   * Micrófono y espacio: SÓLO en «Prepararse».
   *
   * El micrófono no se pedía en ningún sitio antes de salir — el reto que escucha
   * lo pedía en pleno nodo, con el cronómetro corriendo—. Y el espacio persistente
   * es lo que evita que el navegador borre lo descargado si va justo, que en
   * iPhone pasa a los siete días sin abrir una web que no esté instalada.
   */
  if (preparacion) {
    const microNecesario = preparacion.microfonoNecesario !== false
    filas.push({
      // Sin retos que escuchen no hay nada que pedir: se ve la fila, marcada, con el motivo.
      hecho: !microNecesario || preparacion.permisoMicrofono === 'ok',
      textoHecho: microNecesario ? undefined : tx.microfonoNoHaceFalta,
      clave: 'microfono',
      icono: <IconoMicro />,
      que: tx.microfono,
      para: tx.paraMicrofono,
      etiqueta: preparacion.permisoMicrofono === 'pidiendo' ? tx.esperando : tx.permitir,
      accion: preparacion.onRequestMicrophone,
      ocupado: preparacion.permisoMicrofono === 'pidiendo',
      fallo: preparacion.permisoMicrofono === 'error',
    })

    const espacio = preparacion.espacio
    const protegido = espacio.persistente === true
    const poco = espacio.nivel === 'justo'
    filas.push({
      // Protegido, o el navegador no sabe protegerlo y hay sitio de sobra.
      hecho: espacio.fase === 'hecho' && !poco && (protegido || espacio.resultado === 'no_soportado'),
      clave: 'espacio',
      icono: <IconoEspacio />,
      que: tx.espacio,
      para: poco
        ? tx.pocoEspacio(formatearBytes(espacio.libreBytes))
        : espacio.fase === 'hecho' && !protegido && espacio.resultado !== 'no_soportado'
          ? tx.sinProteger
          : tx.paraEspacio,
      etiqueta: espacio.fase === 'pidiendo' ? tx.esperando : tx.proteger,
      accion: preparacion.onRequestStorage,
      ocupado: espacio.fase === 'pidiendo',
      fallo: (espacio.fase === 'hecho' && !protegido && espacio.resultado !== 'no_soportado') || poco,
      textoHecho: tx.protegido(formatearBytes(espacio.usoBytes), formatearBytes(espacio.cuotaBytes)),
      textoFallo: poco
        ? tx.pocoEspacio(formatearBytes(espacio.libreBytes))
        : tx.sinProteger,
    })
  }

  const pendientes = filas.filter((f) => !f.hecho)
  const listos = filas.filter((f) => f.hecho)

  // El consejo de instalar sólo importa en iPhone y sólo si aún no está instalada.
  const aconsejarInstalar = Boolean(preparacion) && !preparacion?.instalada && esIos()

  /**
   * El panel se saca al final del documento.
   *
   * Subirle la capa no bastaba: vive dentro del armazon del juego, y ahi hay
   * contenedores con `transform` y `backdrop-filter`. Cualquiera de los dos
   * crea un contexto de apilamiento propio, y dentro de el da igual que pongas
   * 7000 o un millon: la barra de abajo y la clasificacion, que estan FUERA,
   * siguen dibujandose por encima. Sacandolo a document.body deja de tener
   * ancestros que lo encierren.
   */
  /**
   * SEGUNDA CAUSA DEL "SALE DE GOLPE", y esta se ve leyendo el estilo.
   *
   * La tarjeta SI tenia entrada (`sagaPanelEntra`). El fondo NO: `opacity:
   * saliendo ? 0 : 1` vale 1 desde el primer fotograma, y una `transition`
   * sin cambio de valor no transiciona nada. O sea que al abrirse este panel
   * la pantalla entera se oscurecia y se desenfocaba DE UN TIRON -que es lo
   * que se ve, porque ocupa todo- mientras la tarjetita del medio hacia su
   * animacion de 260ms que nadie llegaba a mirar.
   *
   * Ahora el fondo tambien entra, con la misma curva y el mismo tiempo.
   */
  const capaDinamica: CSSProperties = {
    ...capa,
    opacity: saliendo ? 0 : 1,
    animation: saliendo
      ? 'none'
      : 'sagaCapaEntra var(--saga-motion-entra) var(--saga-motion-curva)',
  }

  const cuerpo = (
    <>
        {/* El titulo DICE QUE FALTA, no cuantas cosas faltan.
            "Falta un permiso" obligaba a bajar la vista para saber cual;
            con el nombre delante se resuelve sin leer mas. El recuento va
            debajo en texto pequeño, que es su sitio: es el detalle. */}
        <header style={cabecera}>
          <div style={{ minWidth: 0 }}>
            <div style={antetitulo}>{tx.antetitulo}</div>
            <strong style={titulo}>
              {pendientes.length === 0
                ? tx.todoListo
                : pendientes.length === 1
                  ? `${tx.falta} ${pendientes[0].que.toLowerCase()}`
                  : tx.faltan(pendientes.length)}
            </strong>
            <div style={recuento}>
              {tx.listos(listos.length, listos.length + pendientes.length)}
            </div>
          </div>

          {/* Cierra siempre, pase lo que pase con los permisos. Salvo dentro
              de la pantalla de carga: alli no hay nada detras que descubrir
              -la X y "Seguir sen iso" harian lo mismo, y dos salidas para lo
              mismo en la esquina de una tarjeta es ruido-. */}
          {incrustado ? null : (
            <button type="button" style={cerrar} onClick={onDismiss} aria-label="Cerrar">
              ×
            </button>
          )}
        </header>

        {/* Filas sin caja: icono, texto y botón entre dos líneas finas.
            Antes cada fila era un recuadro de cristal DENTRO de la tarjeta de
            cristal -recuadro dentro de recuadro, lo mismo que ensuciaba el
            login-, y el texto de apoyo iba a 10.5px, ilegible en el monte. */}
        {filas.map((f) => (
          <div key={f.clave} style={fila}>
            <span style={{ ...icono, color: f.hecho ? VERDE_HECHO : 'var(--theme-primary)' }}>
              {f.icono}
            </span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ ...queEs, opacity: f.hecho ? 0.55 : 1 }}>{f.que}</div>
              <div
                style={{
                  ...paraQue,
                  ...(f.fallo && !f.hecho ? falloTexto : null),
                  opacity: f.hecho ? 0.45 : 1,
                }}
              >
                {f.hecho
                  ? (f.textoHecho ?? tx.listo)
                  : f.fallo
                    ? (f.textoFallo ??
                      (esIos() ? tx.denegadoIos : tx.denegadoOtro))
                    : f.para}
              </div>
            </div>
            {/**
             * Un visto cuando esta hecho, su boton cuando no.
             *
             * Ocupan el mismo hueco a proposito: asi conceder un permiso no
             * mueve nada de sitio. Antes la fila entera desaparecia y la
             * tarjeta encogia de golpe con el dedo todavia encima.
             */}
            {f.hecho ? (
              <span style={vistoFila} aria-label={tx.listo}>
                ✓
              </span>
            ) : (
              <button type="button" style={boton} disabled={f.ocupado} onClick={f.accion}>
                {f.etiqueta}
              </button>
            )}
          </div>
        ))}

        {/**
         * Dos botones, y en este orden -opcion "C", elegida por Oscar.
         *
         * Antes la jerarquia estaba del reves: "Permitir" era un boton
         * pequeño dentro de la fila, y el boton GRANDE de la tarjeta era
         * "Volver a bajar el mapa", que casi no se usa. Lo que hay que
         * pulsar tiene que ser lo mas grande.
         *
         * "Volver a bajar el mapa" ya no esta aqui: se fue a Ferramentas,
         * al grupo de "Operacion sen conexion", que es donde vive todo lo
         * del mapa guardado -y donde ya estaba duplicado-.
         */}
        {/* Guía de instalar, sólo iPhone sin instalar: sin ello Safari borra los
            datos a los siete días sin abrir la web. */}
        {aconsejarInstalar ? (
          <div style={consejoInstalar} role="note">
            <strong style={consejoTitulo}>{tx.instalarTitulo}</strong>
            <span>{tx.instalarCuerpo}</span>
          </div>
        ) : null}

        {/* La lista final: un sí o un no por cosa. */}
        {preparacion ? (
          <div style={listaFinalEstilo} aria-label={tx.listaFinal}>
            {preparacion.lista.map((elemento) => (
              <span
                key={elemento.id}
                data-saga-lista={elemento.id}
                style={{
                  ...chipLista,
                  color:
                    elemento.ok === true
                      ? VERDE_HECHO
                      : elemento.ok === false
                        ? 'rgba(253,224,71,.95)'
                        : 'rgba(255,255,255,.6)',
                }}
              >
                {tx.lista[elemento.id]} {elemento.ok === true ? '✓' : elemento.ok === false ? '✗' : '·'}
              </span>
            ))}
          </div>
        ) : null}

        {preparacion ? (
          preparacion.fase === 'fallo' ? (
            <button type="button" style={botonPrimario} onClick={preparacion.onReintentar}>
              {tx.reintentarDescarga}
            </button>
          ) : pendientes.length > 1 ? (
            <button type="button" style={botonPrimario} onClick={preparacion.onPedirTodos}>
              {tx.pedirTodos}
            </button>
          ) : pendientes.length === 1 ? (
            <button
              type="button"
              style={botonPrimario}
              disabled={pendientes[0].ocupado}
              onClick={pendientes[0].accion}
            >
              {pendientes[0].ocupado
                ? pendientes[0].etiqueta
                : `${tx.permitir} ${pendientes[0].que.toLowerCase()}`}
            </button>
          ) : preparacion.fase === 'listo' ? (
            <button type="button" style={botonPrimario} onClick={preparacion.onCerrar}>
              {tx.todoListoCerrar}
            </button>
          ) : null
        ) : pendientes.length === 1 ? (
          <button
            type="button"
            style={botonPrimario}
            disabled={pendientes[0].ocupado}
            onClick={pendientes[0].accion}
          >
            {pendientes[0].ocupado
              ? pendientes[0].etiqueta
              : `${tx.permitir} ${pendientes[0].que.toLowerCase()}`}
          </button>
        ) : null}

        {/* Salida explicita. La X de arriba ya cerraba, pero era el unico
            camino y no todo el mundo la busca: con permisos denegados desde
            los ajustes del movil, esta pantalla era un callejon aparente. */}
        <button
          type="button"
          style={botonSecundario}
          onClick={preparacion ? preparacion.onCerrar : onDismiss}
        >
          {tx.seguirSinEso}
        </button>
    </>
  )

  const tarjeta = (
    <section
      data-saga-anim="prep-tarjeta"
      style={{
        ...tarjetaEstilo(mobile),
        transform: saliendo ? 'translateY(14px) scale(.97)' : 'translateY(0) scale(1)',
        opacity: saliendo ? 0 : 1,
        transition: saliendo
          ? 'transform var(--saga-motion-sale) var(--saga-motion-curva), opacity var(--saga-motion-sale) var(--saga-motion-curva)'
          : undefined,
        /**
         * Dentro de la carga entra MAS TARDE y con mas recorrido.
         *
         * "Sale de golpe y no animado": la animacion corria, pero corria a la
         * vez que se rehacia la pantalla de carga entera -al pasar a `ready`
         * se cambia de rama y se vuelve a montar todo-, asi que los 260ms de
         * la tarjeta quedaban escondidos dentro de un cambio de pantalla. Con
         * 200ms de espera primero, lo que se ve es: la carga se queda quieta,
         * y ENTONCES sube la tarjeta. Dos momentos en vez de uno confuso.
         */
        // 380ms/200ms -> 620ms/280ms: "aparece muy de golpe", seguia
        // viendose seco. Mas espera y mas recorrido para que se lea como
        // una entrada de verdad, no un parpadeo.
        animation: saliendo
          ? 'none'
          : incrustado
            ? 'sagaPanelEntra 620ms var(--saga-motion-curva) 280ms both'
            : tarjetaEstilo(mobile).animation,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {cuerpo}
    </section>
  )

  /**
   * Incrustado: solo la tarjeta, sin velo ni portal.
   *
   * Vive dentro de la pantalla de carga, que ya es el fondo de todo. Ponerle
   * su propia capa oscura encima seria oscurecer lo que ya esta oscuro, y
   * sacarlo por un portal a `document.body` lo arrancaria justamente del
   * sitio donde ahora tiene que estar.
   */
  if (incrustado) return tarjeta

  const panel = (
    <div
      data-saga-anim="prep-capa"
      style={capaDinamica}
      onClick={onDismiss}
      onTransitionEnd={(event) => {
        if (event.target !== event.currentTarget) return
        if (event.propertyName !== 'opacity') return
        if (!saliendo) return
        setMontado(false)
        setSaliendo(false)
      }}
    >
      {tarjeta}
    </div>
  )

  if (typeof document === 'undefined') return panel

  return createPortal(panel, document.body)
}

const capa: CSSProperties = {
  position: 'fixed',
  inset: 0,
  // Por encima de la barra de abajo (3600) y del botón de clasificación
  // (4600): con 1400 el velo tapaba el mapa pero esos dos seguían asomando por
  // encima de la tarjeta. Por debajo de la cámara (7500), que manda cuando se
  // abre para escanear.
  zIndex: 7000,
  display: 'grid',
  placeItems: 'center',
  padding: 16,
  // Fondo difuminado, no solo oscurecido: se sigue adivinando el mapa detras
  // -"que difumine todo el fondo y se vea todo eso"- pero nada de lo de
  // debajo compite con la tarjeta.
  background: 'rgba(var(--theme-ink-deep), .84)',
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  transition: 'opacity var(--saga-motion-sale) var(--saga-motion-curva)',
}

// Tarjeta SOLIDA, no cristal: mismo lenguaje que el prologo, la mochila y
// las herramientas. Ver la nota larga en PlayerShell.tsx sobre por que los
// translucidos daban barro.
function tarjetaEstilo(mobile: boolean): CSSProperties {
  return {
    width: mobile ? 'min(100%, 360px)' : 'min(100%, 420px)',
    display: 'grid',
    gap: 0,
    padding: '22px 19px 19px',
    color: '#e2e8f0',
    borderRadius: 18,
    background: 'var(--theme-card)',
    boxShadow: 'var(--theme-card-shadow)',
    animation: 'sagaPanelEntra var(--saga-motion-entra) var(--saga-motion-curva)',
  }
}

const cabecera: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 10,
}

const antetitulo: CSSProperties = {
  fontSize: 9.5,
  fontWeight: 900,
  letterSpacing: '.18em',
  color: 'var(--theme-primary)',
}

const titulo: CSSProperties = {
  display: 'block',
  margin: '6px 0 4px',
  fontSize: 21,
  fontWeight: 900,
  letterSpacing: '-.025em',
  color: '#ffffff',
}

const recuento: CSSProperties = {
  fontSize: 12,
  color: 'rgba(255,255,255,.6)',
  marginBottom: 20,
}

const cerrar: CSSProperties = {
  flex: '0 0 auto',
  // Ver la nota de PlayerHud.tsx: area de toque.
  width: 36,
  height: 36,
  display: 'grid',
  placeItems: 'center',
  padding: 0,
  borderRadius: 10,
  border: 0,
  background: 'var(--theme-card-inset)',
  color: 'rgba(255,255,255,.7)',
  fontSize: 17,
  fontWeight: 900,
  lineHeight: 1,
  cursor: 'pointer',
}

// Entre DOS lineas finas, no solo con una arriba: la fila del permiso es lo
// unico accionable de la tarjeta y asi queda enmarcada sin necesitar caja.
const fila: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 14,
  padding: '16px 0',
  borderTop: `1px solid var(--theme-hairline)`,
  borderBottom: `1px solid var(--theme-hairline)`,
}

// Ya no es un emoji de 26px sino un SVG de trazo: el hueco se ajusta a eso
// y el color lo hereda del tema, que es lo que un emoji nunca hizo.
const icono: CSSProperties = {
  flex: '0 0 auto',
  width: 30,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'var(--theme-primary)',
}

const queEs: CSSProperties = {
  fontSize: 16,
  fontWeight: 900,
  lineHeight: 1.2,
  color: '#ffffff',
}

// 12px, no 10.5: esto se lee de pie, en la calle, antes de salir a andar.
const paraQue: CSSProperties = {
  fontSize: 12,
  lineHeight: 1.4,
  marginTop: 3,
  color: 'rgba(255,255,255,.6)',
}

const falloTexto: CSSProperties = {
  color: 'rgba(253,224,71,.92)',
}

// Naranja PLANO con texto oscuro: el degradado se leia apagado sobre la
// tarjeta solida. Es la accion que se espera que pulses, tiene que cantar.
const boton: CSSProperties = {
  flex: '0 0 auto',
  minHeight: 40,
  padding: '0 16px',
  borderRadius: 11,
  border: 0,
  background: 'var(--theme-primary)',
  color: 'var(--theme-card)',
  fontSize: 12.5,
  fontWeight: 900,
  letterSpacing: '.02em',
  cursor: 'pointer',
}

// La accion principal de la tarjeta, a lo ancho y en naranja plano.
const botonPrimario: CSSProperties = {
  width: '100%',
  minHeight: 46,
  borderRadius: 12,
  border: 0,
  background: 'var(--theme-primary)',
  color: 'var(--theme-card)',
  fontSize: 12.5,
  fontWeight: 900,
  cursor: 'pointer',
  marginBottom: 9,
}

const botonSecundario: CSSProperties = {
  width: '100%',
  minHeight: 44,
  borderRadius: 12,
  border: `1px solid var(--theme-card-inset)`,
  background: 'transparent',
  color: 'rgba(255,255,255,.78)',
  fontSize: 12,
  fontWeight: 800,
  cursor: 'pointer',
}

// La guía de instalar (iPhone): una nota, no una fila. Sin botón — no hay nada
// que pulsar, hay que hacerlo en el menú del navegador.
const consejoInstalar: CSSProperties = {
  display: 'grid',
  gap: 4,
  margin: '12px 0 0',
  padding: '10px 12px',
  borderRadius: 10,
  fontSize: 12,
  lineHeight: 1.45,
  background: 'rgba(250, 204, 21, .10)',
  border: '1px solid rgba(250, 204, 21, .35)',
  color: 'rgba(255,255,255,.85)',
}

const consejoTitulo: CSSProperties = { fontSize: 12.5, color: '#fde68a' }

// La lista final: App ✓ Misión ✓ Mapa ✓ Permisos ✓ Espacio ✓
const listaFinalEstilo: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '6px 14px',
  justifyContent: 'center',
  margin: '14px 0 12px',
}

const chipLista: CSSProperties = { fontSize: 12.5, fontWeight: 900, letterSpacing: '.01em' }

/**
 * Verde universal de "hecho", no `--theme-done`.
 *
 * En el tema de fuego ese token es naranja terracota, y "conseguido" leido en
 * el color de la marca no se distingue de lo que aun falta. Es una señal, no
 * decoracion. Mismo criterio que el punto de "EN LIÑA" de la clasificacion.
 *
 * Las etiquetas sueltas de abajo (`hechoFila`/`hechoEtiqueta`) se fueron: lo
 * ya conseguido se ve ahora en su propia fila, con su visto, en vez de
 * resumido aparte al final.
 */
const VERDE_HECHO = '#7ecb8f'

// Ocupa el mismo sitio que el boton al que sustituye, para que conceder un
// permiso no mueva nada de la tarjeta.
const vistoFila: CSSProperties = {
  flex: '0 0 auto',
  minWidth: 44,
  height: 34,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 15,
  fontWeight: 900,
  color: VERDE_HECHO,
}

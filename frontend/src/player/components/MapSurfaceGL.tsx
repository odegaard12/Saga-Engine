import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ComponentProps, type ComponentType } from 'react'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import urlDelWorker from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'

/**
 * EL fallo de toda la migración, y el más silencioso.
 *
 * MapLibre v6 hace su trabajo pesado en un web worker que carga como
 * módulo desde una URL calculada AL LADO de su propio chunk:
 * `new URL('./maplibre-gl-worker.mjs', import.meta.url)`. Vite no copia
 * ese fichero porque nadie lo importa, así que la petición devolvía 404
 * -los dos 404 sin explicar de cada carga- y el worker moría sin decir
 * una palabra.
 *
 * Todo lo que pasa por el worker estuvo muerto desde 5.10: las fuentes
 * GeoJSON (trazado, radio, extrusión, símbolos) y la decodificación del
 * relieve. Las teselas satélite y los marcadores del DOM no lo usan, y
 * por eso eran lo único que se veía. Tuvo pinta de bug de datos, de bug
 * de eventos, de bug de posición y de bug del móvil, y no era ninguno.
 *
 * Y no vale con `?url`: ese worker hace a su vez
 * `import "./maplibre-gl-shared.mjs"`, que tampoco estaría. Con
 * `?worker&url` Vite empaqueta el worker CON lo que importa en un único
 * fichero con hash en `/assets/`, y aquí se le da a MapLibre esa
 * dirección. Mismo origen, mismo caché offline que el resto.
 */
maplibregl.setWorkerUrl(urlDelWorker)
/**
 * Teselas en paralelo: casi todas salen de la caché del service worker, no
 * de la red, así que las 16 de fábrica dejaban el mapa esperando turno al
 * desampliar -la vista nueva pide de golpe decenas de teselas-.
 */
maplibregl.setMaxParallelImageRequests(32)
import type { FieldProof, TeamProfileLiveStatus } from '../../types/player'
import { getPlayerAvatarUrl, getPlayerColor } from '../../shared/playerIdentity'
import type { MapSurfacePropsGL } from './mapSurfaceContract'
import { crearRedDeCaminos, type RedDeCaminos } from '../routing/redDeCaminos'
import {
  ALTO_BOLA_PX,
  ANCHO_BOLA_PX,
  CENTRO_HALO_3D_PX,
  DESPLAZAMIENTO_ANCLA_PX,
  cargarBolasGuardadas,
  dibujarSuelo,
  renderizarBola,
} from './bolaRenderizada'
import {
  claveDeJugador,
  tipoDePresencia,
  contenidoPopupGrupo,
  metrosPorPixel,
  ordenDePresencia,
  tamanoDeNodoPx,
  estaLejos,
  zoomDeReparto,
  ZOOM_DEL_REPARTO,
  planDeJugadores,
  separacionEntreJugadoresM,
  type ElementoDeMapa,
} from './jugadoresEnMapa'
import { crearCapaNodosTresD, type CapaNodosTresD, type TipoDeNodo } from './nodosTresD'
import { alCambiarCoberturaDelMapa, mapaCubierto } from '../hooks/useCubreElMapa'
import { intervaloDeDibujoMs } from '../avatares/movimientoSuave'
import { FuentePosicion } from '../posicion/fuentePosicion'

/**
 * 24/11: la separación entre personas (m) que se VE a este zoom, antes de cada cálculo de la fuente. Sólo el zoom y tu
 * latitud (no el centro del mapa, que cambia al arrastrar): girar, inclinar o mover la cámara no la tocan.
 */
function ponerSeparacion(fuente: FuentePosicion, mapa: maplibregl.Map | null, lat: number | undefined): void {
  if (mapa) fuente.separacionM = separacionEntreJugadoresM(mapa.getZoom(), lat ?? mapa.getCenter().lat)
}
import { anotarRumboPropio } from '../avatares/rumboPropio'
import { dibujarSueloDeJugador } from '../avatares/dibujarSuelo'
import {
  dibujarRetratoConFoto,
  dibujarRetratoDeMapa,
  idDeRetrato,
  idDeRetratoConFoto,
  leerIdDeFoto,
  leerIdDeRetrato,
  precargarFotos,
  reintentarFotos,
  urlDeFotoValida,
} from '../avatares/retratoDeMapa'
import {
  dibujarBrilloDeNodo,
  dibujarChispa,
  dibujarFlechaDeRuta,
  dibujarInsignia,
  dibujarOnda,
} from '../avatares/dibujarEfectos'
import {
  EVENTO_ELEGIR_PERSONAJE,
  EVENTO_GESTO,
  EVENTO_HOJA_DE_GESTOS,
  EVENTO_MENU_DE_GESTOS,
  EVENTO_PERSONAJE_ELEGIDO,
} from '../avatares/GestorDePersonaje'
import { avatarLocal, hayPendiente, reintentarPendiente } from '../avatares/elegirPersonaje'
import { normalizarAvatar, type AvatarConfig } from '../avatares/avatarConfig'
import { aspectoDe, aspectoPorDefecto, GESTO_DE_LLEGADA, partsAAspecto, saludoDeLlegada, type Aspecto, type MxId } from '../avatares3d/mixamo/catalogo'
import type { ComplementoDeAvatares, JugadorAvatar } from '../avatares3d/mixamo/capaAvatares'
import { EVENTO_ORGANIZADOR, organizadorActivo } from '../utils/modoOrganizador'
import { crearOcultadoresDeNodos, siluetasDeNodos } from './ocultarTrasNodos'
import { agruparNodosLejos, repartirNodos } from './repartoDeNodos'
import { AvisoPersonajes } from '../avatares3d/mixamo/AvisoPersonajes'
import { bajarModelosQueFaltan, debeMostrarseElPanel, hayDepuracionDeMapa, instalarPanelDeDepuracion } from '../avatares3d/mixamo/panelDepuracion'
import { motivoDeRetrato, type FilaDeDiagnostico } from '../avatares3d/mixamo/diagnosticoMapa'
import {
  almacenDeSesion,
  aplicarConmutadores,
  guardarConmutadores,
  leerConmutadores,
  pixelRatioDelMapa,
  ahorroActivo,
  conAhorro,
  vigilarBateria,
  type ConmutadorDelMapa,
} from './conmutadoresMapa'
import { controlesDeConmutadores, textoDelMapa } from './diagnosticoDelMapa'
import {
  brillo as curvaBrillo,
  Celebracion,
  chispas as curvaChispas,
  decidirCelebracion,
  onda as curvaOnda,
  prefiereMenosMovimiento,
  rebote as curvaRebote,
  CADUCA_ESPERANDO_MS,
  DURACION_FESTEJO_MS,
  DURACION_VUELO_MS,
} from '../avatares/celebracion'
import { cortarTrazado, guiaDesdeAqui, progresoAndado } from '../avatares/rutaAndada'
import { GESTO_SALUDAR } from '../avatares3d/mixamo/fichaJugador'
import { crearBocadillos, EVENTO_MENSAJE, textoDeMensaje } from '../avatares3d/mixamo/reacciones'
import { enviarReaccion } from '../../shared/api'
import { textosDePantallasDe } from './textosDePantallas'
import { getLocale } from '../../i18n'
import { cadaMientrasVisible } from '../../shared/cadaMientrasVisible'
import { crearAbanicos, type Abanico } from './abanicoDeJugadores'
import { inclinar, volarA, ZOOM_AL_INCLINAR } from './movimientoDeCamara'
import { destelloDeMoneda, encuadrarJugador, ENCUADRE_MS, ORO_MONEDA_MS, pulsoDorado, sellarNodo, verRutaEntera, VER_RUTA_MS } from './efectosDelMapa'
import { AvisoDeDesbloqueo } from '../avatares3d/mixamo/AvisoDeDesbloqueo'
import { tamanoJugador } from '../avatares3d/mixamo/lodAvatares'
import {
  FUENTE_RADIO,
  CAPA_RADIO_RELLENO,
  CAPA_RADIO_BORDE,
  FUENTE_RUTA,
  CAPA_RUTA,
  CAPA_RUTA_BORDE,
  FUENTE_NODOS_VOLUMEN,
  CAPA_EDIFICIOS,
  EDIFICIOS_EN_EL_MAPA,
  FUENTE_NODOS_ICONOS,
  FUENTE_FOTOS,
  CAPA_RUTA_PULSO,
  LATIDO_TRAS_CAMBIO_MS,
  INTENSIDAD_EN_REPOSO,
  FUENTE_JUGADOR,
  CAPA_JUGADOR,
  CAPA_AURA,
  ICONO_FLECHA_RUTA,
  ICONO_FLECHA_LEJOS,
  CAPA_GUIA_SIN_CAMINO,
  CAPA_GUIA_FLECHAS,
  CAPA_RUTA_FLECHAS,
  CAPA_RUTA_FLECHAS_LEJOS,
  GUIA_POR_CAMINOS_DESDE_M,
  SIN_CAMINO_DESDE_M,
  FUENTE_CELEBRACION,
  CAPA_CELEB_ONDA,
  CAPA_CELEB_BRILLO,
  CAPA_CELEB_CHISPAS,
  CAPA_CELEB_INSIGNIA,
  ICONO_CELEB_ONDA,
  ICONO_CELEB_BRILLO,
  ICONO_CELEB_CHISPA,
  ICONO_CELEB_INSIGNIA,
  FUENTE_OTROS,
  FUENTE_OTROS_LINEAS,
  CAPA_OTROS,
  FUENTE_GUIA,
  CAPA_NODOS_TRES_D,
  CAPA_GUIA,
  CAPA_FOTOS,
  CAPA_NODOS_ICONOS,
  CAPA_NODOS_HALO,
  CAPA_NODOS_MONEDA,
  CAPA_NODOS_MONEDAS_2D,
  OPACIDAD_DEL_HALO,
  ICONO_HALO,
  ICONO_HALO_3D,
  ALTURA_NODOS_M,
  CAPA_NODOS_SUELO,
  CAPA_NODO_ENTRADA,
  RADIO_ENTRADA_PX,
  METROS_POR_PX_Z0,
  CAPA_FOTOS_PILA,
  MAX_FOTOS_GRUPO,
  CAPA_NODOS_VOLUMEN,
  refrescarColoresDelMapa,
  colorDeLaRuta,
  PITCH_3D,
  CLAVE_YO,
  ICONO_HUECO_3D,
  COLOR_NODO_HECHO,
  COLOR_NODO_ACTUAL,
  COLOR_NODO_PENDIENTE,
  COLOR_RUTA_CONTORNO,
  COLOR_GUIA,
  COLOR_RADIO,
  COLOR_RADIO_BORDE,
} from './mapa/capas'
import {
  type RutaGuia,
  leerGuiaGuardada,
  guardarGuia,
  type Punto,
  metrosEntre,
  FUERA_DE_TRAZADO_M,
  DE_VUELTA_AL_TRAZADO_M,
  tipoDelNodo,
  circuloGeoJSON,
  cerrarTramo,
  leerTrackDelNodo,
  COLECCION_VACIA,
} from './mapa/guia'
import {
  dibujarChincheta,
  dibujarBola,
  dibujarMoneda,
  dibujarEntrada,
  dibujarHalo,
  dibujarPila,
  dibujarFoto,
  dibujarGrupo,
} from './mapa/iconos'
import { estiloBase } from './mapa/estilo'
import { aligerarMientrasSeMueve, type LigeroDelMapa } from './mapa/movimientoLigero'

/**
 * La ficha de un compañero (hoja con su muñeco 3D). Su código se pide a los pocos segundos de montar el mapa (y lo
 * guarda la caché sin cobertura): sin red, la ficha tiene que abrir igual. Si aun así no llega, no rompe el mapa:
 * se cierra sola.
 */
const cargarFicha = () => import('../avatares3d/mixamo/FichaDeJugador')
/** 22/11: la ruta (y versión) con la que ya se pasó por los zooms de alrededor al arrancar (ver `calentar`). */
const CLAVE_ZOOMS_CALENTADOS = 'saga:zooms-calentados'
type PropsDeFicha = ComponentProps<Awaited<ReturnType<typeof cargarFicha>>['FichaDeJugador']>
function FichaNoDisponible({ alCerrar }: PropsDeFicha) {
  useEffect(() => {
    alCerrar()
  }, [alCerrar])
  return null
}
const FichaDeJugador = lazy<ComponentType<PropsDeFicha>>(() =>
  cargarFicha().then(
    (m) => ({ default: m.FichaDeJugador }),
    () => ({ default: FichaNoDisponible })
  )
)

/**
 * El mapa del jugador, en WebGL (MapLibre): el único que hay.
 *
 * Sustituyó al de Leaflet, que dibujaba el mapa como un mosaico de <img> con
 * zoom por niveles enteros, costuras entre teselas y blanco mientras llegaban
 * las de cada nivel. Aquí lo dibuja la GPU: zoom continuo, relieve y nodos 3D.
 *
 * Las teselas salen del proxy con caché en disco
 * (`/map-tiles/{z}/{x}/{y}.png`) y el relieve de `/dem-tiles`: mismo origen,
 * mismas URL y mismo service worker, así que el modo sin cobertura y el
 * paquete offline (`offline/mapTileCache.ts`) siguen valiendo.
 *
 * Sin WebGL (contexto que no se puede crear) no hay mapa: se muestra un
 * aviso y la partida sigue con el resto de la interfaz. No hay segundo mapa.
 */

/**
 * La perspectiva de MapLibre en un punto del suelo (`0,5 + 0,5 × distancia al centro / distancia al punto`, la del
 * sombreador de símbolos): lo que crece lo que va pegado al suelo, como el aro que late bajo tu retrato.
 */
function escalaDePerspectiva(vivo: maplibregl.Map, q: { lat: number; lon: number }): number {
  const pxPorMetro = (p: { lat: number; lon: number }) => {
    const a = vivo.project([p.lon, p.lat])
    const b = vivo.unproject([a.x + 20, a.y])
    return 20 / Math.max(1e-6, b.distanceTo(new maplibregl.LngLat(p.lon, p.lat)))
  }
  const centro = vivo.getCenter()
  return Math.min(4, 0.5 + (0.5 * pxPorMetro(q)) / pxPorMetro({ lat: centro.lat, lon: centro.lng }))
}

/**
 * El estilo del mapa, declarado en crudo y NO por URL.
 *
 * Una URL de estilo sería una petición más que falla sin cobertura, justo
 * lo que no puede pasar en el monte. Sin tipografías ni iconos externos por
 * el mismo motivo: cada recurso de fuera es otra cosa que puede faltar.
 *
 * Es una función y no una constante porque hace falta poder volver a
 * aplicarlo si el montaje se queda a medias (ver el vigilante de abajo).
 */
function estiloDelMapa(): maplibregl.StyleSpecification {
  // Sin conmutadores de diagnóstico (`?mapa=`), el mismo objeto: ver conmutadoresMapa.ts.
  return aplicarConmutadores(estiloBase(), conmutadoresActivos)
}

/** Los conmutadores de diagnóstico de esta carga: se leen al montar el mapa (dirección o sesión). */
let conmutadoresActivos: ConmutadorDelMapa[] = []

/**
 * 22/11: las fuentes que casi siempre están vacías (la celebración, las fotos de campo). Con sus capas visibles, MapLibre
 * calculaba sus teselas con el relieve en CADA fotograma como las de una fuente llena (medido con 15 jugadores, CPU ×4:
 * ~3 ms por fotograma entre las dos). Vacías, sus capas se ocultan (MapLibre deja de usar la fuente) y vuelven a verse
 * con los primeros datos: no hay nada que enseñar mientras están vacías.
 */
const CAPAS_SOLO_CON_DATOS: Readonly<Record<string, readonly string[]>> = {
  [FUENTE_CELEBRACION]: [CAPA_CELEB_ONDA, CAPA_CELEB_BRILLO, CAPA_CELEB_CHISPAS, CAPA_CELEB_INSIGNIA],
  [FUENTE_FOTOS]: [CAPA_FOTOS, CAPA_FOTOS_PILA],
  /**
   * 22/11 (r2): el trazado y la guía también (sus capas sólo se ocultan aquí). Son líneas sobre el relieve: vacías,
   * MapLibre seguía buscando en cada fotograma las teselas del terreno de cada tesela suya (`getTerrainCoords`).
   */
  [FUENTE_RUTA]: [CAPA_RUTA_BORDE, CAPA_RUTA, CAPA_RUTA_FLECHAS, CAPA_RUTA_FLECHAS_LEJOS, CAPA_RUTA_PULSO],
  [FUENTE_GUIA]: [CAPA_GUIA, CAPA_GUIA_FLECHAS, CAPA_GUIA_SIN_CAMINO],
}
function verSoloConDatos(mapa: maplibregl.Map, fuente: string, datos: GeoJSON.FeatureCollection) {
  const capas = CAPAS_SOLO_CON_DATOS[fuente]
  if (!capas) return
  const valor = datos.features?.length ? 'visible' : 'none'
  for (const capa of capas) {
    if (mapa.getLayer(capa) && (mapa.getLayoutProperty(capa, 'visibility') ?? 'visible') !== valor) {
      mapa.setLayoutProperty(capa, 'visibility', valor)
    }
  }
}

export function MapSurfaceGL({
  className,
  currentStage,
  missionStages,
  currentLevel = 0,
  playerPosition,
  initialCenter,
  tresD = true,
  fieldProofs,
  onOpenFieldProofs,
  selfProfile,
  onListo,
  focusRequest,
  followPlayer = false,
  onUserMapMove,
  onRumbo,
  onTresD,
  gpsState,
  debugSimulation = false,
  gpsAccuracy = null,
  onDebugSetPosition,
  onNodeTap,
  otherPlayers,
}: MapSurfacePropsGL) {
  /**
   * El mapa YA NO retiene la pantalla (26/10, antitrampas V2).
   *
   * Hasta la 5.97 la mantenía encendida a menos de 250 m del nodo o 2 min tras un toque: la pantalla es lo que más
   * gasta y la gente la apaga para ahorrar batería. Ahora sólo la retiene la HOJA del reto mientras está abierta
   * (ver InteractionSheet y hooks/useWakeLock.ts): andando por el mapa el móvil se bloquea como siempre, y eso ya no
   * se confunde con «se fue a mirar otra app» porque las salidas sólo cuentan con un reto delante.
   */

  /** WebGL no disponible: no hay mapa, sí aviso. */
  const [sinWebGL, setSinWebGL] = useState(false)
  /** Callbacks y datos que leen los escuchadores del mapa (se registran una vez). */
  const debugRef = useRef({ activo: false, alPosicionar: onDebugSetPosition, alNodo: onNodeTap })
  debugRef.current = { activo: debugSimulation, alPosicionar: onDebugSetPosition, alNodo: onNodeTap }
  const etapaActualRef = useRef(currentStage)
  etapaActualRef.current = currentStage
  /** Hasta cuándo late el pulso del tramo (`performance.now()`); después, quieto. Ver `latir`. */
  const pulsoHastaRef = useRef(0)
  // Nodo nuevo (y al montar): que se vea dónde está.
  useEffect(() => {
    pulsoHastaRef.current = performance.now() + LATIDO_TRAS_CAMBIO_MS
  }, [currentLevel])
  /** Una foto tocada no cuenta como toque al mapa (ni mueve al jugador en modo prueba). */
  const fotoTocadaRef = useRef(false)
  /** Lo que hay en cada punto de la capa de compañeros (índice = propiedad `idx`). */
  const elementosOtrosRef = useRef<ElementoDeMapa[]>([])
  const popupOtrosRef = useRef<maplibregl.Popup | null>(null)
  /** La ficha abierta: la clave del compañero tocado (se busca en cada render: se actualiza sola). */
  const [fichaDe, setFichaDe] = useState<string | null>(null)
  /** Lo último que se supo de él: si deja de llegar en el equipo, la ficha sigue con esto. */
  const fichaUltimaRef = useRef<TeamProfileLiveStatus | null>(null)
  // Tu posición, para el popup (distancia) y para apartar a los demás de ti.
  const miPosicionRef = useRef<Punto | null>(null)
  const totalNodosRef = useRef(0)
  const [zoomActual, setZoomActual] = useState(16)
  // 7/11: la corona de retratos depende del giro y la inclinación del mapa: se recoloca al acabar de girar/inclinar.
  const [giroDeLaVista, setGiroDeLaVista] = useState(0)
  const contenedorRef = useRef<HTMLDivElement | null>(null)
  const mapaRef = useRef<maplibregl.Map | null>(null)
  /** El aviso de "pintado" se da una vez; la prop puede cambiar de identidad entre renders. */
  const onListoRef = useRef(onListo)
  onListoRef.current = onListo
  /** `número-estado-tipo` y posición de cada nodo: lo que se hornea bajo la carga. */
  const nodosParaHornearRef = useRef<{ clave: string; lon: number; lat: number }[]>([])
  /**
   * El precalentado en curso (ver `calentar`), para pararlo. Se medía en el
   * móvil: si la carga se quitaba por tope antes de acabar, la cámara seguía
   * saltando de zoom delante del jugador y, al final, volvía a donde estaba
   * al empezar, pisando el "centrar en mí" o el seguimiento del GPS: "no se
   * centra bien".
   */
  const calentadoRef = useRef<{ cancelar: (restaurarZoom: boolean) => void } | null>(null)
  /** Metros al camino cuando estás fuera de él; null cuando vas por él. */
  const [fueraDeTrazado, setFueraDeTrazado] = useState<number | null>(null)
  /** 5/11: la guía sale de ti sin camino conocido hasta la red de caminos (se dice en el aviso). */
  const [sinCaminoConocido, setSinCaminoConocido] = useState(false)
  /** Un gesto del jugador en curso: seguirle ahora le quitaría el mapa de las manos. */
  const gestoRef = useRef(false)
  /** Para reaplicar el modo 2D/3D (capas visibles) cuando cambia el botón. */
  const aplicarModoRef = useRef<(() => void) | null>(null)
  /**
   * 20/11 (QA: «3D→2D, los nodos pierden el cartel con el número ~300 ms; 2D→3D, el nodo 1 falta ~150 ms»): las imágenes
   * del otro modo (moneda 2D, poste y moneda 3D) se hornean al pintar los nodos, no cuando el cambio de modo las pide:
   * pedidas en ese momento llegaban a la capa unos fotogramas tarde y el nodo se veía sin cartel.
   */
  const precargarImagenesRef = useRef<(ids: readonly unknown[]) => void>(() => undefined)
  /**
   * 7/11: monedas (2D, o 3D con el mapa sin inclinar) o los nodos 3D de siempre con su poste. Se cambia al CRUZAR un
   * umbral de inclinación con histéresis (a postes por encima de 12°, a monedas por debajo de 8°): un único cambio de
   * diseño en el momento del cruce, sin fundidos (animar la opacidad con `setPaintProperty` repinta todas las texturas
   * del terreno en cada paso, ver la memoria de rendimiento del mapa) y con las imágenes ya horneadas.
   */
  const [monedas, setMonedas] = useState(!tresD)
  const monedasRef = useRef(!tresD)
  // El reparto de los nodos cercanos en arco (repartoDeNodos.ts), con la vista del mapa de ahora.
  const pintarNodosRef = useRef<() => void>(() => {})
  // Dónde se dibuja el nodo en juego (puede ir apartado en arco): también se abre tocándolo ahí.
  const sitioDelActualRef = useRef<{ lat: number; lon: number } | null>(null)
  /** Los nodos en 3D (three.js dentro del mapa). Se crea una vez. */
  const capaNodosRef = useRef<CapaNodosTresD | null>(null)
  if (!capaNodosRef.current) capaNodosRef.current = crearCapaNodosTresD(CAPA_NODOS_TRES_D)
  const tresDRef = useRef(tresD)
  tresDRef.current = tresD
  /** La red de caminos, si el panel la preparó; null mientras no está o si no hay. */
  /** La red de caminos, en su worker; `redLista` re-pinta la guía al llegar. */
  const redRef = useRef<RedDeCaminos | null>(null)
  if (!redRef.current) redRef.current = crearRedDeCaminos()
  const [redLista, setRedLista] = useState(false)
  /** Sube cada vez que el worker devuelve una ruta: re-pinta la guía. */
  const [rutaVersion, setRutaVersion] = useState(0)
  const pedidaRef = useRef<{ desde: Punto; hastaClave: string } | null>(null)
  /** Última ruta por caminos calculada, para no recalcular a cada aviso del GPS. */
  const rutaCaminosRef = useRef<RutaGuia | null>(null)
  const guiaLeidaRef = useRef(false)
  /** Última posición a la que se siguió, para no encadenar animaciones por 2 metros. */
  const ultimoSeguimientoRef = useRef<Punto | null>(null)
  /** Callbacks por ref: los escuchadores del mapa se registran una vez. */
  const onUserMapMoveRef = useRef(onUserMapMove)
  onUserMapMoveRef.current = onUserMapMove
  const onRumboRef = useRef(onRumbo)
  onRumboRef.current = onRumbo
  const onTresDRef = useRef(onTresD)
  onTresDRef.current = onTresD
  /** 8/11: el modo lo acaba de cambiar el gesto: la cámara se queda como la dejó el dedo (sin la inclinación del botón). */
  const tresDPorGestoRef = useRef(false)
  const inclinandoConDedoRef = useRef(false)
  const followPlayerRef = useRef(followPlayer)
  followPlayerRef.current = followPlayer
  /** Último encuadre atendido, para no repetir el mismo `token`. */
  const ultimoEncuadreRef = useRef<number | null>(null)
  /** Ya se centró una vez en ti (la primera va sin animación, ver el encuadre). */
  const primerEncuadreEnTiRef = useRef(false)
  const focusRequestRef = useRef(focusRequest)
  focusRequestRef.current = focusRequest
  /** Tu color de equipo (#rrggbb en minúsculas) y el aura del GPS, para el bucle de dibujo. */
  const miColorRef = useRef('#3b82f6')
  const auraRef = useRef('ninguna')
  /** Tu foto de perfil (vista 2D), si el servidor te la sirve. */
  const miFotoRef = useRef<string | null>(null)
  const gpsAccuracyRef = useRef<number | null>(gpsAccuracy)
  gpsAccuracyRef.current = gpsAccuracy
  /**
   * 23/11: UNA sola fuente de la posición de cada jugador (posicion/fuentePosicion.ts): real (filtro + banda muerta +
   * deslizamiento) y dibujo (real + apartado del poste). Retrato, cuerpo, abanico, aro y pulso la leen; la cámara sólo
   * proyecta. `yoRef` es tu deslizador dentro de ella (la cámara que te sigue y tu rumbo lo leen).
   */
  const fuenteRef = useRef(new FuentePosicion())
  const yoRef = useRef(fuenteRef.current.deslizador(CLAVE_YO, 'yo'))
  /** Los postes de los nodos (donde se dibujan al zoom del reparto): el disco de suelo donde nadie se queda. */
  const postesRef = useRef<{ lat: number; lon: number }[]>([])
  /** Qué abanicos hay puestos (para no repetir el mismo en cada dibujo). */
  const firmaAbanicosRef = useRef('')
  /** 16/11: vista lejana (jugadoresEnMapa.estaLejos) de la última pasada. */
  const lejosRef = useRef<boolean | undefined>(undefined)
  const firmaPlanRef = useRef('')
  const gruposDeNodosRef = useRef(new Map<string, { puntos: [number, number][] }>())
  /** Cuándo se rehízo por última vez tu punto del mapa (ver `dibujarMovil`). */
  const ultimoPuntoPropioRef = useRef(0)
  /** 22/11: cuándo se rehízo la fuente de los demás y con quién (ver `dibujarMovil`). */
  const ultimosOtrosRef = useRef({ en: 0, claves: '' })
  type BaseOtro = {
    clave: string
    lat: number
    lon: number
    /** Color de equipo si es un jugador suelto (lleva aro y flecha); null en un grupo. */
    color: string | null
    props: Record<string, unknown>
    /** Su aspecto 3D si es un jugador suelto y está conectado; null si va en grupo o sin conexión. */
    aspecto: Aspecto | null
    /** Su personaje y su foto de perfil (si tiene), para el retrato de la vista 2D; null en un grupo. */
    mx: MxId | null
    foto: string | null
  }
  const basesOtrosRef = useRef<BaseOtro[]>([])
  const bucleActivoRef = useRef(false)
  const movilRef = useRef<{ dibujar: () => boolean; arrancar: () => void } | null>(null)
  const sincronizarTresDRef = useRef<() => void>(() => undefined)
  /** La celebración de un nodo completado, y qué hay pendiente de empezar. */
  const celebracionRef = useRef(new Celebracion())
  const celebracionEnRef = useRef<{ lat: number; lon: number } | null>(null)
  /** Índice del nodo recién hecho cuya moneda va dorada (sólo durante la celebración) y el aviso para volver a la normal. */
  const oroRef = useRef(-1)
  const oroTimerRef = useRef(0)
  const pendienteCelebrarRef = useRef<{ plan: NonNullable<ReturnType<typeof decidirCelebracion>>; desde: number } | null>(null)
  const nivelPrevioRef = useRef<number | null>(null)
  const nivelRef = useRef(currentLevel)
  nivelRef.current = currentLevel
  /** Hasta cuándo no se sigue al jugador con la cámara (celebración y vuelo en curso). */
  const retenerSeguimientoRef = useRef(0)
  const celebrarRef = useRef<(() => void) | null>(null)
  /** Al acabar la ruta, la vista de la ruta entera espera al festejo: se cancela si el jugador toca el mapa. */
  const verRutaRef = useRef(0)
  /** La cámara está encuadrando al compañero que tocaste: su ficha espera para crear el muñeco (el tirón). */
  const encuadrandoRef = useRef(false)
  const cortarCelebracionRef = useRef<(() => void) | null>(null)
  /** Lo andado del tramo en juego y el trazado de ese tramo (para cortarlo en tu posición). */
  const tramoActualRef = useRef<Punto[]>([])
  const [progresoRuta, setProgresoRuta] = useState({ clave: '', m: 0 })
  const progresoRutaPrevio = useRef({ clave: '', m: 0 })
  const [mapaListo, setMapaListo] = useState(false)
  const [elegido, setElegido] = useState<AvatarConfig | null>(null)
  const usuarioYo = String(selfProfile?.user || selfProfile?.id || '')
  /**
   * Tu aspecto 3D: el que acabas de elegir; si hay uno pendiente de subir, el del
   * móvil; si no, el del servidor (si lo eligió él); si no, el del móvil, y si no
   * hay nada, el que te toca por tu id (igual en todos los móviles).
   */
  const avatarServidor = normalizarAvatar(selfProfile?.character_chosen ? selfProfile?.avatar : null)
  const miAspecto: Aspecto =
    partsAAspecto(elegido?.parts) ??
    partsAAspecto(usuarioYo && hayPendiente(usuarioYo) ? avatarLocal(usuarioYo)?.parts : null) ??
    partsAAspecto(avatarServidor?.parts) ??
    partsAAspecto(usuarioYo ? avatarLocal(usuarioYo)?.parts : null) ??
    aspectoPorDefecto(usuarioYo || 'player')
  const miAspectoRef = useRef<Aspecto>(miAspecto)
  miAspectoRef.current = miAspecto
  /** Los avatares 3D (complemento de la capa three.js) y quiénes van en 3D ahora mismo. */
  const avataresRef = useRef<ComplementoDeAvatares | null>(null)
  /** 7/11: quién va en el abanico (3D, sin sitio) y los abanicos puestos en el mapa (abanicoDeJugadores.ts). */
  const enAbanicoRef = useRef<ReadonlySet<string>>(new Set())
  const abanicosRef = useRef<ReturnType<typeof crearAbanicos> | null>(null)
  /** 11/11: el aro que late alrededor de TU retrato (marcador del DOM; ver `ponerPulsoPropio`). */
  const pulsoPropioRef = useRef<{ marcador: maplibregl.Marker; el: HTMLElement; mapa: maplibregl.Map } | null>(null)
  const sitioPulsoRef = useRef<{ lat: number; lon: number } | null>(null)
  const ponerPulsoPropioRef = useRef<() => void>(() => undefined)
  const obtenerAvatares = useCallback(() => avataresRef.current, [])
  const otrosCrudosRef = useRef(otherPlayers)
  otrosCrudosRef.current = otherPlayers
  /** Pone la capa three.js (con los avatares) en el mapa si falta: tras cargar el estilo y tras rehacerlo. */
  const aplicarCapaAvataresRef = useRef<(() => void) | null>(null)
  const enTresDRef = useRef<ReadonlySet<string>>(new Set())
  // 20/11: ¿modo organizador en este dispositivo? (utils/modoOrganizador.ts): sólo con él, o con `?depurar-mapa`, hay panel.
  const [organizadorVista, setOrganizadorVista] = useState(() => organizadorActivo())
  useEffect(() => {
    const alCambiar = () => setOrganizadorVista(organizadorActivo())
    window.addEventListener(EVENTO_ORGANIZADOR, alCambiar)
    return () => window.removeEventListener(EVENTO_ORGANIZADOR, alCambiar)
  }, [])
  const marcadoresNodosRef = useRef<maplibregl.Marker[]>([])
  /** Miniatura de cada foto por nombre de icono, para dibujarla cuando el mapa la pida. */
  const fotosPorIconoRef = useRef(new Map<string, string>())
  /** Lo último recibido, para resolver un toque sobre una foto sin cerrar props viejas. */
  const fotosRef = useRef<FieldProof[]>([])
  /** Las fotos por sitio: el visor abre el grupo entero, empezando por la tocada. */
  const gruposFotosRef = useRef<FieldProof[][]>([])
  const abrirFotosRef = useRef<((proofs: FieldProof[]) => void) | undefined>(undefined)

  /** Lo último que se mandó pintar a cada fuente, para poder reintentarlo. */
  const ultimoDatoRef = useRef(new Map<string, GeoJSON.FeatureCollection>())
  /**
   * Lo que tiene DE VERDAD cada fuente: el objeto de la fuente y los datos
   * que se le dieron. `setData` no mira si es lo mismo: recorta y recoloca
   * la fuente entera cada vez. Y `volcarPendientes` cuelga de `styledata`,
   * que salta con CADA cambio de estilo -diez por segundo, por `latir`-:
   * todo el trazado, los nodos y las fotos se reteselaban sin parar. Eran
   * los nodos y fotos que aparecían y desaparecían y los tirones al hacer
   * zoom. Sólo se vuelca a una fuente nueva (tras rehacer el estilo) o lo
   * que de verdad ha cambiado.
   */
  const aplicadoRef = useRef(
    new Map<string, { fuente: maplibregl.GeoJSONSource; datos: GeoJSON.FeatureCollection; json: string }>()
  )
  /** La ruta se encuadra una vez al entrar, no cada vez que llegan datos. */
  const encuadreInicialRef = useRef(false)
  /** Sube cuando hay que repintar todo: el estilo se rehizo por debajo. */
  const [versionEstilo, setVersionEstilo] = useState(0)

  useEffect(() => {
    if (!contenedorRef.current || mapaRef.current) return

    const centro =
      initialCenter ||
      (currentStage?.lat != null && currentStage?.lon != null
        ? { lat: currentStage.lat, lon: currentStage.lon }
        : { lat: 42.4333, lon: -8.65 })

    // Sin WebGL, MapLibre lanza al construirse. Se mira antes -sin dejar un
    // contexto vivo- y también se atrapa el lanzamiento, por si el
    // navegador cambia de opinión entre una cosa y otra.
    const hayWebGL = (() => {
      try {
        const lienzo = document.createElement('canvas')
        const contexto = lienzo.getContext('webgl2') || lienzo.getContext('webgl')
        contexto?.getExtension('WEBGL_lose_context')?.loseContext()
        return Boolean(contexto)
      } catch {
        return false
      }
    })()
    let mapaCreado: maplibregl.Map | null = null
    // Diagnóstico (`?mapa=…`, ver conmutadoresMapa.ts): sin parámetro ni sesión, ninguno y nada cambia.
    // 20/11: sin modo organizador ni `?depurar-mapa`/`?mapa=` en la dirección, los conmutadores guardados se restablecen a «Normal»
    // (antes el ahorro, que añade los suyos, enseñaba el panel de desarrollo a cualquier jugador).
    const conParametroDeMapa = (() => {
      try {
        return new URLSearchParams(window.location.search).has('mapa')
      } catch {
        return false
      }
    })()
    if (organizadorActivo() || hayDepuracionDeMapa() || conParametroDeMapa) {
      conmutadoresActivos = leerConmutadores(window.location.search, almacenDeSesion())
    } else {
      guardarConmutadores([], almacenDeSesion())
      conmutadoresActivos = []
    }
    // 30/10: modo ahorro de batería (conmutadoresMapa.ts): con batería baja o activado a mano, el mapa más ligero.
    vigilarBateria(window.localStorage)
    conmutadoresActivos = conAhorro(conmutadoresActivos, ahorroActivo(window.localStorage))
    // 6/11: los colores del tema, ANTES de construir el estilo: así no hace falta ningún setPaintProperty al montar.
    refrescarColoresDelMapa()
    const pixelRatioForzado = pixelRatioDelMapa(conmutadoresActivos, window.devicePixelRatio)
    if (hayWebGL) {
      try {
        mapaCreado = new maplibregl.Map({
      ...(pixelRatioForzado ? { pixelRatio: pixelRatioForzado } : {}),
      container: contenedorRef.current,
      center: [centro.lon, centro.lat],
      // 17 (antes 16): el zoom al que se centra en ti. Abrir en otro hacía que al llegar el GPS el mapa
      // se moviera y acercara justo al entrar (5.59).
      zoom: 17,
      // Inclinado ya al abrir, no animándose desde plano: con la vista 3D
      // por defecto, empezar en plano y bascular al montar se ve como un
      // tirón cada vez que entras.
      pitch: tresD ? PITCH_3D : 0,
      attributionControl: false,
      /**
       * SIN antialiasing de contexto (MSAA). Se probó en 5.25.24 y en el
       * móvil no se notó nada, pero desde entonces las fotos del mapa
       * aparecían y desaparecían: con relieve, MapLibre decide qué
       * símbolos tapa el terreno leyendo profundidad, y con el lienzo
       * multimuestreado eso se rompe. La calidad de lo 3D va por otro
       * lado: texturas difuminadas y geometría con más caras.
       *
       * Tope de zoom 19,5: la foto aérea no tiene más detalle que z19, y
       * por encima el mapa estira píxeles; eso era "amplío mucho y se
       * pixela", y ningún antialiasing lo arregla.
       */
      maxZoom: 19.5,
      /**
       * Nodos y fotos sin fundido: al cruzar de un zoom a otro MapLibre
       * rehace los símbolos y los fundía -300 ms- entre el viejo y el
       * nuevo. Era el "desamplío y los nodos desaparecen y aparecen".
       */
      fadeDuration: 0,
      // Al pellizcar, las teselas pedidas siguen su curso: cancelarlas a
      // cada paso del gesto dejaba el mapa en blanco hasta soltar.
      cancelPendingTileRequestsWhileZooming: false,
      /**
       * Más teselas en memoria: ocho niveles de zoom en vez de cinco. Al
       * desampliar y volver, lo que ya se vio sigue ahí en vez de leerse y
       * decodificarse otra vez ("se tiene que cargar de vuelta").
       */
      maxTileCacheZoomLevels: 8,
      // 23/11: las teselas (satélite, relieve, casas) no caducan durante la sesión: sin repetir peticiones ni decodificados a mitad de gesto.
      refreshExpiredTiles: false,
      // El estilo va declarado en crudo, NO por URL: una URL de estilo
      // sería una petición más que falla sin cobertura, justo lo que no
      // puede pasar en el monte. Sin sprites ni fuentes por el mismo
      // motivo: cada recurso externo es otra cosa que puede faltar.
      style: estiloDelMapa(),
        })
      } catch {
        mapaCreado = null
      }
    }
    if (!mapaCreado) {
      setSinWebGL(true)
      // La pantalla de carga espera a `onListo`: sin mapa, no hay nada que esperar.
      onListoRef.current?.()
      return
    }
    const mapa = mapaCreado

    mapaRef.current = mapa
    // 23/11: menos píxeles mientras la cámara se mueve (ver mapa/movimientoLigero.ts); quieto, el mapa de siempre.
    const ligero: LigeroDelMapa = aligerarMientrasSeMueve(mapa)
    /*
     * 5.53: sin tope de fotogramas. 5.52 envolvía `mapa._render` (privado de MapLibre) en calidad baja, y el iPhone
     * SIEMPRE es calidad baja (Safari no da `deviceMemory` y da pocos núcleos): era la única pieza nueva del pintado
     * que sólo corría en el móvil donde el mapa salió borroso. Fuera; la batería ya la cuida el latido.
     */

    /**
     * Sin botón de créditos sobre el mapa (`attributionControl: false`). La atribución de las fuentes sigue en su
     * estilo y los textos están en `creditosMapa.ts`, visibles al pie de la pantalla de carga.
     */

    /**
     * Contexto WebGL perdido (iOS al volver de la cámara, o con poca memoria). MapLibre rehace lo suyo al recuperarlo;
     * la capa three.js (nodos y avatares) tiene su propio renderizador sobre ese contexto, que ya no vale: se quita y se
     * vuelve a poner (al ponerla crea uno nuevo, que vuelve a subir geometrías y texturas) y se redibuja todo.
     */
    const alRecuperarContexto = () => {
      try {
        if (mapa.getLayer(CAPA_NODOS_TRES_D)) mapa.removeLayer(CAPA_NODOS_TRES_D)
      } catch {
        // Estilo a medias: el siguiente `styledata` la pone.
      }
      aplicarCapaAvataresRef.current?.()
      movilRef.current?.dibujar()
      capaNodosRef.current?.repintar()
      mapa.triggerRepaint()
    }
    mapa.on('webglcontextrestored', alRecuperarContexto)

    /**
     * Imagen de chincheta dibujada al vuelo.
     *
     * MapLibre pide la imagen la primera vez que una capa la nombra y no
     * la tiene. Se dibuja aquí en un canvas, con el número horneado, y se
     * registra. Funciona igual tras un rehecho del estilo -que borra las
     * imágenes-: las pide otra vez y se vuelven a dibujar.
     *
     * Formato del nombre: `nodo-<número>-<estado>`.
     */
    // 22/11: las bolas 3D horneadas en otra apertura se leen de IndexedDB antes de hornear ninguna: el resolvedor de
    // MapLibre espera esta promesa. Sin tope propio (abrir IndexedDB ya tiene el suyo): con 1,5 s, a CPU ×4, se perdía la
    // carrera y se horneaban las 25 igual (6-8 s de hilo principal, más que cualquier espera).
    let bolasLeidas = false
    const bolasGuardadas = cargarBolasGuardadas().then(() => {
      bolasLeidas = true
    })
    const alFaltarImagen = (evento: { id: string }): void | Promise<void> => {
      if (!bolasLeidas && /^nodo3dm?-/.test(evento.id)) return bolasGuardadas.then(() => alFaltarImagen(evento))
      if (evento.id === ICONO_HUECO_3D) {
        if (mapa.hasImage(evento.id)) return
        // El hueco tocable de quien va en 3D: 56 × 96 px a tamaño 1 (~63 × 107 a z16, ~100 × 170 a z19,5): el cuerpo mide
        // 80-126 px y un dedo necesita ~44 px de ancho. Transparente: sólo sirve para recibir el toque.
        mapa.addImage(evento.id, { width: 56, height: 96, data: new Uint8Array(56 * 96 * 4) }, { pixelRatio: 1 })
        return
      }
      const conFoto = leerIdDeFoto(evento.id)
      if (conFoto) {
        if (mapa.hasImage(evento.id)) return
        // Su foto de perfil (vista 2D). Mientras llega sale la cara de su personaje; al llegar se repinta.
        const imagen = dibujarRetratoConFoto(conFoto.url, conFoto.mx, conFoto.color, () => {
          const nueva = dibujarRetratoConFoto(conFoto.url, conFoto.mx, conFoto.color)
          if (nueva && mapaRef.current === mapa && mapa.hasImage(evento.id)) mapa.updateImage(evento.id, nueva)
        })
        if (imagen) mapa.addImage(evento.id, imagen, { pixelRatio: 3 })
        return
      }
      const retrato = leerIdDeRetrato(evento.id)
      if (retrato) {
        if (mapa.hasImage(evento.id)) return
        // Sin foto: su silueta en su color (5/11: nunca la cara del personaje), que no espera a nada.
        const imagen = dibujarRetratoDeMapa(retrato.mx, retrato.color)
        if (imagen) mapa.addImage(evento.id, imagen, { pixelRatio: 3 })
        return
      }
      const sueloJugador = /^pjs-([0-9a-f]{6})-([01])$/.exec(evento.id)
      if (sueloJugador) {
        if (mapa.hasImage(evento.id)) return
        const imagen = dibujarSueloDeJugador(`#${sueloJugador[1]}`, sueloJugador[2] === '1')
        if (imagen) mapa.addImage(evento.id, imagen, { pixelRatio: 3 })
        return
      }
      const grupoNodos = /^nodos-grupo-(\d+)$/.exec(evento.id)
      if (grupoNodos) {
        if (mapa.hasImage(evento.id)) return
        const imagen = dibujarGrupo(Number(grupoNodos[1]))
        if (imagen) mapa.addImage(evento.id, imagen, { pixelRatio: 3 })
        return
      }
      const grupoOtros = /^otros-grupo-(\d+)$/.exec(evento.id)
      if (grupoOtros) {
        if (mapa.hasImage(evento.id)) return
        const imagen = dibujarGrupo(Number(grupoOtros[1]))
        if (imagen) mapa.addImage(evento.id, imagen, { pixelRatio: 3 })
        return
      }
      if (
        evento.id === ICONO_FLECHA_RUTA ||
        evento.id === ICONO_FLECHA_LEJOS ||
        evento.id === ICONO_CELEB_ONDA ||
        evento.id === ICONO_CELEB_CHISPA ||
        evento.id === ICONO_CELEB_INSIGNIA ||
        evento.id === ICONO_CELEB_BRILLO
      ) {
        if (mapa.hasImage(evento.id)) return
        const imagen =
          evento.id === ICONO_FLECHA_RUTA
            ? dibujarFlechaDeRuta()
            : evento.id === ICONO_FLECHA_LEJOS
              ? dibujarFlechaDeRuta(110)
            : evento.id === ICONO_CELEB_ONDA
              ? dibujarOnda()
              : evento.id === ICONO_CELEB_CHISPA
                ? dibujarChispa()
                : evento.id === ICONO_CELEB_INSIGNIA
                  ? dibujarInsignia()
                  : dibujarBrilloDeNodo(ANCHO_BOLA_PX, ALTO_BOLA_PX, CENTRO_HALO_3D_PX)
        const escala = evento.id === ICONO_CELEB_ONDA ? 2 : 3
        if (imagen) mapa.addImage(evento.id, imagen, { pixelRatio: escala })
        return
      }
      const pila = /^pila-(.+)-(\d+)$/.exec(evento.id)
      if (pila) {
        if (mapa.hasImage(evento.id)) return
        const cuantas = Number(pila[2])
        const vacio = dibujarPila(null, cuantas)
        if (vacio) mapa.addImage(evento.id, vacio, { pixelRatio: 2 })
        const url = fotosPorIconoRef.current.get(`foto-${pila[1]}`)
        if (!url) return
        const imagen = new Image()
        imagen.crossOrigin = 'anonymous'
        imagen.onload = () => {
          const lista = dibujarPila(imagen, cuantas)
          if (!lista || !mapaRef.current) return
          if (mapa.hasImage(evento.id)) mapa.updateImage(evento.id, lista)
          else mapa.addImage(evento.id, lista, { pixelRatio: 2 })
        }
        imagen.src = url
        return
      }
      if (evento.id.startsWith('foto-')) {
        if (mapa.hasImage(evento.id)) return
        const url = fotosPorIconoRef.current.get(evento.id)
        // Se registra YA un marco vacío: MapLibre no vuelve a pedir la
        // misma imagen, así que si se tardara en cargar la miniatura, sin
        // esto la foto no aparecería nunca. Cuando llegue, se sustituye.
        const vacio = dibujarFoto(null)
        if (vacio) mapa.addImage(evento.id, vacio, { pixelRatio: 2 })
        if (!url) return
        const imagen = new Image()
        imagen.crossOrigin = 'anonymous'
        imagen.onload = () => {
          const lista = dibujarFoto(imagen)
          if (!lista || !mapaRef.current) return
          if (mapa.hasImage(evento.id)) mapa.updateImage(evento.id, lista)
          else mapa.addImage(evento.id, lista, { pixelRatio: 2 })
        }
        imagen.src = url
        return
      }
      if (evento.id === ICONO_HALO) {
        if (mapa.hasImage(ICONO_HALO)) return
        const halo = dibujarHalo()
        if (halo) mapa.addImage(ICONO_HALO, halo, { pixelRatio: 3 })
        return
      }
      if (evento.id === ICONO_HALO_3D) {
        if (mapa.hasImage(ICONO_HALO_3D)) return
        const halo = dibujarHalo(CENTRO_HALO_3D_PX, ANCHO_BOLA_PX, ALTO_BOLA_PX)
        if (halo) mapa.addImage(ICONO_HALO_3D, halo, { pixelRatio: 3 })
        return
      }
      const entrada = /^entrada-(checkpoint|qr|minijuego|coleccionable)$/.exec(evento.id)
      if (entrada) {
        if (mapa.hasImage(evento.id)) return
        const imagen = dibujarEntrada(entrada[1] as TipoDeNodo)
        if (imagen) mapa.addImage(evento.id, imagen, { pixelRatio: 2 })
        return
      }
      const suelo = /^suelo-(hecho|actual|pendiente)-(checkpoint|qr|minijuego|coleccionable)$/.exec(evento.id)
      if (suelo) {
        if (mapa.hasImage(evento.id)) return
        const imagen = dibujarSuelo(suelo[1] as 'hecho' | 'actual' | 'pendiente', suelo[2] as TipoDeNodo)
        if (imagen) mapa.addImage(evento.id, imagen, { pixelRatio: 3 })
        return
      }
      const moneda3d = /^nodo3dm-(\d+)-(hecho|actual|pendiente|oro)-(checkpoint|qr|minijuego|coleccionable)$/.exec(evento.id)
      if (moneda3d) {
        if (mapa.hasImage(evento.id)) return
        const dorada3d = moneda3d[2] === 'oro'
        const imagen = renderizarBola(Number(moneda3d[1]), dorada3d ? 'hecho' : (moneda3d[2] as 'hecho' | 'actual' | 'pendiente'), moneda3d[3] as TipoDeNodo, 'moneda', dorada3d)
        // Sin WebGL, la base ya lleva la bola dibujada entera: la moneda, vacía.
        mapa.addImage(evento.id, imagen ?? new ImageData(1, 1), { pixelRatio: 3 })
        return
      }
      const bola3d = /^nodo3d-(\d+)-(hecho|actual|pendiente|oro)-(checkpoint|qr|minijuego|coleccionable)$/.exec(evento.id)
      if (bola3d) {
        if (mapa.hasImage(evento.id)) return
        const estado3d = bola3d[2] as 'hecho' | 'actual' | 'pendiente' | 'oro'
        const tipo3d = bola3d[3] as TipoDeNodo
        // Objeto 3D renderizado una vez; si este navegador no puede, la bola dibujada. La base del 'oro' es la del hecho de siempre (dorada es la moneda).
        const imagen =
          renderizarBola(Number(bola3d[1]), estado3d === 'oro' ? 'hecho' : estado3d, tipo3d, 'base') ?? dibujarBola(bola3d[1], estado3d, tipo3d)
        if (imagen) mapa.addImage(evento.id, imagen, { pixelRatio: 3 })
        return
      }
      const moneda = /^moneda-(\d+)-(hecho|actual|siguiente|pendiente|oro)-(checkpoint|qr|minijuego|coleccionable)$/.exec(evento.id)
      if (moneda) {
        if (mapa.hasImage(evento.id)) return
        const imagen = dibujarMoneda(moneda[1], moneda[2] as 'hecho' | 'actual' | 'siguiente' | 'pendiente' | 'oro', moneda[3] as TipoDeNodo)
        if (imagen) mapa.addImage(evento.id, imagen, { pixelRatio: 3 })
        return
      }
      const bola = /^nodo-(\d+)-(hecho|actual|pendiente)-(checkpoint|qr|minijuego|coleccionable)$/.exec(evento.id)
      if (bola) {
        if (mapa.hasImage(evento.id)) return
        const imagen = dibujarBola(bola[1], bola[2] as 'hecho' | 'actual' | 'pendiente', bola[3] as TipoDeNodo)
        if (imagen) mapa.addImage(evento.id, imagen, { pixelRatio: 3 })
        return
      }
      const partes = /^nodo-(\d+)-(hecho|actual|pendiente)$/.exec(evento.id)
      if (!partes) return
      if (mapa.hasImage(evento.id)) return
      const color =
        partes[2] === 'hecho'
          ? COLOR_NODO_HECHO
          : partes[2] === 'actual'
            ? COLOR_NODO_ACTUAL
            : COLOR_NODO_PENDIENTE
      const imagen = dibujarChincheta(partes[1], color)
      if (imagen) mapa.addImage(evento.id, imagen, { pixelRatio: 2 })
    }
    mapa.on('styleimagemissing', alFaltarImagen)
    // 30/10: MapLibre 6 responde a la maquetación con las imágenes que HAY y avisa de las que faltan DESPUÉS: lo que
    // se añade en `styleimagemissing` ya no entra y la capa se queda sin esa imagen hasta el siguiente setData. Al
    // completar un nodo, el hecho y el nuevo en juego (imágenes nuevas) desaparecían del mapa. El resolvedor se
    // espera ANTES de responder.
    mapa.setMissingStyleImageResolver((id) => alFaltarImagen({ id }))
    precargarImagenesRef.current = (ids) => {
      for (const id of ids) if (typeof id === 'string' && id && !mapa.hasImage(id)) alFaltarImagen({ id })
    }
    // Las fotos que fallaron sin red se piden otra vez al volver y se repintan (5/11: ya no hay caras de personaje).
    const repintarRetratos = () => {
      if (mapaRef.current !== mapa) return
      for (const id of mapa.listImages()) {
        const retrato = leerIdDeRetrato(id)
        const foto = retrato ? null : leerIdDeFoto(id)
        const nueva = retrato
          ? dibujarRetratoDeMapa(retrato.mx, retrato.color)
          : foto
            ? dibujarRetratoConFoto(foto.url, foto.mx, foto.color)
            : null
        if (nueva) mapa.updateImage(id, nueva)
      }
    }
    const alVolverLaRedCaras = () => {
      reintentarFotos(repintarRetratos)
    }
    // 'saga:red-ok' y no 'online' (22/10): con la primera barra suben antes los avances del jugador (ver PlayerApp).
    window.addEventListener('saga:red-ok', alVolverLaRedCaras)

    /**
     * Vigilante: si el estilo no montó, volver a aplicarlo.
     *
     * MapLibre v6 monta el estilo dentro de un `requestAnimationFrame`. Un
     * navegador NO ejecuta fotogramas en una pestaña que no se está
     * pintando, así que si el mapa se crea con la pantalla bloqueada o con
     * la app en segundo plano -algo normalísimo durante los segundos que
     * tarda la descarga offline- ese fotograma no llega, el estilo se
     * queda sin montar y el mapa se ve EN BLANCO, con los nodos flotando
     * encima porque son marcadores del DOM y esos sí aparecen.
     *
     * No da ningún error ni se recupera solo si el fotograma pendiente se
     * perdió. Volver a aplicar el estilo al recuperar visibilidad cuesta
     * nada y evita quedarse mirando un mapa vacío en mitad del monte.
     */
    /**
     * Volcar en el mapa lo que no cupo antes.
     *
     * `styledata` salta cada vez que el estilo cambia de estado, incluida
     * la primera vez que termina de montarse. Es el momento exacto en que
     * las fuentes pasan a existir y hay que rellenarlas con lo que ya se
     * había calculado mientras tanto.
     */
    /**
     * La capa three.js (donde viven los avatares 3D) se pone encima de los símbolos de
     * jugador y debajo de la celebración. Los nodos NO se pintan en ella: siguen siendo
     * los símbolos horneados de siempre. Si el estilo se rehace la capa desaparece, y
     * esto la vuelve a poner.
     */
    aplicarCapaAvataresRef.current = () => {
      const vivo = mapaRef.current
      const capa = capaNodosRef.current
      if (!vivo || !capa || !avataresRef.current) return
      try {
        if (!vivo.getLayer(CAPA_NODOS_TRES_D) && vivo.getLayer(CAPA_CELEB_ONDA)) {
          vivo.addLayer(capa.capa, CAPA_CELEB_ONDA)
        }
      } catch {
        // Estilo a medias: se repite en el siguiente `styledata`.
      }
      subirFotos(vivo)
    }
    /**
     * Las fotos de campo, ENCIMA de los jugadores (retratos, suelos y cuerpos 3D) y debajo sólo de la celebración:
     * «si hago foto, queda detrás de los jugadores». En el estilo van bajo los nodos y los jugadores; aquí se suben
     * una vez por estilo (y otra si la capa 3D entra después). Los nodos y la ruta siguen debajo de la foto.
     */
    const subirFotos = (vivo: maplibregl.Map) => {
      try {
        const orden = vivo.getLayersOrder()
        const celeb = orden.indexOf(CAPA_CELEB_ONDA)
        if (celeb < 0) return
        for (const id of [CAPA_FOTOS_PILA, CAPA_FOTOS]) {
          const i = orden.indexOf(id)
          if (
            i >= 0 &&
            orden
              .slice(i + 1, celeb)
              .some((otra) => otra !== CAPA_FOTOS && otra !== CAPA_FOTOS_PILA)
          ) {
            vivo.moveLayer(id, CAPA_CELEB_ONDA)
          }
        }
      } catch {
        // Estilo a medias: se repite en el siguiente `styledata`.
      }
    }
    /**
     * 04/11: cambiar una propiedad de diseño SÓLO si cambia. `setLayoutProperty` repinta el mapa aunque el valor sea el
     * mismo, y esto va colgado de `styledata`, que salta con cada cambio de estilo (también con estos): medido andando,
     * ~13 llamadas por segundo y el mapa repintando por ellas sin que cambiara nada.
     */
    const ponerDiseno = (
      vivo: maplibregl.Map,
      capa: string,
      propiedad: Parameters<maplibregl.Map['setLayoutProperty']>[1],
      valor: Parameters<maplibregl.Map['setLayoutProperty']>[2]
    ) => {
      if (JSON.stringify(vivo.getLayoutProperty(capa, propiedad)) === JSON.stringify(valor)) return
      vivo.setLayoutProperty(capa, propiedad, valor)
    }
    const volcarPendientes = () => {
      const vivo = mapaRef.current
      if (!vivo) return
      subirFotos(vivo)
      aplicarCapaAvataresRef.current?.()
      sincronizarTresDRef.current()
      for (const [id, datos] of ultimoDatoRef.current) {
        const fuente = vivo.getSource(id) as maplibregl.GeoJSONSource | undefined
        if (!fuente) continue
        const previo = aplicadoRef.current.get(id)
        if (previo && previo.fuente === fuente && previo.datos === datos) continue
        aplicadoRef.current.set(id, { fuente, datos, json: JSON.stringify(datos) })
        fuente.setData(datos)
      }
      // También las que nunca recibieron datos (el estilo las trae visibles).
      for (const id of Object.keys(CAPAS_SOLO_CON_DATOS)) {
        try {
          verSoloConDatos(vivo, id, ultimoDatoRef.current.get(id) ?? COLECCION_VACIA)
        } catch {
          // Estilo a medio montar: se repite en el siguiente `styledata`.
        }
      }
      /**
       * La capa 3D (three.js) se añade cuando el estilo tiene capas, y se
       * vuelve a añadir tras un rehecho del estilo, que la borra. En 3D
       * los nodos son los modelos; las chinchetas planas y los discos
       * extruidos se ocultan. En 2D, al revés.
       */
      try {
        /**
         * La capa three.js en vivo NO se añade al mapa. Dibujar dentro del
         * lienzo de MapLibre salía serrado y parpadeaba al girar en el
         * móvil: "se genera en el momento y con el giro hace píxeles
         * nuevos". En 3D los nodos son objetos 3D renderizados UNA vez,
         * con luz y sombra, a tres veces la resolución y con sobremuestreo,
         * que el mapa coloca como símbolos (`renderizarBola`). En 2D, la
         * bola dibujada (`dibujarBola`). Misma capa, distinta imagen.
         */
        // 7/11: postes 3D sólo con el mapa inclinado; si no, la moneda (sin poste, sin peana, sin disco de suelo).
        const enTresD = !monedasRef.current
        if (vivo.getLayer(CAPA_NODOS_VOLUMEN)) {
          ponerDiseno(vivo, CAPA_NODOS_VOLUMEN, 'visibility', 'none')
        }
        /**
         * 20/11 (QA: «al pasar 2D→3D el nodo 1 no se ve ~100 ms»): cambiar la imagen, el ancla o la visibilidad de una
         * capa de símbolos obliga a MapLibre a rehacer CADA tesela en el worker, y las teselas vuelven en fotogramas
         * distintos: el nodo de otra tesela seguía con su moneda 2D (tapada por tu retrato) mientras los demás ya eran
         * postes. Ahora el diseño de las capas es FIJO y siempre maquetado (la moneda 2D en la suya; poste, moneda,
         * suelo y halo 3D en las suyas) y el modo sólo cambia su OPACIDAD: una propiedad de pintura, que vale para todas
         * las teselas en el mismo fotograma (sin transición). Con opacidad 0 MapLibre ni dibuja la capa.
         */
        if (vivo.getLayer(CAPA_NODOS_ICONOS)) {
          ponerDiseno(vivo, CAPA_NODOS_ICONOS, 'visibility', 'visible')
          ponerDiseno(vivo, CAPA_NODOS_ICONOS, 'icon-image', ['get', 'icono3d'])
          ponerDiseno(vivo, CAPA_NODOS_ICONOS, 'icon-anchor', 'bottom')
          ponerDiseno(vivo, CAPA_NODOS_ICONOS, 'icon-offset', [0, DESPLAZAMIENTO_ANCLA_PX])
        }
        for (const capa of [CAPA_NODOS_MONEDA, CAPA_NODOS_SUELO, CAPA_NODOS_HALO]) {
          if (vivo.getLayer(capa)) ponerDiseno(vivo, capa, 'visibility', 'visible')
        }
        if (vivo.getLayer(CAPA_NODOS_HALO)) {
          // La moneda lleva su halo horneado: el que late es sólo el de los postes.
          ponerDiseno(vivo, CAPA_NODOS_HALO, 'icon-image', ICONO_HALO_3D)
          ponerDiseno(vivo, CAPA_NODOS_HALO, 'icon-offset', [0, DESPLAZAMIENTO_ANCLA_PX])
        }
        const opacidades: [string, number][] = [
          [CAPA_NODOS_ICONOS, enTresD ? 1 : 0],
          [CAPA_NODOS_MONEDA, enTresD ? 1 : 0],
          [CAPA_NODOS_SUELO, enTresD ? 1 : 0],
          [CAPA_NODOS_HALO, enTresD ? OPACIDAD_DEL_HALO : 0],
          [CAPA_NODOS_MONEDAS_2D, enTresD ? 0 : 1],
        ]
        for (const [capa, valor] of opacidades) {
          if (!vivo.getLayer(capa)) continue
          const actual = vivo.getPaintProperty(capa, 'icon-opacity')
          /**
           * 22/11: en 3D la opacidad del halo es de `latir` (late y se queda en OPACIDAD_DEL_HALO): el modo sólo lo
           * enciende si venía apagado de 2D. Si no, esto (colgado de `styledata`) y el latido se la pisaban: cada
           * `setPaintProperty` vuelve a disparar `styledata`, y el mapa quieto repintaba a ~6 fps sin fin.
           */
          if (capa === CAPA_NODOS_HALO && enTresD && actual !== 0) continue
          if (actual !== valor) vivo.setPaintProperty(capa, 'icon-opacity', valor)
        }
      } catch {
        // Estilo a medio montar: se repite en el siguiente `styledata`.
      }
    }
    aplicarModoRef.current = volcarPendientes
    mapa.on('styledata', volcarPendientes)

    let rescates = 0
    const vigilarEstilo = () => {
      const vivo = mapaRef.current
      if (!vivo || document.visibilityState !== 'visible') return
      /**
       * `isStyleLoaded()` NO vale aquí: es `false` cada vez que hay una
       * tesela cargando, o sea, en cada zoom. Con esa comprobación el
       * vigilante rehacía el estilo entero hasta cinco veces sobre un
       * mapa sano: vaciaba las fuentes, recargaba teselas y descolocaba
       * los marcadores -"carga raro y al soltar se recoloca"-. Lo que
       * importa es si el estilo llegó a montarse, y eso se ve en si tiene
       * capas.
       *
       * Con `getLayersOrder()` (auditoría 23/10): pedir el estilo lo serializa
       * ENTERO —fuentes GeoJSON incluidas— cada 4 s sólo para contar capas;
       * esto copia la lista de ids y nada más.
       */
      let capas = 0
      try {
        capas = vivo.getLayersOrder().length
      } catch {
        capas = 0
      }
      if (capas > 0) return
      // Cinco intentos y basta: si a estas alturas no monta, el problema no
      // es el fotograma perdido y reintentar en bucle solo gasta batería.
      if (rescates >= 5) return
      rescates += 1
      try {
        vivo.setStyle(estiloDelMapa())
        // El estilo nuevo nace con las fuentes vacías, así que hay que
        // volver a meterles los datos que ya se habían calculado.
        vivo.once('styledata', () => setVersionEstilo((v) => v + 1))
      } catch {
        // Si el mapa ya no existe, no hay nada que rescatar.
      }
    }
    /**
     * El pulso del tramo en juego.
     *
     * MapLibre no anima propiedades solo; se cambia la opacidad de la capa
     * unas diez veces por segundo con una senoide. Sólo con la pestaña
     * visible: en segundo plano no hay nadie mirando y sí batería.
     */
    let pulsoVivo = true
    /**
     * Mientras el mapa se mueve, nada de animar.
     *
     * Cada `setPaintProperty` da el estilo por cambiado y, con relieve,
     * MapLibre tira entonces TODAS las texturas del terreno -la foto, el
     * sombreado y las líneas pintadas encima- y las repinta en el
     * fotograma siguiente. Diez veces por segundo, en pleno pellizco: eran
     * los tirones al ampliar y desampliar. Parado no se nota; moviéndose,
     * se pausa hasta un momento después de soltar.
     */
    let ultimoMovimiento = 0
    const enMovimiento = (m: maplibregl.Map) => {
      const ahora = performance.now()
      if (m.isMoving()) ultimoMovimiento = ahora
      return ahora - ultimoMovimiento < 300
    }
    /**
     * Auditoría 23/10: el pulso latía SIEMPRE, cuatro veces por segundo, y cada latido es un `setPaintProperty`
     * que repinta el terreno entero y despierta a los avatares de su reposo (capaAvatares.ts). Ahora late sólo
     * unos segundos tras algo que merece llamar la atención —cambio de nodo, tocar el mapa, volver al mapa tras
     * una hoja o un reto— y después se queda quieto en un instante normal del latido: el tramo y el nodo se siguen
     * distinguiendo, y como el valor ya está puesto no se vuelve a tocar el estilo (ver `poner`).
     * Con «menos movimiento» en el sistema no late nunca.
     */
    const intensidad = (periodoS: number) => {
      const reposo =
        performance.now() > pulsoHastaRef.current ||
        prefiereMenosMovimiento(typeof window !== 'undefined' ? window.matchMedia?.bind(window) : undefined)
      if (reposo) return INTENSIDAD_EN_REPOSO
      return 0.5 + 0.5 * Math.sin((performance.now() / 1000) * ((Math.PI * 2) / periodoS))
    }
    const despertarPulso = () => {
      pulsoHastaRef.current = performance.now() + LATIDO_TRAS_CAMBIO_MS
    }
    // Sólo se toca el estilo si el valor cambia: en reposo, cero repintados.
    const poner = (vivo: maplibregl.Map, capa: string, propiedad: 'line-opacity' | 'icon-opacity', valor: number) => {
      if (vivo.getPaintProperty(capa, propiedad) !== valor) vivo.setPaintProperty(capa, propiedad, valor)
    }
    const latir = () => {
      if (!pulsoVivo) return
      const vivo = mapaRef.current
      /**
       * Con algo encima -un minijuego a pantalla completa, una hoja con el
       * fondo desenfocado, la pantalla final- nadie ve el pulso, y cada cambio
       * de opacidad hace que MapLibre repinte el terreno entero: en un móvil de
       * gama baja eso es lo que más pesa, justo cuando hay un juego que
       * necesita el procesador. Se para el pulso y se vuelve a mirar cada medio
       * segundo (ver hooks/useCubreElMapa.ts).
       */
      const cubierto = mapaCubierto()
      // El móvil no llega (el medidor de los avatares bajó a «baja»): fuera las casas, como si hubiera empezado así.
      if (vivo && EDIFICIOS_EN_EL_MAPA && avataresRef.current?.calidad() === 'baja') {
        try {
          if (vivo.getLayer(CAPA_EDIFICIOS) && vivo.getLayoutProperty(CAPA_EDIFICIOS, 'visibility') !== 'none') {
            vivo.setLayoutProperty(CAPA_EDIFICIOS, 'visibility', 'none')
          }
        } catch {
          // Estilo a medias: se mira en el siguiente latido.
        }
      }
      if (vivo && !cubierto && document.visibilityState === 'visible' && !enMovimiento(vivo)) {
        try {
          if (vivo.getLayer(CAPA_RUTA_PULSO)) {
            poner(vivo, CAPA_RUTA_PULSO, 'line-opacity', 0.12 + 0.5 * intensidad(1.6))
          }
          if (vivo.getLayer(CAPA_NODOS_HALO)) {
            const pulso = intensidad(1.8)
            // 20/11: en 2D el halo va apagado por opacidad (ver `aplicarModo`): el latido no lo enciende.
            poner(vivo, CAPA_NODOS_HALO, 'icon-opacity', monedasRef.current ? 0 : 0.2 + 0.6 * pulso)
            if (vivo.getLayer(CAPA_NODO_ENTRADA)) {
              poner(vivo, CAPA_NODO_ENTRADA, 'icon-opacity', 0.6 + 0.35 * pulso)
            }
          }
          // Revisión 19/10 de batería: la moneda ya no flota (era adorno y eran dos setPaintProperty más por latido).
          if (vivo.getLayer(CAPA_GUIA)) {
            /**
             * La guía late en opacidad. Antes el trazo "crecía" cambiando
             * `line-dasharray`, y esa propiedad no es una más: MapLibre
             * recarga la fuente entera cada vez que cambia -cada 160 ms-,
             * con su reteselado en el worker y el terreno repintado.
             */
            poner(vivo, CAPA_GUIA, 'line-opacity', 0.55 + 0.4 * intensidad(1.2))
          }
        } catch {
          // Entre un rehecho del estilo y el siguiente la capa puede no estar.
        }
      }
      // Tapado o con la pantalla apagada / la pestaña oculta: ni pintar ni despertar al procesador 10 veces por segundo.
      // Revisión 19/10 de batería: cada latido repinta el mapa entero; a 100 ms eran 10 repintados/s en reposo. A 250 ms
      // el pulso (periodos de 1,2-1,8 s) se sigue viendo latir.
      // Quieto (en reposo) basta con mirar cada medio segundo: no pinta nada, sólo comprueba.
      const quieto = cubierto || document.visibilityState !== 'visible' || performance.now() > pulsoHastaRef.current
      window.setTimeout(latir, quieto ? 500 : 250)
    }
    latir()

    // La animación de los nodos 3D (si la capa está puesta) también se para.
    capaNodosRef.current?.pausar(mapaCubierto())
    const dejarDeVigilarCobertura = alCambiarCoberturaDelMapa((cubierto) => {
      capaNodosRef.current?.pausar(cubierto)
      // Se vuelve al mapa (se cerró la hoja del nodo o el reto): un latido para encontrar el sitio.
      if (!cubierto) despertarPulso()
    })

    /**
     * `idle` salta cuando no queda nada por cargar ni por dibujar: teselas,
     * elevación, imágenes de símbolos. La primera vez es "el mapa está".
     * Sólo se avisa una vez: después, cada zoom vuelve a pasar por `idle`
     * y eso ya no le importa a nadie.
     */
    /**
     * "El mapa ha pintado" NO es el evento `idle`.
     *
     * `idle` sólo salta cuando no queda nada por hacer, y el pulso del
     * trazado cambia una propiedad del estilo diez veces por segundo: el
     * mapa no está ocioso NUNCA. Todo lo que colgaba de idle -el aviso al
     * velo de carga, la red de caminos, la animación de los nodos 3D- no
     * se ejecutaba jamás: la guía salía recta, los modelos se quedaban
     * bajo el monte y el velo esperaba su tope. Lo que importa es que las
     * teselas de la vista estén: se pregunta cada cuarto de segundo, con
     * tope de ocho segundos por si alguna tesela no llega nunca.
     */
    const desde = performance.now()

    /**
     * Todo lo que el juego va a enseñar, preparado BAJO la pantalla de
     * carga y no cuando aparece.
     *
     * 1. Los nodos. Cada poképarada es un render de three.js que se hacía
     *    la primera vez que el nodo salía en pantalla: llegabas a la zona y
     *    no había puntos, el mapa se trababa horneándolos y salían después.
     * 2. Los zooms de alrededor. Al entrar sólo estaba el zoom de la vista;
     *    al desampliar, 2-3 segundos en blanco mientras se leían las
     *    teselas. Se pasa por dos zooms más lejanos y por la ruta entera,
     *    y se vuelve: todo eso queda en la memoria del mapa.
     *
     * Con tope: a los doce segundos de crear el mapa se deja lo que falte.
     * El de la carga (ver PlayerApp) es mayor, así que el velo nunca se
     * levanta con la cámara aún dando saltos.
     */
    const calentar = async (vivo: maplibregl.Map) => {
      const tope = desde + 12000
      const respiro = () => new Promise<void>((resolve) => window.setTimeout(resolve, 0))
      await bolasGuardadas
      // 22/11: primero las de los nodos que se ven (el orden de la ruta, dentro de cada grupo).
      const enVista = vivo.getBounds()
      const fuera = (nodo: { lon: number; lat: number }) => Number(!enVista.contains([nodo.lon, nodo.lat]))
      const claves = [...nodosParaHornearRef.current].sort((a, b) => fuera(a) - fuera(b)).map((nodo) => nodo.clave)
      const entradas = claves.filter((clave) => clave.includes('-actual-')).map((clave) => `entrada-${clave.split('-')[2]}`)
      const imagenes = tresDRef.current
        ? [
            ...entradas,
            ICONO_HALO_3D,
            ...claves.flatMap((clave) => [`suelo-${clave.replace(/^\d+-/, '')}`, `nodo3d-${clave}`, `nodo3dm-${clave}`]),
          ]
        : [ICONO_HALO, ...entradas, ...claves.map((clave) => `nodo-${clave}`)]
      for (const id of imagenes) {
        if (!mapaRef.current || performance.now() > tope) return
        if (vivo.hasImage(id)) continue
        alFaltarImagen({ id })
        await respiro()
      }

      let capas = 0
      try {
        capas = vivo.getLayersOrder().length
      } catch {
        capas = 0
      }
      if (capas === 0) return
      /**
       * 22/11: los saltos de zoom (cuatro y la ruta entera, hasta 2,5 s cada uno con el lienzo oculto) se hacían en CADA
       * arranque. Las teselas ya están en la caché del móvil: se hacen una vez por ruta y versión de la app.
       */
      const firmaDeRuta = `${typeof __SAGA_VERSION__ === 'string' ? __SAGA_VERSION__ : ''}|${nodosParaHornearRef.current
        .map((nodo) => `${nodo.lat.toFixed(5)},${nodo.lon.toFixed(5)}`)
        .join(';')}`
      try {
        if (window.localStorage.getItem(CLAVE_ZOOMS_CALENTADOS) === firmaDeRuta) return
      } catch {
        // sin almacenamiento: se calienta como siempre
      }
      // 22/11: con 'idle' del mapa en vez de mirar cada 100 ms; cancelar lo suelta al momento.
      let soltarEspera: (() => void) | null = null
      const esperarTeselas = (maximo: number) =>
        new Promise<void>((resolve) => {
          const inicio = performance.now()
          const acabar = () => {
            window.clearTimeout(reloj)
            vivo.off('idle', alQuedarQuieto)
            soltarEspera = null
            resolve()
          }
          // Unos fotogramas de gracia: justo tras mover la cámara, las
          // teselas nuevas aún no se han pedido y "todo cargado" miente.
          const alQuedarQuieto = () => window.setTimeout(acabar, Math.max(0, inicio + 200 - performance.now()))
          const reloj = window.setTimeout(acabar, Math.max(0, Math.min(inicio + maximo, tope) - inicio))
          soltarEspera = acabar
          vivo.on('idle', alQuedarQuieto)
        })
      const camara = {
        center: vivo.getCenter(),
        zoom: vivo.getZoom(),
        pitch: vivo.getPitch(),
        bearing: vivo.getBearing(),
      }
      let cancelado = false
      // Los saltos de zoom del calentamiento no se ven: el lienzo queda
      // transparente hasta que la cámara vuelve a su sitio. Si el velo de
      // carga ya se había ido (móvil lento), lo que se veía era el mapa
      // saltando; ahora el mapa aparece una sola vez, ya colocado.
      const lienzo = vivo.getCanvas()
      lienzo.style.opacity = '0'
      const mostrarLienzo = () => {
        lienzo.style.opacity = ''
      }
      calentadoRef.current = {
        // Quien mueve el mapa de verdad manda: se deja de saltar y, si es el
        // propio juego (seguir, encuadrar), se devuelve el zoom antes de que
        // él ponga el centro.
        cancelar: (restaurarZoom) => {
          if (cancelado) return
          cancelado = true
          soltarEspera?.()
          calentadoRef.current = null
          if (restaurarZoom) vivo.jumpTo({ zoom: camara.zoom, pitch: camara.pitch, bearing: camara.bearing })
          mostrarLienzo()
        },
      }
      // Cada nivel por el que se desampliará, no saltando: el que se salta
      // es el que luego falta (ver `maxTileCacheZoomLevels`).
      const vistas: (() => void)[] = [1, 2, 3, 4.5].map((menos) => () => vivo.jumpTo({ zoom: camara.zoom - menos }))
      const posiciones = nodosParaHornearRef.current
      if (posiciones.length > 1) {
        const limites = new maplibregl.LngLatBounds()
        for (const nodo of posiciones) limites.extend([nodo.lon, nodo.lat])
        vistas.push(() => vivo.fitBounds(limites, { padding: 70, duration: 0, maxZoom: 16, pitch: camara.pitch }))
      }
      for (const ver of vistas) {
        if (!mapaRef.current || cancelado || performance.now() > tope) break
        ver()
        await esperarTeselas(2500)
      }
      if (!mapaRef.current || cancelado) return
      calentadoRef.current = null
      vivo.jumpTo(camara)
      mostrarLienzo()
      try {
        if (performance.now() <= tope) window.localStorage.setItem(CLAVE_ZOOMS_CALENTADOS, firmaDeRuta)
      } catch {
        // sin almacenamiento: se volverá a calentar
      }
      await esperarTeselas(1500)
    }

    /**
     * Y en ratos libres, lo que pedirá el siguiente paso: el nodo en juego
     * ya hecho y el siguiente en juego. Así, al completar uno, el cambio de
     * imagen no se hornea en ese momento.
     */
    const adelantarSiguientes = () => {
      if (!tresDRef.current) return
      const claves = nodosParaHornearRef.current.map((nodo) => nodo.clave)
      const enJuego = claves.findIndex((clave) => clave.includes('-actual-'))
      if (enJuego < 0) return
      const siguientes = [claves[enJuego].replace('-actual-', '-hecho-')]
      if (claves[enJuego + 1]) siguientes.push(claves[enJuego + 1].replace('-pendiente-', '-actual-'))
      const trabajos = siguientes.flatMap((clave) => {
        const [numero, estadoSig, tipoSig] = clave.split('-')
        return (['base', 'moneda'] as const).map(
          (parte) => () => renderizarBola(Number(numero), estadoSig as 'hecho' | 'actual' | 'pendiente', tipoSig as TipoDeNodo, parte)
        )
      })
      // La moneda dorada del nodo en juego (al completarlo, la celebración la pide sin esperar).
      const [numeroEnJuego, , tipoEnJuego] = claves[enJuego].split('-')
      trabajos.push(() => renderizarBola(Number(numeroEnJuego), 'hecho', tipoEnJuego as TipoDeNodo, 'moneda', true))
      const siguiente = () => {
        const trabajo = trabajos.shift()
        if (!trabajo || !mapaRef.current) return
        trabajo()
        window.setTimeout(siguiente, 400)
      }
      window.setTimeout(siguiente, 1500)
    }

    // 22/11: al quedarse quieto el mapa ('idle') o a los 8 s, no mirando cada 250 ms.
    let pintadoVisto = false
    const alPintarse = () => {
      const vivo = mapaRef.current
      if (!vivo || pintadoVisto) return
      let capas = 0
      try {
        capas = vivo.getLayersOrder().length
      } catch {
        capas = 0
      }
      const listo = capas > 0 && vivo.areTilesLoaded()
      if (!listo && performance.now() - desde < 8000) return
      pintadoVisto = true
      window.clearTimeout(esperarPintado)
      mapa.off('idle', alPintarse)
      void calentar(vivo).finally(() => {
        if (!mapaRef.current) return
        // 1/11: el calentamiento deja el lienzo transparente mientras salta de zoom; si se corta a mitad (excepción, mapa
        // lento) no puede quedarse así: se vería el fondo gris en vez del mapa.
        vivo.getCanvas().style.opacity = ''
        onListoRef.current?.()
        setMapaListo(true)
        capaNodosRef.current?.arrancarAnimacion()
        adelantarSiguientes()
      })
    }
    mapa.on('idle', alPintarse)
    const esperarPintado = window.setTimeout(alPintarse, Math.max(0, desde + 8000 - performance.now()))

    /**
     * La red de caminos se carga en un worker desde el primer momento: la
     * descarga (guardada por el service worker desde la pantalla de carga)
     * y el análisis de 21 MB de JSON no tocan el hilo principal. Antes se
     * analizaba aquí mismo y el mapa se quedaba congelado unos segundos
     * nada más entrar: "el trazado aparece mucho después".
     */
    void redRef.current?.cargar().then((ok) => setRedLista(ok))
    // Si la primera carga falló, la red se reintenta sola (al volver la cobertura): que el mapa se entere.
    const dejarDeOirLaRed = redRef.current?.alQuedarLista(() => setRedLista(true))

    // El rumbo cambia con dos dedos; el botón de norte sólo tiene sentido
    // cuando el mapa está girado.
    const alGirar = () => onRumboRef.current?.(Math.round(mapa.getBearing()))
    mapa.on('rotate', alGirar)
    alGirar()
    const alZoom = () => setZoomActual(Math.round(mapa.getZoom() * 2) / 2)
    mapa.on('zoomend', alZoom)
    // 24/11: la separación entre personas sigue al zoom (lo que se ve): los retratos se recolocan durante el gesto, poco a
    // poco (el bucle sólo sigue mientras alguien se está apartando; si nadie se pisa, se para en el primer dibujo).
    const alZoomFotograma = () => {
      movilRef.current?.arrancar()
      /**
       * 20/11 (QA: «al acercar asoma 100-200 ms una burbuja gris "2"»): cruzar ZOOM_SEPARAR cambia de plan (lejos, los
       * que se tapan en un grupo con su número; cerca, cada uno en su sitio y, en 3D, con su cuerpo). Durante el zoom el
       * plan no se rehacía hasta que pasaba otra cosa (el primer cuerpo, soltar), y el grupo del plan lejano seguía
       * encima de los cuerpos que ya salían. Se rehace en el fotograma del cruce, una vez.
       */
      const lejos = estaLejos(mapa.getZoom())
      if (lejosRef.current !== undefined && lejos !== lejosRef.current) {
        lejosRef.current = lejos
        setGiroDeLaVista((v) => v + 1)
      }
    }
    mapa.on('zoom', alZoomFotograma)
    // 20/11: el plan ya NO se rehace a cada cuarto de zoom (cada rehecho movía a los jugadores durante y después del gesto):
    // se repasa al soltar (`moveend`), conservándolo si nadie cambió.
    alZoom()
    // 7/11 (3): y al mover el mapa (en pasos de ~1/4 de pantalla): un grupo pegado al borde se recoloca dentro.
    // 7/11 (nodos A): cada vez que se suelta el mapa se vuelve a repartir TODO (nodos y retratos, con esta vista): el
    // hueco de un retrato depende de dónde han quedado los nodos y, inclinado, de la perspectiva respecto al centro.
    const alGirarLaVista = () => setGiroDeLaVista((v) => v + 1)
    mapa.on('rotateend', alGirarLaVista)
    mapa.on('pitchend', alGirarLaVista)
    mapa.on('moveend', alGirarLaVista)
    const alInclinar = () => {
      const antes = monedasRef.current
      const ahora = !tresDRef.current || mapa.getPitch() < (antes ? 12 : 8)
      if (ahora === antes) return
      monedasRef.current = ahora
      aplicarModoRef.current?.()
      // Imagen y sitio en el mismo fotograma: el reparto de la moneda no vale para el poste (y al revés).
      pintarNodosRef.current()
      setMonedas(ahora)
    }
    mapa.on('pitch', alInclinar)
    // 8/11 (Óscar: «si pongo 3D y muevo hacia 2D no sale a 2D»): al soltar un gesto de inclinar, el modo sigue a la
    // cámara y la cámara se ajusta al modo (2D = plano del todo: monedas sin poste; 3D = su inclinación de siempre).
    // Histéresis: estando en 3D pasa a 2D por debajo de 20°; estando en 2D pasa a 3D por encima de 15°.
    const alSoltarInclinacion = () => {
      if (!inclinandoConDedoRef.current) return
      inclinandoConDedoRef.current = false
      const p = mapa.getPitch()
      const quiere = tresDRef.current ? p >= 20 : p > 15
      if (quiere !== tresDRef.current && onTresDRef.current) {
        tresDPorGestoRef.current = true
        onTresDRef.current(quiere)
      } else if (!tresDRef.current && p > 0.5) inclinar(mapa, 0, 0)
    }
    mapa.on('pitchend', alSoltarInclinacion)

    /**
     * Si el jugador mueve el mapa con la mano, "seguirme" se apaga. Sólo
     * gestos con `originalEvent`: los movimientos que hace el propio
     * código (seguir, encuadrar) no cuentan, o se apagaría solo.
     */
    const alTocar = (evento: { originalEvent?: unknown }) => {
      if (evento.originalEvent) {
        if ((evento as { type?: string }).type === 'pitchstart') inclinandoConDedoRef.current = true
        // Tocar el mapa corta la celebración y se queda donde estás mirando.
        cortarCelebracionRef.current?.()
        calentadoRef.current?.cancelar(false)
        gestoRef.current = true
        onUserMapMoveRef.current?.()
      }
    }
    const alSoltar = () => {
      gestoRef.current = false
    }
    mapa.on('moveend', alSoltar)
    mapa.on('dragstart', alTocar)
    mapa.on('zoomstart', alTocar)
    mapa.on('rotatestart', alTocar)
    mapa.on('pitchstart', alTocar)

    document.addEventListener('visibilitychange', vigilarEstilo)
    // 14/11: con la pantalla oculta no hay nadie a quien vigilarle el estilo: se para y, al volver, comprueba al momento.
    const relojVigilante = cadaMientrasVisible(vigilarEstilo, 4000)

    /**
     * Al acabar cada movimiento, la altura del centro = la del terreno ahí.
     *
     * Medido en el móvil simulado: tras "ver la ruta" (centro en un alto,
     * 943 m con la exageración) y volver a ti (886 m), MapLibre dejaba la
     * cámara con la altura del centro de antes. El centro estaba en tus
     * coordenadas, pero tú salías 100 px más abajo: "centra, pero se mueve
     * más hacia arriba de más". Con la altura corregida quedas en el centro
     * exacto. Si ya coincide (lo normal), no se toca nada.
     */
    mapa.on('moveend', () => {
      if (!mapa.getTerrain()) return
      const real = mapa.queryTerrainElevation(mapa.getCenter())
      if (real == null || !Number.isFinite(real)) return
      if (Math.abs(mapa.getCenterElevation() - real) > 2) mapa.setCenterElevation(real)
    })

    /** El toque que abrió una foto: la foto va ENCIMA de los jugadores, así que ese toque no abre además su ficha. */
    let toqueDeFoto: unknown = null
    mapa.on('click', CAPA_FOTOS, (evento) => {
      const props = evento.features?.[0]?.properties as { grupo?: number; id?: string | number } | undefined
      if (!props || typeof props.grupo !== 'number') return
      fotoTocadaRef.current = true
      toqueDeFoto = evento.originalEvent ?? null
      // Se abren TODAS las de ese sitio -en un nodo suele haber varias y el
      // visor ya sabe pasarlas-, empezando por la que se ha tocado.
      const grupo = gruposFotosRef.current[props.grupo] || []
      const tocada = grupo.findIndex((foto) => String(foto.id) === String(props.id))
      const ordenadas = tocada > 0 ? [...grupo.slice(tocada), ...grupo.slice(0, tocada)] : grupo
      if (ordenadas.length) abrirFotosRef.current?.(ordenadas)
    })
    mapa.on('click', CAPA_FOTOS_PILA, (evento) => {
      const props = evento.features?.[0]?.properties as { grupo?: number; id?: string | number } | undefined
      if (!props || typeof props.grupo !== 'number') return
      fotoTocadaRef.current = true
      toqueDeFoto = evento.originalEvent ?? null
      // Se abren TODAS las de ese sitio -en un nodo suele haber varias y el
      // visor ya sabe pasarlas-, empezando por la que se ha tocado.
      const grupo = gruposFotosRef.current[props.grupo] || []
      const tocada = grupo.findIndex((foto) => String(foto.id) === String(props.id))
      const ordenadas = tocada > 0 ? [...grupo.slice(tocada), ...grupo.slice(0, tocada)] : grupo
      if (ordenadas.length) abrirFotosRef.current?.(ordenadas)
    })
    /**
     * Tocar a un compañero (o a un grupo): la tarjeta oscura, anclada a su
     * posición REAL. El contenido se rehace al abrir (la distancia y el «hace
     * 2 min» cambian).
     */
    // Cualquier toque corta la celebración (los gestos con mano ya lo hacen por `alTocar`).
    // Y despierta el pulso del tramo unos segundos (auditoría 23/10: ya no late sin parar).
    const alPulsar = () => {
      cortarCelebracionRef.current?.()
      despertarPulso()
    }
    mapa.on('touchstart', alPulsar)
    mapa.on('mousedown', alPulsar)
    /**
     * Tocar un avatar 3D (el tuyo o el de un compañero). Se mide en pantalla (`tocado`), no con el hueco del
     * símbolo: MapLibre lo alza 3 m y, con el cuerpo de 30-60 px, tocar el cuerpo no daba en él. Va ANTES de los
     * toques por capa, que se saltan este mismo toque.
     */
    let toqueDeAvatar: unknown = null
    const abrirPopupDe = (el: ElementoDeMapa) => {
      fotoTocadaRef.current = true
      popupOtrosRef.current?.remove()
      popupOtrosRef.current = null
      // Un jugador suelto: su ficha (hoja inferior). Un grupo: la lista, y cada nombre abre su ficha.
      if (el.tipo === 'jugador') {
        // Como «Ver en el mapa»: deja de seguirte (si no, la cámara vuelve a ti con el siguiente punto del GPS)
        // y lo deja encima de su ficha.
        onUserMapMoveRef.current?.()
        encuadrandoRef.current = encuadrarJugador(mapa, el)
        fichaUltimaRef.current = el.jugadores[0] ?? null
        setFichaDe(el.clave)
        return
      }
      encuadrandoRef.current = false
      const ventana = new maplibregl.Popup({ offset: 26, closeButton: false, maxWidth: '300px' })
      ventana.on('open', () =>
        ventana.setDOMContent(
          contenidoPopupGrupo(
            el.jugadores,
            () => ventana.remove(),
            (j) => {
              ventana.remove()
              fichaUltimaRef.current = j
              setFichaDe(claveDeJugador(j))
            }
          )
        )
      )
      ventana.setLngLat([el.lon, el.lat]).addTo(mapa)
      popupOtrosRef.current = ventana
    }
    mapa.on('click', (evento) => {
      if (debugRef.current.activo) return
      if (toqueDeFoto !== null && toqueDeFoto === evento.originalEvent) return
      const clave = avataresRef.current?.tocado(evento.point.x, evento.point.y)
      if (!clave) return
      toqueDeAvatar = evento.originalEvent ?? null
      if (clave === CLAVE_YO) {
        fotoTocadaRef.current = true
        window.dispatchEvent(new CustomEvent(EVENTO_MENU_DE_GESTOS))
        return
      }
      const el = elementosOtrosRef.current.find((x) => x.clave === clave)
      if (el) abrirPopupDe(el)
      // 24/10: el que tocas se gira hacia ti y hace un gesto alegre (sólo en tu mapa).
      avataresRef.current?.reaccionarAlToque(clave)
    })
    // Tocarte a ti mismo: el selector de personaje (en modo prueba el toque coloca al jugador).
    mapa.on('click', CAPA_JUGADOR, (evento) => {
      if (debugRef.current.activo) return
      if (toqueDeAvatar !== null && toqueDeAvatar === evento.originalEvent) return
      if (toqueDeFoto !== null && toqueDeFoto === evento.originalEvent) return
      fotoTocadaRef.current = true
      // Con tu avatar 3D a la vista, el menú de gestos; si no, directo a la tienda de ropa.
      window.dispatchEvent(
        new CustomEvent(avataresRef.current?.enTresD().has(CLAVE_YO) ? EVENTO_MENU_DE_GESTOS : EVENTO_ELEGIR_PERSONAJE)
      )
    })
    // 11/11: el aro que late en tu retrato cambia de tamaño con el zoom y la perspectiva.
    mapa.on('move', () => ponerPulsoPropioRef.current())
    mapa.on('mouseenter', CAPA_JUGADOR, () => {
      if (!debugRef.current.activo) mapa.getCanvas().style.cursor = 'pointer'
    })
    mapa.on('mouseleave', CAPA_JUGADOR, () => {
      mapa.getCanvas().style.cursor = debugRef.current.activo ? 'crosshair' : ''
    })
    /**
     * Al destapar el mapa (se cierra una hoja, vuelve la pantalla): se
     * redibujan los muñecos donde toca AHORA y se empieza la celebración que
     * estuviera esperando.
     */
    const dejarDeVigilarMovil = alCambiarCoberturaDelMapa((cubierto) => {
      if (cubierto) return
      // Tapado no se seguía (revisión 19/10 de batería): al destapar, la cámara salta a ti sin animar.
      const yo = yoRef.current.posicion(performance.now())
      if (yo && followPlayerRef.current && !gestoRef.current && performance.now() >= retenerSeguimientoRef.current) {
        mapa.jumpTo({ center: [yo.lon, yo.lat] })
      }
      movilRef.current?.dibujar()
      movilRef.current?.arrancar()
      // 19/11: la hoja del juego aún se está yendo al destapar y se comía el principio del pulso: se espera a que acabe.
      window.setTimeout(() => {
        if (!mapaCubierto()) celebrarRef.current?.()
      }, 450)
    })
    const alVolver = () => {
      if (document.visibilityState !== 'visible') return
      movilRef.current?.dibujar()
      movilRef.current?.arrancar()
    }
    document.addEventListener('visibilitychange', alVolver)
    // Un rumbo caduca solo al quedarte quieto: se repasa de vez en cuando (no pinta si no cambia nada).
    const relojRumbo = cadaMientrasVisible(() => {
      if (!mapaCubierto()) movilRef.current?.dibujar()
    }, 3000)

    mapa.on('click', CAPA_OTROS, (evento) => {
      if (toqueDeAvatar !== null && toqueDeAvatar === evento.originalEvent) return
      if (toqueDeFoto !== null && toqueDeFoto === evento.originalEvent) return
      const props = evento.features?.[0]?.properties as { idx?: number } | undefined
      const el = props && typeof props.idx === 'number' ? elementosOtrosRef.current[props.idx] : undefined
      if (!el) return
      abrirPopupDe(el)
    })
    // 16/11: tocar un clúster de nodos acerca el mapa a sus límites (sin tocar la ficha de un nodo suelto).
    const alTocarCluster = (evento: maplibregl.MapLayerMouseEvent) => {
      // 20/11: poste y moneda 2D están siempre maquetados; sólo vale el toque en la capa que se ve.
      const capa = evento.features?.[0]?.layer?.id
      if (capa && mapa.getPaintProperty(capa, 'icon-opacity') === 0) return
      const id = (evento.features?.[0]?.properties as { grupoId?: string } | undefined)?.grupoId
      const g = id ? gruposDeNodosRef.current.get(id) : undefined
      if (!g) return
      fotoTocadaRef.current = true
      const limites = new maplibregl.LngLatBounds()
      for (const p of g.puntos) limites.extend(p)
      mapa.fitBounds(limites, { padding: 90, maxZoom: 15.5, duration: 600 })
    }
    mapa.on('click', CAPA_NODOS_ICONOS, alTocarCluster)
    mapa.on('click', CAPA_NODOS_MONEDAS_2D, alTocarCluster)
    mapa.on('mouseenter', CAPA_OTROS, () => {
      mapa.getCanvas().style.cursor = 'pointer'
    })
    mapa.on('mouseleave', CAPA_OTROS, () => {
      mapa.getCanvas().style.cursor = debugRef.current.activo ? 'crosshair' : ''
    })
    mapa.on('mouseenter', CAPA_FOTOS, () => {
      mapa.getCanvas().style.cursor = 'pointer'
    })
    mapa.on('mouseleave', CAPA_FOTOS, () => {
      mapa.getCanvas().style.cursor = debugRef.current.activo ? 'crosshair' : ''
    })

    /**
     * Toque en el mapa. Va DESPUÉS de los de las fotos (mismo orden de
     * registro = mismo orden de disparo), que levantan `fotoTocadaRef`.
     *
     * - Modo prueba: coloca al jugador donde se toca. Es el recurso que
     *   siempre está disponible cuando no hay GPS.
     * - Si no: un toque sobre el nodo actual (o dentro de su radio de
     *   entrada) avisa a `onNodeTap`. Se mide en píxeles con `project`, sin
     *   `queryRenderedFeatures` (no vale en algunos móviles con relieve).
     */
    mapa.on('click', (evento) => {
      if (fotoTocadaRef.current) {
        fotoTocadaRef.current = false
        return
      }
      const { activo, alPosicionar, alNodo } = debugRef.current
      if (activo) {
        alPosicionar?.({ lat: evento.lngLat.lat, lon: evento.lngLat.lng })
        return
      }
      const etapa = etapaActualRef.current
      if (!alNodo || !etapa || etapa.lat == null || etapa.lon == null) return
      if (String(etapa.kind || '') === 'mapa_mudo') return
      const punto = mapa.project([etapa.lon, etapa.lat])
      const metrosPorPixel =
        (156543.03392 * Math.cos((etapa.lat * Math.PI) / 180)) / Math.pow(2, mapa.getZoom())
      const radio = typeof etapa.radius === 'number' && etapa.radius > 0 ? etapa.radius : 30
      const umbral = Math.max(36, radio / metrosPorPixel)
      // 7/11: y tocando su moneda donde se dibuja (puede ir apartada en arco); con postes, la moneda va arriba del poste.
      const sitio = sitioDelActualRef.current
      const enSuSitio = sitio ? mapa.project([sitio.lon, sitio.lat]) : null
      const tam = tamanoDeNodoPx(mapa.getZoom())
      const dx = enSuSitio ? Math.abs(evento.point.x - enSuSitio.x) : Infinity
      const dy = enSuSitio ? enSuSitio.y - evento.point.y : Infinity
      const enSuMoneda = monedasRef.current
        ? Math.hypot(dx, dy) <= Math.max(36, tam.ancho * 0.6)
        : dx <= Math.max(36, tam.ancho * 0.75) && dy >= -12 && dy <= tam.alto * 1.3
      if (Math.hypot(evento.point.x - punto.x, evento.point.y - punto.y) <= umbral || enSuMoneda) alNodo()
    })

    if (
      new URLSearchParams(window.location.search).has('depurar-mapa') ||
      // El banco de pruebas SIEMPRE necesita el asa: es su razón de ser, y
      // pedírsela por parámetro llegaba tarde -los efectos del hijo corren
      // antes que los del padre, así que el mapa miraba la dirección antes
      // de que el banco hubiera podido escribir el parámetro-.
      window.location.pathname === '/banco-mapa'
    ) {
      /**
       * Asa de depuración, solo con `?depurar-mapa=1` en la dirección.
       *
       * MapLibre no deja ninguna referencia al mapa accesible desde el
       * DOM, así que comprobar desde fuera si el terreno está puesto o qué
       * capas hay era imposible y se estaba verificando a ojo. Que es
       * exactamente como se colaron los fallos de esta pantalla.
       *
       * No se expone nunca por defecto: es una puerta abierta al mapa.
       */
      const ventana = window as unknown as {
        __sagaMapa?: maplibregl.Map
        __sagaEstilo?: () => maplibregl.StyleSpecification
        __sagaPos?: () => unknown
        __sagaLigero?: LigeroDelMapa
      }
      ventana.__sagaMapa = mapa
      ventana.__sagaLigero = ligero
      // 23/11: sólo con `?depurar-mapa`: dónde está cada uno según la única fuente de posición (real, dibujo, rumbo).
      if (new URLSearchParams(window.location.search).has('depurar-mapa')) {
        ventana.__sagaPos = () => {
          const ahora = performance.now()
          fuenteRef.current.postes = postesRef.current
          ponerSeparacion(fuenteRef.current, mapa, miPosicionRef.current?.lat)
          return Object.fromEntries([...fuenteRef.current.puestos(ahora)].map(([id, p]) => [id, p]))
        }
      }
      // Las lecturas de diagnóstico de la capa 3D (gl.readPixels) sólo se
      // encienden aquí: cada una hace esperar a la GPU y no hacen falta para jugar.
      capaNodosRef.current?.activarDiagnostico(true)
      // El estilo también: en una pestaña que no pinta, MapLibre nunca
      // monta el estilo (espera un fotograma). Con esto se puede forzar
      // desde fuera y medir las capas de datos aunque nadie mire.
      ventana.__sagaEstilo = estiloDelMapa
      ;(window as unknown as { __sagaNodos3D?: () => unknown }).__sagaNodos3D = () => capaNodosRef.current?.estadisticas()
      ;(window as unknown as { __sagaCapa3D?: () => unknown }).__sagaCapa3D = () => capaNodosRef.current?.interno()
      ;(window as unknown as { __sagaAvatares?: () => unknown }).__sagaAvatares = () => avataresRef.current
      // La celebración de verdad (de un nivel al siguiente), para el banco.
      ;(window as unknown as { __sagaCelebrar?: (a: number, b: number) => boolean }).__sagaCelebrar = (previo, actual) => {
        const plan = decidirCelebracion({ previo, actual, totalNodos: totalNodosRef.current, reducido: false, siguienteEsMapaMudo: false, mapaListo: true })
        if (!plan) return false
        pendienteCelebrarRef.current = { plan, desde: performance.now() }
        celebrarRef.current?.()
        return true
      }
    }

    return () => {
      dejarDeOirLaRed?.()
      pulsoVivo = false
      dejarDeVigilarCobertura()
      dejarDeVigilarMovil()
      document.removeEventListener('visibilitychange', alVolver)
      relojRumbo()
      window.removeEventListener('saga:red-ok', alVolverLaRedCaras)
      mapa.off('touchstart', alPulsar)
      mapa.off('mousedown', alPulsar)
      celebracionRef.current.cancelar()
      window.clearTimeout(esperarPintado)
      mapa.off('idle', alPintarse)
      mapa.off('rotate', alGirar)
      mapa.off('rotateend', alGirarLaVista)
      mapa.off('pitchend', alGirarLaVista)
      mapa.off('moveend', alGirarLaVista)
      mapa.off('pitch', alInclinar)
      mapa.off('pitchend', alSoltarInclinacion)
      mapa.off('zoomend', alZoom)
      mapa.off('moveend', alSoltar)
      mapa.off('dragstart', alTocar)
      mapa.off('zoomstart', alTocar)
      mapa.off('rotatestart', alTocar)
      mapa.off('pitchstart', alTocar)
      mapa.off('styledata', volcarPendientes)
      document.removeEventListener('visibilitychange', vigilarEstilo)
      relojVigilante()
      marcadoresNodosRef.current.forEach((marcador) => marcador.remove())
      marcadoresNodosRef.current = []
      popupOtrosRef.current?.remove()
      popupOtrosRef.current = null
      // Los marcadores del DOM de los jugadores (abanicos y el aro de tu retrato) se van con su mapa.
      abanicosRef.current?.quitar()
      firmaAbanicosRef.current = ''
      pulsoPropioRef.current?.marcador.remove()
      pulsoPropioRef.current = null
      ligero.destruir()
      mapa.remove()
      mapaRef.current = null
    }
    // Solo al montar, a propósito.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** Cambia los datos de una fuente, si el mapa está en condiciones. */
  /**
   * Cambia los datos de una fuente, y si no puede, se acuerda.
   *
   * ESTE era el fallo que se llevó media docena de versiones. La línea
   * anterior era `fuente?.setData(datos)`: si el estilo todavía no había
   * terminado de montarse, `getSource` devolvía nada, la interrogación se
   * tragaba la llamada y NO SE REINTENTABA JAMÁS. Los nodos llegan de la
   * API en menos de lo que tarda el estilo en montar, así que el trazado,
   * el radio y los volúmenes se perdían casi siempre.
   *
   * Y el síntoma engañaba: las teselas y el relieve se veían -van
   * declarados en el estilo, no necesitan que nadie les meta datos- y los
   * nodos y las fotos también -son marcadores del DOM-. Lo único que
   * faltaba era lo que hay que rellenar después. Sin un solo error.
   *
   * Ahora lo último de cada fuente se guarda siempre, y se vuelca en
   * cuanto el estilo está en condiciones.
   */
  const pintarFuente = useCallback(
    (id: string, datos: GeoJSON.FeatureCollection | typeof COLECCION_VACIA) => {
      ultimoDatoRef.current.set(id, datos as GeoJSON.FeatureCollection)
      const mapa = mapaRef.current
      if (!mapa) return
      const fuente = mapa.getSource(id) as maplibregl.GeoJSONSource | undefined
      if (!fuente) return
      const coleccion = datos as GeoJSON.FeatureCollection
      const json = JSON.stringify(coleccion)
      const previo = aplicadoRef.current.get(id)
      // Lo mismo otra vez (el efecto se rehace al refrescar la misión): no se toca.
      if (previo && previo.fuente === fuente && previo.json === json) {
        previo.datos = coleccion
        return
      }
      aplicadoRef.current.set(id, { fuente, datos: coleccion, json })
      fuente.setData(coleccion)
      verSoloConDatos(mapa, id, coleccion)
    },
    // `versionEstilo` no se usa dentro, pero al cambiar obliga a repintar
    // tras un rescate del estilo, que es justo lo que hace falta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [versionEstilo]
  )

  /**
   * El estado `tresD` de cada punto (tú y los demás) = lo que la capa de avatares pinta en 3D. Sólo se toca lo que
   * cambia, y se rehace entero si la fuente es otra (rescate del estilo). Va por el hilo principal: el mapa lo
   * aplica en su siguiente fotograma, el mismo en que la capa enciende o apaga el cuerpo.
   */
  const estadoTresDRef = useRef<{ fuentes: Map<string, unknown>; valores: Map<string, number> }>({
    fuentes: new Map(),
    valores: new Map(),
  })
  /**
   * 11/11 (Óscar: «el mío que parpadee, para diferenciarse del resto»): un aro de tu color que late alrededor de TU
   * retrato. Es un marcador del DOM con una animación CSS (opacidad y escala: las compone el navegador), NO una
   * propiedad del estilo: un `setPaintProperty` por latido repintaría el terreno entero (ver `latir`). Sólo con
   * retrato: con tu cuerpo 3D puesto se esconde. Mide lo que el círculo del retrato a este zoom y con su perspectiva.
   */
  const ponerPulsoPropio = useCallback(() => {
    const mapa = mapaRef.current
    const sitio = sitioPulsoRef.current
    let p = pulsoPropioRef.current
    if (p && p.mapa !== mapa) {
      p.marcador.remove()
      p = pulsoPropioRef.current = null
    }
    if (!mapa || !sitio || enTresDRef.current.has(CLAVE_YO)) {
      if (p) p.el.style.display = 'none'
      return
    }
    if (!p) {
      const el = document.createElement('div')
      el.className = 'saga-yo-pulso'
      el.setAttribute('aria-hidden', 'true')
      el.appendChild(document.createElement('span'))
      const marcador = new maplibregl.Marker({ element: el, anchor: 'center', pitchAlignment: 'viewport', rotationAlignment: 'viewport' })
      marcador.setLngLat([sitio.lon, sitio.lat]).addTo(mapa)
      p = pulsoPropioRef.current = { marcador, el, mapa }
    } else p.marcador.setLngLat([sitio.lon, sitio.lat])
    const k = mapa.getPitch() > 1 ? escalaDePerspectiva(mapa, sitio) : 1
    const lado = `${Math.round(50 * tamanoJugador(mapa.getZoom()) * k)}px`
    p.el.style.display = ''
    if (p.el.style.width !== lado) p.el.style.width = p.el.style.height = lado
    if (p.el.style.color !== miColorRef.current) p.el.style.color = miColorRef.current
  }, [])
  ponerPulsoPropioRef.current = ponerPulsoPropio

  const sincronizarTresD = useCallback(() => {
    ponerPulsoPropio()
    const mapa = mapaRef.current
    if (!mapa) return
    const memo = estadoTresDRef.current
    const claves: [string, string][] = [[FUENTE_JUGADOR, CLAVE_YO], ...basesOtrosRef.current.map((b): [string, string] => [FUENTE_OTROS, b.clave])]
    for (const id of [FUENTE_JUGADOR, FUENTE_OTROS]) {
      const fuente = mapa.getSource(id)
      if (memo.fuentes.get(id) !== fuente) {
        memo.fuentes.set(id, fuente)
        for (const k of [...memo.valores.keys()]) if (k.startsWith(id + '|')) memo.valores.delete(k)
      }
    }
    const enTresD = enTresDRef.current
    const capa = avataresRef.current
    for (const [fuente, clave] of claves) {
      if (!memo.fuentes.get(fuente)) continue
      // 24/11: 0-1, cuánto se ve el cuerpo en el fundido con el retrato (el retrato se pinta con 1 − esto: OPACIDAD_SIN_TRES_D).
      const valor = Math.round((capa ? capa.mezcla(clave) : enTresD.has(clave) ? 1 : 0) * 50) / 50
      const k = fuente + '|' + clave
      if (memo.valores.get(k) === valor) continue
      try {
        mapa.setFeatureState({ source: fuente, id: clave }, { tresD: valor })
        memo.valores.set(k, valor)
      } catch {
        // Estilo a medio montar: se repite en el siguiente dibujo.
      }
    }
  }, [ponerPulsoPropio])

  /**
   * Dibuja a todos en su posición DE AHORA (la interpolada entre fixes) y
   * dice si alguno sigue deslizándose. `pintarFuente` no toca el mapa si los
   * datos no han cambiado, así que llamarla de más sale gratis.
   */
  const dibujarMovil = useCallback((): boolean => {
    const ahora = performance.now()
    const fuente = fuenteRef.current
    fuente.postes = postesRef.current
    ponerSeparacion(fuente, mapaRef.current, miPosicionRef.current?.lat)
    fuente.calcular(ahora)
    const yo = yoRef.current
    const posYo = yo.posicion(ahora)
    /**
     * Revisión 19/10 de batería: con tu cuerpo 3D puesto, tu punto del mapa es invisible (estado `tresD`) y
     * sólo sirve para tocarte; rehacer su fuente 15-30 veces por segundo andando era trabajo del worker para
     * nada. Ahí se rehace a ~2 por segundo (y siempre al pararte o al salir del 3D). El cuerpo lo coloca la
     * capa three.js con tu posición de cada fotograma.
     */
    const puntoPropioAlDia =
      posYo !== null && enTresDRef.current.has(CLAVE_YO) && yo.enMovimiento(ahora) && ahora - ultimoPuntoPropioRef.current < 500
    if (puntoPropioAlDia) {
      // Nada: se rehace en el siguiente medio segundo.
    } else if (!posYo) {
      pintarFuente(FUENTE_JUGADOR, COLECCION_VACIA)
      sitioPulsoRef.current = null
    } else {
      ultimoPuntoPropioRef.current = ahora
      // 7/11: tu retrato, apartado de la moneda del nodo (el punto del mapa y su aro van juntos).
      // 23/11: sin apartado: tu retrato, tu aro y tu cuerpo están SIEMPRE en tu posición filtrada (`dibujo(yo) = real(yo)`).
      const sitioPropio = posYo
      sitioPulsoRef.current = sitioPropio
      // Para el latido: los demás te ven mirando hacia donde vas.
      anotarRumboPropio(yo.rumbo(ahora), ahora)
      // Tu foto de perfil en el retrato: en la vista 2D y también en la 3D cuando el zoom lejano te pasa a retrato.
      const miFoto = urlDeFotoValida(miFotoRef.current) ? miFotoRef.current : null
      pintarFuente(FUENTE_JUGADOR, {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            // Los datos son los mismos vayas en 3D o en retrato: lo que cambia es el estado `tresD` del punto
            // (`sincronizarTresD`), que apaga retrato, aro y aura en el MISMO fotograma en que se enciende el cuerpo.
            properties: {
              fid: CLAVE_YO,
              aura: auraRef.current,
              // Tu foto (2D, o 3D lejos); sin ella, la cara de tu personaje.
              icono: miFoto
                ? idDeRetratoConFoto(miFoto, miAspectoRef.current.mx, miColorRef.current)
                : idDeRetrato(miAspectoRef.current.mx, miColorRef.current),
              // 11/11 (Óscar: «solamente su círculo con su foto»): el retrato ya no lleva aro ni flecha en el suelo
              // (capa CAPA_SUELO_JUGADOR sin datos). El cuerpo 3D pinta su propio aro en la capa de avatares.
            },
            geometry: { type: 'Point', coordinates: [sitioPropio.lon, sitioPropio.lat] },
          },
        ],
      })
    }
    let moviendose = yo.enMovimiento(ahora)
    // 7/11: los del abanico no se pintan sueltos (ni retrato ni aro): los enseña el abanico. 23/11: quién va al abanico
    // (los que no caben junto al poste) lo decide la fuente de posición, con la geografía de ahora.
    {
      const abanicos = new Map<string, Abanico>()
      const lejos = lejosRef.current ?? false
      for (const base of basesOtrosRef.current) {
        const ab = lejos ? null : fuente.abanico(base.clave)
        if (!ab || !base.mx || !base.color) continue
        const a = abanicos.get(ab.id) ?? { id: ab.id, lat: ab.lat, lon: ab.lon, miembros: [] }
        a.miembros.push({ clave: base.clave, mx: base.mx, color: base.color, foto: base.foto ?? undefined })
        abanicos.set(a.id, a)
      }
      const firma = JSON.stringify([...abanicos.values()].map((a) => [a.id, a.miembros.map((m) => m.clave)]))
      if (firma !== firmaAbanicosRef.current) {
        firmaAbanicosRef.current = firma
        enAbanicoRef.current = new Set([...abanicos.values()].flatMap((a) => a.miembros.map((m) => m.clave)))
        abanicosRef.current ??= crearAbanicos()
        abanicosRef.current.poner(mapaRef.current, [...abanicos.values()], getLocale())
        ultimosOtrosRef.current = { en: 0, claves: '' }
      }
    }
    const enAbanico = enAbanicoRef.current
    const enTresD = enTresDRef.current
    /** Se mueve alguien cuyo retrato se VE (no va en 3D): entonces su punto va a la cadencia normal. */
    let sueltoMoviendose = false
    const features = basesOtrosRef.current.filter((base) => !enAbanico.has(base.clave)).map((base) => {
      const pos = fuente.dibujo(base.clave, ahora) ?? { lat: base.lat, lon: base.lon }
      if (fuente.moviendose(base.clave, ahora)) {
        moviendose = true
        if (!enTresD.has(base.clave)) sueltoMoviendose = true
      }
      const propiedades: Record<string, unknown> = { ...base.props, fid: base.clave }
      // Un salto de verdad (más de 300 m: llegó de golpe tras un corte) se funde en ~0,5 s en vez de aparecer de golpe.
      const fundido = fuente.desvanecer(base.clave, ahora)
      if (fundido < 1) propiedades.opacidad = Number(base.props.opacidad ?? 1) * fundido
      // Retrato (vista 2D, o 3D con el zoom lejano): cada uno con SU foto de perfil. En 3D es el mismo punto con el
      // estado `tresD` (opacidad 0, sigue tocable): su cuerpo lo pinta la capa three.js, en el mismo corro.
      if (base.foto && base.mx) propiedades.icono = idDeRetratoConFoto(base.foto, base.mx, base.color ?? '#3b82f6')
      // 11/11: sin aro ni flecha en el suelo bajo el retrato (sólo su círculo con su foto), igual que el tuyo.
      return {
        type: 'Feature' as const,
        properties: propiedades,
        geometry: { type: 'Point' as const, coordinates: [pos.lon, pos.lat] },
      }
    })
    /**
     * 22/11: como tu punto, los de quien va en 3D (cuerpo o imagen fija) son invisibles (estado `tresD`) y sólo sirven para
     * tocarlos: con 15 jugadores andando, rehacer la fuente ~15 veces por segundo (worker, subida de búferes y colocación
     * de símbolos en cada fotograma) era trabajo para nada. Si sólo se mueven ésos, a ~2 por segundo; siempre al cambiar
     * quién está, al pararse todos o en cuanto se mueve alguien que se ve en retrato.
     */
    const ultimos = ultimosOtrosRef.current
    const claves = features.map((f) => f.properties.fid).join('|')
    if (!moviendose || sueltoMoviendose || claves !== ultimos.claves || ahora - ultimos.en >= 500) {
      ultimosOtrosRef.current = { en: ahora, claves }
      pintarFuente(FUENTE_OTROS, { type: 'FeatureCollection', features })
    }
    sincronizarTresD()
    return moviendose
  }, [pintarFuente, sincronizarTresD])

  /**
   * El bucle del deslizamiento: a ~15 dibujos por segundo y SÓLO mientras
   * alguien se está moviendo. Quieto, no hay bucle ni `setData`. Sólo toca
   * fuentes de símbolos (no se dibujan sobre el terreno), nunca una
   * `setPaintProperty`, y se para con la pestaña oculta o con algo tapando el
   * mapa (ver hooks/useCubreElMapa.ts); al destapar se reanuda.
   */
  const arrancarBucle = useCallback(() => {
    if (bucleActivoRef.current) return
    bucleActivoRef.current = true
    let ultimo = 0
    const paso = (t: number) => {
      if (!mapaRef.current || document.visibilityState !== 'visible' || mapaCubierto()) {
        bucleActivoRef.current = false
        return
      }
      if (t - ultimo >= intervaloDeDibujoMs(mapaRef.current.getZoom())) {
        ultimo = t
        if (!dibujarMovil()) {
          bucleActivoRef.current = false
          return
        }
      }
      window.requestAnimationFrame(paso)
    }
    window.requestAnimationFrame(paso)
  }, [dibujarMovil])
  movilRef.current = { dibujar: dibujarMovil, arrancar: arrancarBucle }
  sincronizarTresDRef.current = sincronizarTresD

  /**
   * Los avatares 3D: un complemento de la capa three.js de los nodos. Se carga
   * aparte (y sus modelos salen de la caché del móvil, nunca de la red): si algo
   * falla, el mapa sigue con los retratos redondos.
   */
  useEffect(() => {
    const capaNodos = capaNodosRef.current
    if (!capaNodos || sinWebGL) return undefined
    capaNodos.dibujarNodos(false)
    // 25/10: la silueta de cada nodo en la profundidad, para que un cuerpo que está DETRÁS quede tapado (ocultarTrasNodos.ts).
    const quitarOcultadores = capaNodos.anadirComplemento(
      crearOcultadoresDeNodos({ capaIconos: CAPA_NODOS_ICONOS, capaMoneda: CAPA_NODOS_MONEDA, alturaM: ALTURA_NODOS_M })
    )
    return () => quitarOcultadores()
  }, [sinWebGL])
  useEffect(() => {
    const capaNodos = capaNodosRef.current
    // 22/11: los cuerpos (lo más caro del mapa) cuando el mapa ya está pintado y colocado, no compitiendo con el arranque.
    if (!capaNodos || sinWebGL || !mapaListo) return undefined
    let cancelado = false
    let quitar: (() => void) | null = null
    const lista: JugadorAvatar[] = []
    void import('../avatares3d/mixamo/capaAvatares')
      .then((m) => {
        if (cancelado) return
        const comp = m.crearComplementoDeAvatares({
          proveedor: () => {
            lista.length = 0
            const ahora = performance.now()
            const fuente = fuenteRef.current
            fuente.postes = postesRef.current
            ponerSeparacion(fuente, mapaRef.current, miPosicionRef.current?.lat)
            fuente.calcular(ahora)
            // 23/11: la capa sólo lee `dibujo` (tú: tu real filtrado, sin apartado) y no suma nada.
            const gps = fuente.real(CLAVE_YO, ahora)
            if (gps) {
              lista.push({ clave: CLAVE_YO, lat: gps.lat, lon: gps.lon, rumbo: yoRef.current.rumbo(ahora), real: gps, aspecto: miAspectoRef.current, esYo: true, color: miColorRef.current })
            }
            for (const base of basesOtrosRef.current) {
              if (!base.aspecto) continue
              const real = fuente.real(base.clave, ahora) ?? { lat: base.lat, lon: base.lon }
              const p = fuente.dibujo(base.clave, ahora) ?? real
              // Su cuerpo mira hacia donde apunta SU móvil; si no lo manda, hacia donde anda (un solo cálculo: la fuente).
              lista.push({ clave: base.clave, lat: p.lat, lon: p.lon, rumbo: fuente.rumbo(base.clave, ahora), real, aspecto: base.aspecto, esYo: false, color: base.color ?? '#3b82f6', tenue: Number(base.props.opacidad) < 1 })
            }
            return lista
          },
          alCambiar: (tresD) => {
            enTresDRef.current = tresD
            // Quien sale del 3D vuelve a su retrato: que su punto se rehaga ya (ver `dibujarMovil`).
            ultimosOtrosRef.current = { en: 0, claves: '' }
            // Quien pasa a 3D apaga su retrato, su aro y su aura (estado del punto, sin rehacer datos), y al revés.
            sincronizarTresDRef.current()
          },
          pedirFotograma: () => capaNodos.repintar(),
          ocultos: () => enAbanicoRef.current,
          // 24/11: el botón 2D/3D (o soltar un gesto de inclinar) manda: el fundido empieza al pulsar, no cuando llega la cámara.
          vista3D: () => tresDRef.current,
          // El retrato se funde con el cuerpo en el mismo punto (estado `tresD` 0-1 del punto, ver `sincronizarTresD`).
          alMezclar: () => sincronizarTresDRef.current(),
        })
        avataresRef.current = comp
        const quitarComplemento = capaNodos.anadirComplemento(comp)
        // Un modelo que falló (sin red al arrancar, caché a medias) se reintenta al volver la red y cada minuto y medio.
        const reintentar = () => comp.reintentarCarga()
        // 'saga:red-ok' y no 'online' (22/10): los modelos pesan; con la primera barra van antes los avances.
        window.addEventListener('saga:red-ok', reintentar)
        const temporizador = window.setInterval(reintentar, 90000)
        quitar = () => {
          window.removeEventListener('saga:red-ok', reintentar)
          window.clearInterval(temporizador)
          quitarComplemento()
          // Revisión 19/10 de batería: los cuerpos quedaban en memoria de la GPU al quitar la capa.
          comp.liberar()
        }
        aplicarCapaAvataresRef.current?.()
      })
      .catch(() => undefined)
    return () => {
      cancelado = true
      quitar?.()
      avataresRef.current = null
      enTresDRef.current = new Set()
    }
  }, [sinWebGL, mapaListo])

  /**
   * `?depurar-mapa`: la tabla de diagnóstico de los jugadores (3D o retrato y por qué) con «Copiar». Sin el
   * parámetro no se instala nada. Con un conmutador del mapa activo (`?mapa=`) sale siempre, con la sección «Mapa»
   * y el botón «Normal» para quitarlo: que nadie se quede con el mapa cambiado sin saberlo.
   */
  useEffect(() => {
    if (sinWebGL || !debeMostrarseElPanel(organizadorVista)) return undefined
    return instalarPanelDeDepuracion({
      mapa: {
        leer: () => textoDelMapa(mapaRef.current, conmutadoresActivos),
        controles: controlesDeConmutadores(conmutadoresActivos),
      },
      bajarModelos: () => bajarModelosQueFaltan(avataresRef.current),
      leer: () => {
        const mapa = mapaRef.current
        const comp = avataresRef.current
        const diag = comp?.diagnostico()
        const zoom = mapa?.getZoom() ?? 0
        const inclinacion = mapa?.getPitch() ?? 0
        const filas: FilaDeDiagnostico[] = []
        if (miPosicionRef.current) {
          filas.push({
            nombre: 'Tú',
            elegido: null,
            aspecto: miAspectoRef.current.mx,
            tresD: Boolean(diag?.tresD.has(CLAVE_YO)),
            motivo: diag?.motivos.get(CLAVE_YO) ?? 'cargando_modelo',
            esYo: true,
          })
        }
        for (const j of otrosCrudosRef.current || []) {
          const clave = claveDeJugador(j)
          const el = elementosOtrosRef.current.find((x) => x.jugadores.includes(j))
          const presencia = tipoDePresencia(j)
          const aspecto = aspectoDe(j)
          const tresD = Boolean(diag?.tresD.has(el?.clave ?? clave))
          const deCapa = diag?.motivos.get(el?.clave ?? clave)
          filas.push({
            nombre: j.display_name || j.user || '?',
            elegido: typeof j.character_chosen === 'boolean' ? j.character_chosen : null,
            aspecto: aspecto.mx,
            tresD,
            motivo: tresD
              ? null
              : motivoDeRetrato({
                  tienePosicion: typeof j.lat === 'number' && typeof j.lon === 'number',
                  presencia,
                  agrupado: el?.tipo === 'grupo',
                  zoomAlto: zoom >= 16,
                  inclinado: inclinacion >= 20,
                  dentroDePantalla: true,
                  modelo: 'listo',
                  elegido: true,
                  cotaConocida: true,
                }) ?? deCapa ?? 'cargando_modelo',
          })
        }
        return {
          filas,
          resumen: {
            calidad: diag?.calidad ?? '?',
            tope: diag?.tope ?? 0,
            fps: diag?.fps ?? 0,
            zoom,
            inclinacion,
          },
        }
      },
    })
  }, [sinWebGL, organizadorVista])

  // Reenviar al servidor el personaje que se eligió sin cobertura.
  useEffect(() => {
    if (!usuarioYo) return undefined
    void reintentarPendiente(usuarioYo)
    const alVolverLaRed = () => void reintentarPendiente(usuarioYo)
    // 'saga:red-ok' y no 'online' (22/10): sale cuando ya subió la cola de avances, que va antes que esto.
    window.addEventListener('saga:red-ok', alVolverLaRed)
    return () => window.removeEventListener('saga:red-ok', alVolverLaRed)
  }, [usuarioYo])

  // El selector vive en PlayerApp (antes de la carga y desde Herramientas): aquí sólo se
  // recibe lo elegido para verlo al instante, sin esperar al siguiente fix del servidor.
  useEffect(() => {
    const alElegir = (ev: Event) => {
      const detalle = (ev as CustomEvent<unknown>).detail
      const config = normalizarAvatar(detalle)
      if (config) setElegido(config)
    }
    window.addEventListener(EVENTO_PERSONAJE_ELEGIDO, alElegir)
    return () => window.removeEventListener(EVENTO_PERSONAJE_ELEGIDO, alElegir)
  }, [])

  /**
   * Bocadillos sobre las cabezas (5.59): tus mensajes rápidos al momento y los de los demás cuando llegan en la
   * tabla del equipo. Encima de su muñeco 3D si se ve; si va en retrato, encima de su punto.
   */
  const bocadillosRef = useRef<ReturnType<typeof crearBocadillos> | null>(null)
  const reaccionesVistasRef = useRef(new Set<string>())
  const bocadillos = useCallback(() => {
    const mapa = mapaRef.current
    if (!bocadillosRef.current && mapa) {
      bocadillosRef.current = crearBocadillos(mapa.getContainer(), (clave) => {
        const enTresD = avataresRef.current?.cabeza(clave)
        if (enTresD) return enTresD
        const vivo = mapaRef.current
        if (!vivo) return null
        const ahora = performance.now()
        const base = clave === CLAVE_YO ? null : basesOtrosRef.current.find((b) => b.clave === clave)
        const punto =
          clave === CLAVE_YO
            ? yoRef.current.posicion(ahora)
            : base
              ? (fuenteRef.current.dibujo(clave, ahora) ?? base)
              : null
        if (!punto) return null
        const p = vivo.project([punto.lon, punto.lat])
        const caja = vivo.getContainer()
        if (p.x < 0 || p.y < 0 || p.x > caja.clientWidth || p.y > caja.clientHeight) return null
        return { x: p.x, y: p.y - 46 }
      })
    }
    return bocadillosRef.current
  }, [])
  useEffect(() => () => bocadillosRef.current?.quitarTodos(), [])
  useEffect(() => {
    const alMensaje = (ev: Event) => {
      const texto = textoDeMensaje(String((ev as CustomEvent<unknown>).detail), getLocale())
      if (texto) bocadillos()?.mostrar(CLAVE_YO, texto)
    }
    window.addEventListener(EVENTO_MENSAJE, alMensaje)
    return () => window.removeEventListener(EVENTO_MENSAJE, alMensaje)
  }, [bocadillos])

  // Un gesto de tu avatar 3D (el menú que sale al tocarte).
  useEffect(() => {
    const alGesto = (ev: Event) => {
      const clip = (ev as CustomEvent<unknown>).detail
      if (typeof clip === 'string' && clip.startsWith('ge__')) avataresRef.current?.gesto(CLAVE_YO, clip)
    }
    window.addEventListener(EVENTO_GESTO, alGesto)
    return () => window.removeEventListener(EVENTO_GESTO, alGesto)
  }, [])

  // Con el menú de gestos abierto, el mapa sube (margen inferior = alto de la hoja) para que tu muñeco se vea
  // encima de la hoja mientras eliges; al cerrarlo vuelve el margen de antes.
  useEffect(() => {
    // 5.59.2: ya no se cambia el margen ni se recentra (subía tu muñeco hasta casi salirse por arriba). Si la hoja
    // te tapa los pies, el mapa se desliza SÓLO lo que falta para que asomen encima de ella; al cerrar, vuelve.
    let desplazado = 0
    const alHoja = (ev: Event) => {
      const mapa = mapaRef.current
      const alto = Number((ev as CustomEvent<{ alto?: number }>).detail?.alto) || 0
      if (!mapa) return
      if (alto > 0) {
        const yo = yoRef.current.posicion(performance.now())
        if (!yo) return
        const pies = mapa.project([yo.lon, yo.lat]).y
        const limite = mapa.getContainer().clientHeight - alto - 24
        const falta = Math.round(pies - limite)
        if (falta <= 0) return
        desplazado = falta
        mapa.panBy([0, falta], { duration: 320 })
      } else if (desplazado) {
        mapa.panBy([0, -desplazado], { duration: 300 })
        desplazado = 0
      }
    }
    window.addEventListener(EVENTO_HOJA_DE_GESTOS, alHoja)
    return () => window.removeEventListener(EVENTO_HOJA_DE_GESTOS, alHoja)
  }, [])

  // El personaje cambió: se redibuja sin esperar al siguiente fix.
  useEffect(() => {
    dibujarMovil()
  }, [miAspecto.mx, dibujarMovil])

  // Tu posición: te deslizas de un fix al siguiente y caminas hacia donde miras.
  useEffect(() => {
    const color = getPlayerColor(selfProfile || {})
    miColorRef.current = /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : '#3b82f6'
    miFotoRef.current = getPlayerAvatarUrl(selfProfile || {}) || null
    auraRef.current = debugSimulation ? 'debug' : gpsState === 'ready' || gpsState === 'stale' ? 'gps' : 'ninguna'
    const mapa = mapaRef.current

    if (!playerPosition) {
      fuenteRef.current.olvidar(CLAVE_YO)
      yoRef.current = fuenteRef.current.deslizador(CLAVE_YO, 'yo')
      dibujarMovil()
      return
    }
    // Ya llegas filtrado (FiltroGps: descarte, salto imposible y banda muerta): sin una segunda banda muerta aquí.
    fuenteRef.current.fijar(CLAVE_YO, 'yo', { lat: playerPosition.lat, lon: playerPosition.lon }, performance.now(), { precisionM: debugSimulation ? 0.1 : gpsAccuracyRef.current })
    dibujarMovil()
    arrancarBucle()

    // Cuánto del tramo en juego llevas andado (se pinta distinto de lo que queda).
    const tramo = tramoActualRef.current
    if (tramo.length > 1) {
      const clave = String(nivelRef.current)
      const minimo = progresoRutaPrevio.current.clave === clave ? progresoRutaPrevio.current.m : 0
      const nuevo = progresoAndado(tramo, playerPosition, minimo)
      if (nuevo !== progresoRutaPrevio.current.m || progresoRutaPrevio.current.clave !== clave) {
        progresoRutaPrevio.current = { clave, m: nuevo }
        setProgresoRuta({ clave, m: nuevo })
      }
    }

    /**
     * Seguirme, sin tirones.
     *
     * Cada aviso del GPS lanzaba una animación de 600 ms, y como los avisos
     * llegan cada pocos segundos -a veces con el anterior sin terminar-, el
     * mapa iba a sacudidas. Ahora: no se sigue mientras el jugador tiene
     * el mapa en la mano, y sólo se recentra al salir de la caja central
     * (revisión 19/10 de batería, abajo). Durante la celebración de un nodo no se sigue (la cámara vuela al
     * siguiente nodo y se queda un momento enseñándolo).
     */
    // Con una hoja tapando el mapa no se sigue (nadie lo ve): al destapar se salta a ti (ver `dejarDeVigilarMovil`).
    if (followPlayerRef.current && mapa && !gestoRef.current && !mapaCubierto() && performance.now() >= retenerSeguimientoRef.current) {
      // Un encuadre «centrar en mí» pendiente (el modo prueba lo pide al
      // colocarte) va a mover el mapa en este mismo fotograma: seguir además
      // lanzaba dos animaciones seguidas, y la segunda pisaba a la primera.
      const encuadrePendiente =
        focusRequestRef.current?.target === 'player' && ultimoEncuadreRef.current !== focusRequestRef.current.token
      /**
       * Revisión 19/10 de batería: los easeTo encadenados, uno por fix y más largos que el intervalo entre
       * fixes, tenían el mapa entero repintándose a 60 fps todo el rato andando. Ahora la cámara se queda
       * quieta mientras estés en la caja central (20 % del ancho y del alto) y, al salir, un único easeTo
       * corto te vuelve a centrar: andando, el mapa se repinta una vez cada varios pasos.
       */
      const yo = mapa.project([playerPosition.lon, playerPosition.lat])
      const centro = mapa.project(mapa.getCenter())
      const lienzo = mapa.getCanvas()
      const fueraDeLaCaja =
        Math.abs(yo.x - centro.x) > lienzo.clientWidth * 0.1 || Math.abs(yo.y - centro.y) > lienzo.clientHeight * 0.1
      if (encuadrePendiente) {
        ultimoSeguimientoRef.current = { lat: playerPosition.lat, lon: playerPosition.lon }
      } else if (!ultimoSeguimientoRef.current || fueraDeLaCaja) {
        ultimoSeguimientoRef.current = { lat: playerPosition.lat, lon: playerPosition.lon }
        calentadoRef.current?.cancelar(true)
        mapa.easeTo({
          center: [playerPosition.lon, playerPosition.lat],
          duration: 600,
        })
      }
    }
  }, [
    playerPosition?.lat,
    playerPosition?.lon,
    selfProfile?.color,
    selfProfile?.display_name,
    selfProfile?.avatar_ref,
    selfProfile?.avatar_url,
    gpsState,
    debugSimulation,
    dibujarMovil,
    arrancarBucle,
  ])

  // Fuera del trazado la guía sale de ti sin más: sin el aro del GPS/modo
  // prueba alrededor (tu marcador ya lo dice, y el aro quedaba en el suelo,
  // separado del avatar, como un segundo círculo).
  useEffect(() => {
    const mapa = mapaRef.current
    if (!mapa) return
    try {
      if (mapa.getLayer(CAPA_AURA)) {
        mapa.setLayoutProperty(CAPA_AURA, 'visibility', fueraDeTrazado !== null ? 'none' : 'visible')
      }
    } catch {
      // Sin estilo todavía: se aplica en cuanto vuelva a cambiar algo.
    }
  }, [fueraDeTrazado, versionEstilo])

  // Cursor en cruz en modo prueba: se ve que tocar mueve al jugador.
  useEffect(() => {
    const mapa = mapaRef.current
    if (mapa) mapa.getCanvas().style.cursor = debugSimulation ? 'crosshair' : ''
  }, [debugSimulation])

  /**
   * El resto del grupo: el plan de `planDeJugadores` (qué elementos hay: de lejos, grupos con su número; de cerca, uno por
   * jugador, y en la vista 2D racimos de retratos) y las bases que dibujan `dibujarMovil` y la capa de cuerpos.
   * 23/11: DÓNDE se dibuja cada uno (real + apartado del poste) lo decide la fuente de posición, con geografía y sin
   * cámara: aquí sólo se le pasa cada fix (compañeros: banda muerta max(precisión, 12 m) y deslizamiento al ritmo de su
   * latido). Nada de lo que hace la cámara (girar, inclinar, mover, zoom) rehace el plan ni mueve a nadie.
   */
  useEffect(() => {
    miPosicionRef.current = playerPosition ? { lat: playerPosition.lat, lon: playerPosition.lon } : null
    totalNodosRef.current = missionStages?.length || 0
    const ahora = performance.now()
    const fuente = fuenteRef.current
    const zoom = mapaRef.current?.getZoom() ?? zoomActual
    // 20/11: con el zoom REAL, no `zoomActual` (sólo cambia al soltar).
    const lejos = estaLejos(zoom)
    // 24/11: sin racimo de retratos en la vista 2D (lo calculaba en píxeles a z17,5 y movía a cada uno ~26 m al pasar de 3D
    // a 2D): en las dos vistas, cada uno en el `dibujo` de la fuente, que ya separa a las personas con la huella que se ve.
    // 7/11: los nodos, repartidos ANTES de colocar a nadie (`postesRef` = su sitio).
    pintarNodosRef.current()
    const postes = postesRef.current
    fuente.postes = postes
    // Cada compañero en su ancla (banda muerta de la fuente): el plan y el dibujo parten del mismo punto.
    const vivas = new Set<string>([CLAVE_YO])
    const otrosAnclados = (otherPlayers || []).map((j) => {
      if (typeof j.lat !== 'number' || typeof j.lon !== 'number' || j.is_self) return j
      const clave = claveDeJugador(j)
      vivas.add(clave)
      const a = fuente.fijar(clave, 'jugador', { lat: j.lat, lon: j.lon }, ahora, { precisionM: j.accuracy, heading: j.heading })
      return a.lat === j.lat && a.lon === j.lon ? j : { ...j, lat: a.lat, lon: a.lon }
    })
    {
      const firma = JSON.stringify([
        otrosAnclados,
        lejos,
        tresD,
        monedas,
        versionEstilo,
        postes.map((q) => [q.lat.toFixed(6), q.lon.toFixed(6)]),
      ])
      if (firma === firmaPlanRef.current) {
        for (const el of elementosOtrosRef.current) vivas.add(el.clave)
        fuente.podar(vivas)
        dibujarMovil()
        arrancarBucle()
        return
      }
      firmaPlanRef.current = firma
    }
    const plan = planDeJugadores(otrosAnclados, lejos ? zoomDeReparto(zoom) : ZOOM_DEL_REPARTO, { lejos, racimos: false })
    const elementos = plan
    for (const el of elementos) {
      vivas.add(el.clave)
      // Los grupos (de lejos) son elementos con su propia cadena; los sueltos, la suya.
      if (el.tipo === 'grupo') fuente.fijar(el.clave, 'grupo', { lat: el.lat, lon: el.lon }, ahora)
    }
    fuente.podar(vivas)
    elementosOtrosRef.current = elementos
    // 24/11: las líneas finas del racimo de la vista 2D ya no tienen racimo que unir.
    pintarFuente(FUENTE_OTROS_LINEAS, COLECCION_VACIA)
    basesOtrosRef.current = elementos.map((el, idx) => {
      const grupo = el.tipo === 'grupo'
      const j = el.jugadores[0]
      const colorCrudo = grupo ? null : getPlayerColor(j)
      const color = grupo ? null : colorCrudo && /^#[0-9a-f]{6}$/i.test(colorCrudo) ? colorCrudo.toLowerCase() : '#3b82f6'
      return {
        clave: el.clave,
        lat: el.lat,
        lon: el.lon,
        color,
        // Todos se ven como muñeco, también quien no tiene conexión (en su última posición conocida): antes
        // se les quitaba el aspecto y sólo salía su retrato, que es lo que el dueño veía con una compañera parada.
        aspecto: grupo ? null : aspectoDe(j),
        mx: grupo ? null : aspectoDe(j).mx,
        foto: grupo ? null : urlDeFotoValida(getPlayerAvatarUrl(j)) ? getPlayerAvatarUrl(j) : null,
        props: {
          idx,
          icono: grupo ? `otros-grupo-${el.jugadores.length}` : idDeRetrato(aspectoDe(j).mx, color ?? '#3b82f6'),
          // Tú siempre encima (otra capa); entre ellos, los conectados encima.
          orden: (grupo ? 3 : 0) + ordenDePresencia(el.presencia),
          // 15/11: el que lleva rato sin señal («visto hace poco») se ve algo apagado (también su cuerpo 3D, por `tenue`);
          // sin conexión, más. Antes sólo se apagaba quien estaba sin conexión, y un compañero con un hueco de
          // cobertura parecía estar en línea en su último sitio.
          opacidad: el.presencia === 'offline' ? 0.7 : el.presencia === 'recent' ? 0.82 : 1,
        },
      }
    })
    // Lo que acaban de hacer los demás (5.59): su gesto en su muñeco y su mensaje en un bocadillo, una vez cada uno.
    for (const el of elementos) {
      for (const j of el.jugadores) {
        const r = j.reaccion
        if (!r || reaccionesVistasRef.current.has(r.id)) continue
        reaccionesVistasRef.current.add(r.id)
        if (r.edad_s > 40) continue
        if (r.gesto && el.tipo !== 'grupo') avataresRef.current?.gesto(el.clave, r.gesto)
        const texto = r.mensaje ? textoDeMensaje(r.mensaje, getLocale()) : null
        if (texto) bocadillos()?.mostrar(el.clave, el.tipo === 'grupo' ? `${j.display_name}: ${texto}` : texto)
      }
    }
    dibujarMovil()
    arrancarBucle()
  }, [otherPlayers, zoomActual, playerPosition, missionStages?.length, dibujarMovil, arrancarBucle, bocadillos, tresD, pintarFuente, giroDeLaVista, monedas, versionEstilo])

  /**
   * 24/10 (personajes «Con peso»): al ENTRAR en el radio del nodo tu muñeco saluda, una sola vez por nodo (salir y
   * volver a entrar no lo repite, y el festejo de completarlo ya no usa el saludo). En mapa mudo no: su radio llega
   * difuminado y el saludo diría que estás dentro del de verdad.
   */
  const saludadosRef = useRef(new Set<string>())
  useEffect(() => {
    if (!playerPosition || currentStage?.lat == null || currentStage?.lon == null) return
    if (String(currentStage.kind || '') === 'mapa_mudo') return
    const radio = typeof currentStage.radius === 'number' && currentStage.radius > 0 ? currentStage.radius : 30
    const dentro = metrosEntre(playerPosition, { lat: currentStage.lat, lon: currentStage.lon }) <= radio
    if (saludoDeLlegada(saludadosRef.current, String(currentStage.id ?? currentLevel), dentro)) {
      avataresRef.current?.festejar(CLAVE_YO, GESTO_DE_LLEGADA)
    }
  }, [playerPosition, currentStage, currentLevel])

  /**
   * La celebración al completar un nodo (ver avatares/celebracion.ts).
   *
   * Pasa EXACTAMENTE de un nivel al siguiente con el mapa pintado: onda,
   * brillo, chispas e insignia sobre el nodo hecho (1 s) y, después, la cámara
   * vuela a enseñarte el siguiente nodo (1,3 s). Mapa mudo: nunca se vuela a un
   * nodo de posición secreta, y si el nodo hecho era de mapa mudo el festejo se
   * hace sobre TI, no sobre unas coordenadas que podrían no ser las reales.
   * Con «reducir movimiento» sólo hay un destello quieto y sin vuelo. Tocar el
   * mapa la corta en seco; si hay algo tapando el mapa, espera a que lo destapen.
   */
  const empezarCelebracion = useCallback(() => {
    const pendiente = pendienteCelebrarRef.current
    const mapa = mapaRef.current
    if (!pendiente || !mapa) return
    if (performance.now() - pendiente.desde > CADUCA_ESPERANDO_MS) {
      pendienteCelebrarRef.current = null
      return
    }
    if (mapaCubierto()) return
    pendienteCelebrarRef.current = null
    const { plan } = pendiente
    const hecho = (Array.isArray(missionStages) ? missionStages : [])[plan.nodoHecho]
    const secreto = String((hecho as { kind?: string } | undefined)?.kind || '').toLowerCase() === 'mapa_mudo'
    const donde =
      !secreto && typeof hecho?.lat === 'number' && typeof hecho?.lon === 'number'
        ? { lat: hecho.lat as number, lon: hecho.lon as number }
        : miPosicionRef.current
    if (!donde) return
    celebracionEnRef.current = donde
    celebracionRef.current.iniciar(plan, performance.now())
    // Tu avatar 3D (si está a la vista) también lo festeja, con un gesto alegre.
    avataresRef.current?.festejar(CLAVE_YO)
    // El nodo se sella con un golpe; ese sello ES la insignia (con «reducir movimiento» no hay sello y queda ella).
    const sellado = sellarNodo(mapa, donde)
    // 31/10: la onda, el brillo y las chispas, como pulso dorado en DOM (ver efectosDelMapa.ts): por la fuente no se veían.
    const pulso = pulsoDorado(mapa, donde)
    // La moneda del nodo hecho va dorada un momento (pop) y vuelve a su estado de siempre con UN cambio de icono (sin rAF).
    // Ahorro y «reducir movimiento»: sólo el cambio de icono, más corto; el destello DOM sólo con movimiento y sin ahorro.
    const ahorro = typeof document !== 'undefined' && document.documentElement.classList.contains('saga-ahorro')
    if (!ahorro) destelloDeMoneda(mapa, donde, mapa.getPitch() >= 20 ? 60 : 0)
    oroRef.current = plan.nodoHecho
    pintarNodosRef.current?.()
    window.clearTimeout(oroTimerRef.current)
    oroTimerRef.current = window.setTimeout(
      () => {
        oroRef.current = -1
        if (mapaRef.current) pintarNodosRef.current?.()
      },
      plan.reducido || ahorro ? 1000 : ORO_MONEDA_MS
    )
    retenerSeguimientoRef.current = plan.conVuelo ? performance.now() + 1000 + DURACION_VUELO_MS + 1500 : 0
    // Fin de ruta: tras el festejo, la cámara se aleja para enseñarla entera.
    const nodos = Array.isArray(missionStages) ? missionStages : []
    if (plan.nodoHecho + 1 >= nodos.length) {
      retenerSeguimientoRef.current = performance.now() + DURACION_FESTEJO_MS + VER_RUTA_MS + 1500
      window.clearTimeout(verRutaRef.current)
      verRutaRef.current = window.setTimeout(() => verRutaEntera(mapa, nodos), DURACION_FESTEJO_MS)
    }

    const volar = () => {
      const siguiente = (Array.isArray(missionStages) ? missionStages : [])[nivelRef.current]
      if (
        !siguiente ||
        typeof siguiente.lat !== 'number' ||
        typeof siguiente.lon !== 'number' ||
        String((siguiente as { kind?: string }).kind || '').toLowerCase() === 'mapa_mudo'
      ) {
        return
      }
      const limites = new maplibregl.LngLatBounds()
      limites.extend([siguiente.lon, siguiente.lat])
      if (miPosicionRef.current) limites.extend([miPosicionRef.current.lon, miPosicionRef.current.lat])
      mapa.fitBounds(limites, {
        padding: { top: 150, bottom: 240, left: 60, right: 60 },
        maxZoom: 17.5,
        duration: DURACION_VUELO_MS,
        bearing: mapa.getBearing(),
        pitch: mapa.getPitch(),
      })
    }

    const limpiar = () => pintarFuente(FUENTE_CELEBRACION, COLECCION_VACIA)
    let ultimo = 0
    const paso = (t: number) => {
      const c = celebracionRef.current
      const ahora = performance.now()
      const { fase, cambio } = c.avanzar(ahora)
      if (fase === 'inactiva') {
        limpiar()
        return
      }
      if (mapaCubierto()) {
        // Algo tapó el mapa a medias: nadie la ve, se da por terminada.
        c.cancelar()
        limpiar()
        return
      }
      if (cambio && fase === 'vuelo') volar()
      if (t - ultimo >= 50) {
        ultimo = t
        if (fase === 'festejo') {
          const x = c.progresoFestejo(ahora)
          const centro = celebracionEnRef.current as Punto
          const features: GeoJSON.Feature[] = []
          const punto = (props: Record<string, unknown>, lat = centro.lat, lon = centro.lon): GeoJSON.Feature => ({
            type: 'Feature',
            properties: props,
            geometry: { type: 'Point', coordinates: [lon, lat] },
          })
          const b = curvaBrillo(x)
          if (!pulso) features.push(punto({ tipo: 'brillo', s: b.escala, o: b.opacidad }))
          const r = curvaRebote(x)
          if (!sellado) features.push(punto({ tipo: 'insignia', s: plan.reducido ? 1 : r.escala, o: r.opacidad }))
          if (!plan.reducido && !pulso) {
            for (const [i, retraso] of [0, 0.22].entries()) {
              const o = curvaOnda(x, retraso)
              features.push(punto({ tipo: 'onda', s: o.escala, o: o.opacidad, i }))
            }
            // Las chispas salen en píxeles de pantalla; aquí, a metros con el zoom de ahora.
            const mpp = metrosPorPixel(mapa.getZoom(), centro.lat)
            const grados = 1 / 111320
            for (const ch of curvaChispas(x)) {
              features.push(
                punto(
                  { tipo: 'chispa', s: ch.escala, o: ch.opacidad },
                  centro.lat - ch.dy * mpp * grados,
                  centro.lon + (ch.dx * mpp * grados) / Math.cos((centro.lat * Math.PI) / 180)
                )
              )
            }
          }
          pintarFuente(FUENTE_CELEBRACION, { type: 'FeatureCollection', features })
        } else {
          limpiar()
        }
      }
      window.requestAnimationFrame(paso)
    }
    window.requestAnimationFrame(paso)
  }, [missionStages, pintarFuente])
  celebrarRef.current = empezarCelebracion
  cortarCelebracionRef.current = () => {
    window.clearTimeout(verRutaRef.current)
    if (!celebracionRef.current.cancelar()) return
    retenerSeguimientoRef.current = 0
    pintarFuente(FUENTE_CELEBRACION, COLECCION_VACIA)
    mapaRef.current?.stop()
  }

  useEffect(() => {
    if (!mapaListo) return
    const previo = nivelPrevioRef.current
    nivelPrevioRef.current = currentLevel
    const siguiente = (Array.isArray(missionStages) ? missionStages : [])[currentLevel]
    const plan = decidirCelebracion({
      previo,
      actual: currentLevel,
      totalNodos: missionStages?.length || 0,
      reducido: prefiereMenosMovimiento(typeof window !== 'undefined' ? window.matchMedia?.bind(window) : undefined),
      siguienteEsMapaMudo: String((siguiente as { kind?: string } | undefined)?.kind || '').toLowerCase() === 'mapa_mudo',
      mapaListo,
    })
    if (!plan) return
    pendienteCelebrarRef.current = { plan, desde: performance.now() }
    empezarCelebracion()
    // Sólo al cambiar de nivel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentLevel, mapaListo])

  // 2D / 3D: modelos en 3D, chinchetas planas en 2D.
  useEffect(() => {
    aplicarModoRef.current?.()
    // En retrato cada uno se ve con su foto (2D y 3D lejos); en 3D cerca, con su personaje: los iconos se eligen al dibujar.
    movilRef.current?.dibujar()
  }, [tresD])

  // Las fotos de perfil, ya (de la caché del móvil): así el mapa 2D no sale primero con las caras de los personajes.
  useEffect(() => {
    precargarFotos([miFotoRef.current, ...basesOtrosRef.current.map((b) => b.foto)])
  }, [otherPlayers, selfProfile?.avatar_ref, selfProfile?.avatar_url])

  /**
   * La guía de ti al nodo que toca, POR EL CAMINO.
   *
   * Recta era mentira: cruzaba el monte por donde no se puede andar. Ahora
   * se busca el punto del trazado del nodo más cercano a ti y la guía es
   * un tramito recto hasta ese punto más el trazado que queda desde ahí
   * hasta el nodo. Y de paso se sabe a cuántos metros del camino estás:
   * si son más de 500, "fuera del trazado".
   */
  useEffect(() => {
    // Mapa mudo: sin línea guía hacia el nodo mientras esté oculto -llevaría
    // recto justo al centro del círculo difuso, que es exactamente la pista
    // que este juego no quiere dar-. Vuelve sola en cuanto kind pasa a
    // 'checkpoint' (nodo completado).
    const esMapaMudo = String(currentStage?.kind || '') === 'mapa_mudo'
    if (!playerPosition || currentStage?.lat == null || currentStage?.lon == null || esMapaMudo) {
      pintarFuente(FUENTE_GUIA, COLECCION_VACIA)
      setFueraDeTrazado(null)
      return
    }
    const nodo = { lat: currentStage.lat as number, lon: currentStage.lon as number }
    const track = cerrarTramo(leerTrackDelNodo(currentStage), null, currentStage)
    const camino = track.length > 1 ? track : [nodo]

    let mejor = 0
    let mejorMetros = Infinity
    camino.forEach((punto, indice) => {
      const metros = metrosEntre(playerPosition, punto)
      if (metros < mejorMetros) {
        mejorMetros = metros
        mejor = indice
      }
    })

    /**
     * Lejos del trazado: por carreteras y caminos hasta el punto más
     * cercano de la ruta, si el panel preparó la red de caminos. La ruta
     * se recalcula sólo cuando te has movido más de quince metros o ha
     * cambiado el destino: A* sobre decenas de miles de nodos cada aviso
     * del GPS gastaría batería para nada.
     */
    let porCaminos: [number, number][] = []
    /**
     * Fuera del trazado y sin ruta por caminos todavía (la red cargando, o
     * el worker calculando), el tramo de ti al camino NO se pinta: recto
     * era mentira y se recolocaba a la vista. La guía empieza en el
     * trazado y el tramo aparece cuando llega, por carreteras si estás
     * lejos y por pistas si estás cerca (ver `factorPorLejania`).
     */
    let esperandoCaminos = false
    const objetivo = camino[mejor]
    const claveObjetivo = `${objetivo.lat.toFixed(5)},${objetivo.lon.toFixed(5)}`
    if (mejorMetros > GUIA_POR_CAMINOS_DESDE_M) {
      if (!guiaLeidaRef.current) {
        guiaLeidaRef.current = true
        rutaCaminosRef.current = rutaCaminosRef.current ?? leerGuiaGuardada()
      }
      const previa = rutaCaminosRef.current
      const mismaMeta = previa !== null && previa.hastaClave === claveObjetivo
      const desdePrevia = previa !== null && mismaMeta ? metrosEntre(previa.desde, playerPosition) : Infinity
      if (previa && desdePrevia < 15) {
        // 5/11: desde tu punto, no desde donde se pidió (ver `guiaDesdeAqui`).
        porCaminos = guiaDesdeAqui(previa.coords, playerPosition)
      } else {
        // Mientras se calcula la buena, la de antes si sale de cerca (hasta
        // 150 m; p. ej. la guardada de la última vez en casa): aparece al
        // instante y se cambia en cuanto llega la nueva.
        if (previa && desdePrevia < 150 && previa.coords.length > 0) porCaminos = guiaDesdeAqui(previa.coords, playerPosition)
        else esperandoCaminos = true
        const red = redRef.current
        const pedida = pedidaRef.current
        const yaPedida =
          pedida !== null && pedida.hastaClave === claveObjetivo && metrosEntre(pedida.desde, playerPosition) < 15
        if (red && redLista && !yaPedida) {
          const peticion = { desde: { lat: playerPosition.lat, lon: playerPosition.lon }, hastaClave: claveObjetivo }
          pedidaRef.current = peticion
          void red.ruta(peticion.desde, objetivo, mejorMetros).then((coords) => {
            // 5/11: sólo se tira si cambió el destino. Andando deprisa cada paso de 15 m pedía otra y tiraba la que
            // llegaba: la guía se quedaba con una de hacía 100 m. La que llega tarde se corta en tu punto al pintarla.
            if (pedidaRef.current?.hastaClave !== peticion.hastaClave) return
            rutaCaminosRef.current = {
              desde: peticion.desde,
              hastaClave: claveObjetivo,
              coords: coords ?? [],
              alCaminoM: red.alCaminoM(),
            }
            if (coords && coords.length > 0) guardarGuia(rutaCaminosRef.current)
            setRutaVersion((v) => v + 1)
          })
        }
      }
    }

    const yo: [number, number] = [playerPosition.lon, playerPosition.lat]
    const coordenadas: [number, number][] = [
      ...(esperandoCaminos ? [] : [yo]),
      ...porCaminos,
      ...camino.slice(mejor).map((punto) => [punto.lon, punto.lat] as [number, number]),
    ]
    // 5/11: si la ruta por caminos empieza lejos de ti (zona sin caminos en la red), ese primer tramo va aparte.
    // Sólo si de verdad no hay camino cerca (la ruta sale del cruce más cercano, que en una pista larga puede
    // estar lejos aunque vayas por ella).
    const alCamino = rutaCaminosRef.current?.alCaminoM
    const sinCamino =
      !esperandoCaminos &&
      porCaminos.length > 0 &&
      (alCamino === null || (alCamino ?? 0) > SIN_CAMINO_DESDE_M) &&
      metrosEntre(playerPosition, { lat: porCaminos[0][1], lon: porCaminos[0][0] }) > SIN_CAMINO_DESDE_M
    setSinCaminoConocido(sinCamino)
    pintarFuente(FUENTE_GUIA, {
      type: 'FeatureCollection',
      features: sinCamino
        ? [
            { type: 'Feature', properties: { tipo: 'sin_camino' }, geometry: { type: 'LineString', coordinates: [yo, porCaminos[0]] } },
            { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coordenadas.slice(1) } },
          ]
        : [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coordenadas } }],
    })

    // Con histéresis: se enciende a 500 m y se apaga por debajo de 400,
    // para que en el borde no parpadee a cada aviso del GPS.
    // 22/11: descontado el error declarado: una lectura de antena (1-2 km de error) decía «fuera del trazado» a quien
    // iba por él. Se enciende sólo si ni con el error a favor llegas al camino.
    const alTrazadoSeguroM = mejorMetros - Math.max(0, gpsAccuracyRef.current ?? 0)
    setFueraDeTrazado((antes) => {
      if (antes === null) return alTrazadoSeguroM > FUERA_DE_TRAZADO_M ? Math.round(mejorMetros) : null
      return alTrazadoSeguroM > DE_VUELTA_AL_TRAZADO_M ? Math.round(mejorMetros) : null
    })
  }, [playerPosition?.lat, playerPosition?.lon, currentStage, pintarFuente, redLista, rutaVersion])

  /**
   * Los tres encuadres, siempre con el norte arriba.
   *
   * "Ver la ruta" y "volver a mí" giran el mapa al norte además de
   * encuadrar: es lo que hace de este botón también el de la brújula, y
   * por eso no hace falta otro. La aguja de la barra dice si el mapa está
   * girado; un toque aquí lo endereza.
   */
  useEffect(() => {
    const mapa = mapaRef.current
    if (!mapa || !focusRequest) return
    if (ultimoEncuadreRef.current === focusRequest.token) return
    /**
     * "Centrar en mí" sin posición todavía: se pulsa, el navegador pide el
     * permiso de ubicación, el jugador acepta… y la posición llega DESPUÉS
     * de que este efecto haya corrido. Consumir el token aquí era perderlo:
     * el mapa no se centraba nunca. Se deja pendiente y se vuelve a pasar
     * por aquí cuando la posición aparece.
     */
    if (focusRequest.target === 'player' && !playerPosition) return
    ultimoEncuadreRef.current = focusRequest.token
    calentadoRef.current?.cancelar(true)

    if (focusRequest.target === 'route') {
      const nodos = (Array.isArray(missionStages) ? missionStages : []).filter(
        (nodo) => typeof nodo.lat === 'number' && typeof nodo.lon === 'number'
      )
      if (nodos.length === 0) return
      const limites = new maplibregl.LngLatBounds()
      nodos.forEach((nodo) => limites.extend([nodo.lon as number, nodo.lat as number]))
      if (playerPosition) limites.extend([playerPosition.lon, playerPosition.lat])
      mapa.fitBounds(limites, { padding: 70, bearing: 0, duration: 800, maxZoom: 16 })
      return
    }
    const destino =
      focusRequest.target === 'player' && playerPosition
        ? { lat: playerPosition.lat, lon: playerPosition.lon }
        : currentStage?.lat != null && currentStage?.lon != null
          ? { lat: currentStage.lat as number, lon: currentStage.lon as number }
          : null
    if (!destino) return
    // 5.59: la PRIMERA vez que se centra en ti (llega el GPS, casi siempre justo al aceptar los permisos y
    // levantarse la pantalla de carga) va de golpe, sin animación: se veía el mapa deslizarse y tu muñeco
    // subir al entrar. Después, cuando lo pides tú, con su animación de siempre.
    const deGolpe = mapaCubierto() || (focusRequest.target === 'player' && !primerEncuadreEnTiRef.current)
    if (focusRequest.target === 'player') primerEncuadreEnTiRef.current = true
    // 24/10: en arco (variante «Vuelo»); de golpe con «reducir movimiento». Ver movimientoDeCamara.ts.
    volarA(mapa, [destino.lon, destino.lat], deGolpe)
    // `missionStages`/posición se leen en el momento del encuadre; no hay
    // que reencuadrar cuando cambian.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRequest?.token, focusRequest?.target, playerPosition?.lat, playerPosition?.lon])

  // 6/11: si cambia el tema (la clase del body), el trazado, la guía y el radio se repintan UNA vez con los colores
  // nuevos. Nada en bucle: si los colores no cambian (el body cambia de clase por otras cosas), no se toca el mapa.
  useEffect(() => {
    const alCambiarElTema = () => {
      const mapa = mapaRef.current
      if (!refrescarColoresDelMapa() || !mapa) return
      const pintar = (capa: string, propiedad: string, valor: unknown) => {
        if (mapa.getLayer(capa)) mapa.setPaintProperty(capa, propiedad as never, valor as never)
      }
      pintar(CAPA_RUTA, 'line-color', colorDeLaRuta())
      pintar(CAPA_RUTA_BORDE, 'line-color', COLOR_RUTA_CONTORNO)
      pintar(CAPA_GUIA, 'line-color', COLOR_GUIA)
      pintar(CAPA_GUIA_SIN_CAMINO, 'line-color', COLOR_GUIA)
      pintar(CAPA_RADIO_RELLENO, 'fill-color', COLOR_RADIO)
      pintar(CAPA_RADIO_BORDE, 'line-color', COLOR_RADIO_BORDE)
      // Las chinchetas van horneadas en imágenes: se quitan y `styleimagemissing` las vuelve a dibujar con el color nuevo.
      for (const id of mapa.listImages()) if (/^nodo-\d+-(hecho|actual|pendiente)$/.test(String(id))) mapa.removeImage(id)
    }
    const vigia = new MutationObserver(alCambiarElTema)
    vigia.observe(document.body, { attributes: true, attributeFilter: ['class'] })
    return () => vigia.disconnect()
  }, [])

  // Radio del nodo actual.
  //
  // Mapa mudo: mientras el kind del nodo en juego siga siendo 'mapa_mudo'
  // (el servidor no lo cambia a 'checkpoint' hasta completarlo), lat/lon/
  // radius YA vienen difuminados desde el servidor -no hay nada que
  // difuminar aquí-, y este es el único sitio del mapa donde se pinta esa
  // zona: un círculo relleno y de borde suave, sin pin encima (ver el
  // filtro `mapaMudo` de CAPA_NODO_ENTRADA/CAPA_NODOS_SUELO más abajo).
  useEffect(() => {
    const mapa = mapaRef.current
    const esMapaMudo = String(currentStage?.kind || '') === 'mapa_mudo'

    const aplicarVisibilidad = (): boolean => {
      if (!mapa || !mapa.getLayer(CAPA_RADIO_RELLENO) || !mapa.getLayer(CAPA_RADIO_BORDE)) return false
      mapa.setLayoutProperty(CAPA_RADIO_RELLENO, 'visibility', esMapaMudo ? 'visible' : 'none')
      mapa.setLayoutProperty(CAPA_RADIO_BORDE, 'visibility', esMapaMudo ? 'visible' : 'none')
      if (esMapaMudo) {
        // Borde suave y difuso a propósito: nada que se lea como "aquí
        // exactamente", solo "por esta zona".
        mapa.setPaintProperty(CAPA_RADIO_BORDE, 'line-color', COLOR_RADIO_BORDE)
        mapa.setPaintProperty(CAPA_RADIO_BORDE, 'line-opacity', 0.5)
        mapa.setPaintProperty(CAPA_RADIO_BORDE, 'line-width', 2)
      }
      return true
    }
    // Si el estilo aún no ha montado las capas (los datos llegan antes),
    // el círculo del mapa mudo se quedaba oculto para siempre: se reintenta
    // en cada `styledata` hasta que se pueda aplicar.
    let reintento: (() => void) | null = null
    if (mapa && !aplicarVisibilidad()) {
      reintento = () => {
        if (aplicarVisibilidad() && reintento) mapa.off('styledata', reintento)
      }
      mapa.on('styledata', reintento)
    }
    const limpiarReintento = () => {
      if (mapa && reintento) mapa.off('styledata', reintento)
    }

    if (currentStage?.lat == null || currentStage?.lon == null) {
      pintarFuente(FUENTE_RADIO, COLECCION_VACIA)
      return limpiarReintento
    }

    const radio = typeof currentStage.radius === 'number' && currentStage.radius > 0
      ? currentStage.radius
      : 30

    pintarFuente(
      FUENTE_RADIO,
      circuloGeoJSON({ lat: currentStage.lat, lon: currentStage.lon }, radio)
    )
    return limpiarReintento
  }, [currentStage?.lat, currentStage?.lon, currentStage?.radius, currentStage?.kind, pintarFuente])

  /**
   * Los nodos van como marcadores del DOM, NO como capa de círculos.
   *
   * Con el relieve activado, una capa de círculos queda ENTERRADA bajo la
   * malla del terreno: el mapa se veía bien y los nodos no aparecían por
   * ningún lado -reportado en el móvil, y costó encontrarlo porque no da
   * ningún error: se dibujan, pero por debajo del monte-.
   *
   * Un marcador del DOM va por encima del lienzo siempre, lo tape lo que
   * lo tape, y además permite ponerle el número dentro, como en el motor
   * de Leaflet. Son diez, no diez mil: el coste de tenerlos en el DOM es
   * irrelevante aquí.
   */
  useEffect(() => {
    const mapa = mapaRef.current
    if (!mapa) return

    marcadoresNodosRef.current.forEach((marcador) => marcador.remove())
    marcadoresNodosRef.current = []

    const nodos = (Array.isArray(missionStages) ? missionStages : []).filter(
      (nodo) => typeof nodo.lat === 'number' && typeof nodo.lon === 'number'
    )

    const estado = (indice: number) =>
      indice < currentLevel ? 'hecho' : indice === currentLevel ? 'actual' : 'pendiente'

    // 7/11: los apilados ya no se esconden (26/10 y 6/11 sólo se pintaba uno de cada sitio): se abren en arco
    // compacto alrededor de su punto (repartoDeNodos.ts). El de mapa mudo queda fuera: ni se mueve ni aparta a nadie.
    const esMudo = (nodo: unknown) => String((nodo as { kind?: string }).kind || '').toLowerCase() === 'mapa_mudo'
    const estadoMoneda = (indice: number) => (indice === currentLevel + 1 ? 'siguiente' : estado(indice))

    capaNodosRef.current?.setNodos(
      nodos.map((nodo, indice) => ({
        id: String((nodo as { id?: unknown }).id ?? indice),
        lat: nodo.lat as number,
        lon: nodo.lon as number,
        numero: indice + 1,
        tipo: tipoDelNodo(nodo),
        estado: estado(indice),
      }))
    )

    const base = nodos.map((nodo, indice) => ({
      clave: String(indice),
      lat: nodo.lat as number,
      lon: nodo.lon as number,
      mudo: esMudo(nodo),
      actual: indice === currentLevel,
      // El diámetro de su moneda 2D respecto a la del siguiente (radios de `dibujarMoneda`: 21, 18 y 15,5).
      moneda: indice === currentLevel ? 21 / 18 : indice === currentLevel + 1 ? 1 : 15.5 / 18,
      props: {
        // Número, estado y tipo van en el nombre: la imagen se hornea al vuelo con los tres (ver `styleimagemissing`).
        // En 2D, la moneda (dibujarMoneda); con el mapa inclinado, el nodo 3D de siempre.
        icono: `moneda-${indice + 1}-${estadoMoneda(indice)}-${tipoDelNodo(nodo)}`,
        icono3d: `nodo3d-${indice + 1}-${estado(indice)}-${tipoDelNodo(nodo)}`,
        icono3dm: `nodo3dm-${indice + 1}-${estado(indice)}-${tipoDelNodo(nodo)}`,
        iconoSuelo: `suelo-${estado(indice)}-${tipoDelNodo(nodo)}`,
        iconoEntrada: `entrada-${tipoDelNodo(nodo)}`,
        // Mapa mudo: nunca moneda, poste ni aro de entrada -ver los filtros de las capas-, solo el círculo difuso.
        mapaMudo: esMudo(nodo),
        entradaK:
          (typeof nodo.radius === 'number' && nodo.radius > 0 ? nodo.radius : 30) /
          (METROS_POR_PX_Z0 * Math.cos(((nodo.lat as number) * Math.PI) / 180) * RADIO_ENTRADA_PX),
        estado: estado(indice),
        orden: indice === currentLevel ? 1000 : indice,
      },
      // Las imágenes de la moneda dorada (celebración): sólo cambia el icono, el estado de la ruta y los filtros no.
      oroIconos: {
        icono: `moneda-${indice + 1}-oro-${tipoDelNodo(nodo)}`,
        icono3d: `nodo3d-${indice + 1}-oro-${tipoDelNodo(nodo)}`,
        icono3dm: `nodo3dm-${indice + 1}-oro-${tipoDelNodo(nodo)}`,
      },
      silueta: {
        icono: `nodo-${indice + 1}-${estado(indice)}-${tipoDelNodo(nodo)}`,
        icono3d: `nodo3d-${indice + 1}-${estado(indice)}-${tipoDelNodo(nodo)}`,
        icono3dm: `nodo3dm-${indice + 1}-${estado(indice)}-${tipoDelNodo(nodo)}`,
      },
    }))
    pintarNodosRef.current = () => {
      const vivo = mapaRef.current
      const planos = monedasRef.current
      const repartibles = base.filter((n) => !n.mudo).map((n) => ({ ...n, tamano: planos ? n.moneda : 1 }))
      // 16/11: sin inclinación ni rumbo: el reparto depende sólo del zoom y de la geografía. 23/11: de cerca, SIEMPRE al
      // zoom del reparto (el nodo y el disco de suelo donde nadie se queda no se mueven al hacer zoom): una sola definición.
      const zoomVivo = vivo?.getZoom() ?? 16
      const zoomN = zoomDeReparto(zoomVivo)
      const lejos = (lejosRef.current = estaLejos(zoomVivo))
      const sitios = repartirNodos(repartibles, zoomN, 0, 0, lejos)
      // 16/11: a vista de región los nodos que se taparían forman un clúster con su número (en el centroide real).
      const clusters = lejos ? agruparNodosLejos(repartibles, zoomN) : []
      const enCluster = new Set(clusters.flatMap((c) => c.miembros))
      gruposDeNodosRef.current = new Map(
        clusters.map((c) => [c.clave, { puntos: c.miembros.map((k) => { const n = base.find((b) => b.clave === k) as (typeof base)[number]; return [n.lon, n.lat] as [number, number] }) }])
      )
      const sitioDe = (n: (typeof base)[number]) => sitios.get(n.clave) ?? { lat: n.lat, lon: n.lon }
      pintarFuente(FUENTE_NODOS_ICONOS, {
        type: 'FeatureCollection',
        features: [
          ...clusters.map((c) => {
            const p0 = (base.find((b) => b.clave === c.miembros[0]) as (typeof base)[number]).props
            const icono = `nodos-grupo-${c.miembros.length}`
            return { type: 'Feature' as const, properties: { ...p0, icono, icono3d: icono, icono3dm: icono, grupoId: c.clave, estado: 'pendiente', orden: 900 }, geometry: { type: 'Point' as const, coordinates: [c.lon, c.lat] } }
          }),
          ...base.filter((n) => !enCluster.has(n.clave)).map((n) => {
            const sitio = sitioDe(n)
            const props = n.clave === String(oroRef.current) ? { ...n.props, ...n.oroIconos } : n.props
            return { type: 'Feature' as const, properties: props, geometry: { type: 'Point' as const, coordinates: [sitio.lon, sitio.lat] } }
          }),
          // El aro de entrada, en el punto REAL del nodo en juego.
          ...base
            .filter((n) => n.actual && !n.mudo)
            .map((n) => ({ type: 'Feature' as const, properties: { ...n.props, entrada: true }, geometry: { type: 'Point' as const, coordinates: [n.lon, n.lat] } })),
        ],
      })
      for (const n of base) {
        const pr = n.props as Record<string, unknown>
        precargarImagenesRef.current([pr.icono, pr.icono3d, pr.icono3dm])
      }
      // El cuerpo 3D y los retratos se apartan del nodo en su sitio repartido (avA, 24/10; 7/11); los de mapa mudo no
      // están: delatarían dónde están. Y su silueta tapa al cuerpo que esté detrás (ocultarTrasNodos.ts).
      // 21/11: los jugadores se apartan de los nodos donde quedan al zoom FIJO del reparto, no al de ahora: si no, cada
      // cuarto de zoom que recoloca los nodos movería también a los jugadores (ver ZOOM_DEL_REPARTO).
      const sitiosDelReparto = lejos ? repartirNodos(repartibles, ZOOM_DEL_REPARTO, 0, 0, false) : sitios
      postesRef.current = repartibles.map((n) => sitiosDelReparto.get(n.clave) ?? { lat: n.lat, lon: n.lon })
      siluetasDeNodos.splice(0, siluetasDeNodos.length, ...repartibles.map((n) => ({ ...sitioDe(n), props: n.silueta })))
      const actual = repartibles.find((n) => n.actual)
      sitioDelActualRef.current = actual ? sitioDe(actual) : null
    }
    pintarNodosRef.current()
    nodosParaHornearRef.current = nodos.map((nodo, indice) => ({
      clave: `${indice + 1}-${estado(indice)}-${tipoDelNodo(nodo)}`,
      lon: nodo.lon as number,
      lat: nodo.lat as number,
    }))

    /**
     * El volumen de cada nodo: un poste corto que sale del suelo.
     *
     * Radio pequeño y altura en METROS, no en píxeles: así la perspectiva
     * lo trata como lo que dice ser -algo plantado en el terreno- y crece,
     * se inclina y se tapa solo, sin una línea de código que lo simule.
     */
    /**
     * Bajo cada chincheta, un disco de metro y medio de alto pegado al
     * terreno: es geometría del mapa, así que se inclina, se tapa y se
     * escala con el relieve. Da la lectura de "clavada AHÍ" sin levantar
     * un poste que tape el icono. El del nodo en juego es más ancho.
     */
    pintarFuente(FUENTE_NODOS_VOLUMEN, {
      type: 'FeatureCollection',
      // Mapa mudo: sin disco de suelo bajo el nodo mientras está oculto -es
      // justo el bulto que delataría "aquí, exacto" bajo el círculo difuso-.
      features: nodos
        .map((nodo, indice) => ({ nodo, indice }))
        .filter(({ nodo }) => String((nodo as { kind?: string }).kind || '').toLowerCase() !== 'mapa_mudo')
        .map(({ nodo, indice }) => ({
          type: 'Feature' as const,
          properties: {
            color:
              indice < currentLevel
                ? COLOR_NODO_HECHO
                : indice === currentLevel
                  ? COLOR_NODO_ACTUAL
                  : COLOR_NODO_PENDIENTE,
            base: 0,
            altura: 1.5,
          },
          geometry: circuloGeoJSON(
            { lat: nodo.lat as number, lon: nodo.lon as number },
            indice === currentLevel ? 7 : 4.5,
            24
          ).features[0].geometry,
        })),
    })

    /**
     * Abrir sobre el NODO ACTUAL, no sobre la ruta entera.
     *
     * Encuadrar los diez nodos de golpe sonaba bien y quedó fatal: a zoom
     * 13 la ruta entra en pantalla pero los alfileres, que tienen tamaño
     * fijo en píxeles, se amontonan en una fila de chinchetas sobre un
     * mapa de media Galicia. No informa de nada y parece roto.
     *
     * Lo que hace falta al abrir es "dónde tengo que ir ahora", así que se
     * abre encima del nodo en juego. Solo la primera vez y solo sin GPS:
     * en cuanto hay posición, manda ella.
     */
    /**
     * Y sólo si nadie dio un centro inicial. La pantalla del jugador ya
     * abre el mapa sobre el nodo o el GPS; saltar otra vez al llegar los
     * datos era un tirón visible -el mapa se movía y las teselas se
     * borraban justo después de cargar-.
     */
    if (!encuadreInicialRef.current && !initialCenter && !playerPosition && currentStage?.lat != null) {
      encuadreInicialRef.current = true
      mapa.jumpTo({ center: [currentStage.lon as number, currentStage.lat as number], zoom: 17 })
    }

    // `playerPosition` solo decide si procede encuadrar al entrar; no debe
    // rehacer los marcadores en cada paso que das.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missionStages, currentLevel, currentStage?.lat, currentStage?.lon, pintarFuente])

  useEffect(() => {
    const ahora = !tresD || (mapaRef.current?.getPitch() ?? 0) < 12
    if (ahora === monedasRef.current) return
    monedasRef.current = ahora
    aplicarModoRef.current?.()
    pintarNodosRef.current()
    setMonedas(ahora)
  }, [tresD])

  /**
   * Trazado REAL, el que guarda administración en cada nodo
   * (`route_track`): sigue caminos de verdad.
   *
   * Aquí hubo una línea recta de nodo a nodo y se quitó porque mentía
   * -cruzaba el monte por donde no se puede andar-. Esto no: es el
   * mismo trazado que dibuja el motor de Leaflet, leído del mismo sitio.
   *
   * Cada tramo es el trazado que LLEGA a su nodo, así que hereda el estado
   * de ese nodo: andado, en juego o pendiente. El tramo en juego se parte en
   * tu posición: lo andado (`andado`, verde) y lo que queda (`actual`, azul,
   * con flechas y pulso). Va aparte del efecto de los nodos para que andar
   * no rehaga marcadores ni imágenes: sólo cambia cuando avanzas ~8 m.
   */
  useEffect(() => {
    const nodos = (Array.isArray(missionStages) ? missionStages : []).filter(
      (nodo) => typeof nodo.lat === 'number' && typeof nodo.lon === 'number'
    )
    const estado = (indice: number) =>
      indice < currentLevel ? 'hecho' : indice === currentLevel ? 'actual' : 'pendiente'
    const tramos = nodos
      .map((nodo, indice) => ({
        track: cerrarTramo(leerTrackDelNodo(nodo), indice > 0 ? nodos[indice - 1] : null, nodo),
        estado: estado(indice),
      }))
      .filter((tramo) => tramo.track.length > 1)
    tramoActualRef.current = tramos.find((tramo) => tramo.estado === 'actual')?.track ?? []

    const hechos = progresoRuta.clave === String(currentLevel) ? progresoRuta.m : 0
    const linea = (estadoTramo: string, track: Punto[]) => ({
      type: 'Feature' as const,
      properties: { estado: estadoTramo },
      geometry: { type: 'LineString' as const, coordinates: track.map((punto) => [punto.lon, punto.lat]) },
    })
    const features = tramos.flatMap((tramo) => {
      if (tramo.estado !== 'actual' || hechos <= 0) return [linea(tramo.estado, tramo.track)]
      const { andado, resto } = cortarTrazado(tramo.track, hechos)
      return [
        ...(andado.length > 1 ? [linea('andado', andado)] : []),
        ...(resto.length > 1 ? [linea('actual', resto)] : []),
      ]
    })
    pintarFuente(FUENTE_RUTA, features.length > 0 ? { type: 'FeatureCollection', features } : COLECCION_VACIA)
  }, [missionStages, currentLevel, progresoRuta, pintarFuente])

  /** Fotos de campo: puntos en una fuente del mapa; la imagen se pide al dibujar. */
  useEffect(() => {
    const fotos = (Array.isArray(fieldProofs) ? fieldProofs : []).filter(
      (foto) => typeof foto.lat === 'number' && typeof foto.lon === 'number'
    )
    fotosRef.current = fotos
    abrirFotosRef.current = onOpenFieldProofs

    const tabla = new Map<string, string>()
    fotos.forEach((foto) => {
      tabla.set(`foto-${foto.id}`, foto.thumbnail_url || foto.image_url)
    })
    fotosPorIconoRef.current = tabla

    /**
     * Por sitio: las que están a 30 m de un nodo van con ese nodo y se
     * reparten bajo él; las demás se juntan si están a menos de 20 m.
     */
    const nodos = (Array.isArray(missionStages) ? missionStages : [])
      .filter((nodo) => typeof nodo.lat === 'number' && typeof nodo.lon === 'number')
      .map((nodo) => ({ lat: nodo.lat as number, lon: nodo.lon as number }))
    type GrupoDeFotos = { lat: number; lon: number; nodo: number; fotos: FieldProof[] }
    const grupos: GrupoDeFotos[] = []
    for (const foto of fotos) {
      const punto = { lat: foto.lat as number, lon: foto.lon as number }
      let nodo = -1
      let mejor = 30
      nodos.forEach((candidato, indice) => {
        const metros = metrosEntre(candidato, punto)
        if (metros < mejor) {
          mejor = metros
          nodo = indice
        }
      })
      let grupo =
        nodo >= 0
          ? grupos.find((otro) => otro.nodo === nodo)
          : grupos.find((otro) => otro.nodo < 0 && metrosEntre(otro, punto) < 20)
      if (!grupo) {
        grupo = { ...(nodo >= 0 ? nodos[nodo] : punto), nodo, fotos: [] }
        grupos.push(grupo)
      }
      grupo.fotos.push(foto)
    }
    gruposFotosRef.current = grupos.map((grupo) => grupo.fotos)

    pintarFuente(FUENTE_FOTOS, {
      type: 'FeatureCollection',
      features: grupos.flatMap((grupo, indiceGrupo) => {
        if (grupo.nodo >= 0) {
          // Las de un nodo: un solo montón con la primera y cuántas hay.
          return [
            {
              type: 'Feature' as const,
              properties: {
                tipo: 'pila',
                icono: `pila-${grupo.fotos[0].id}-${grupo.fotos.length}`,
                id: grupo.fotos[0].id,
                grupo: indiceGrupo,
              },
              geometry: { type: 'Point' as const, coordinates: [grupo.lon, grupo.lat] },
            },
          ]
        }
        const vistas = grupo.fotos.slice(0, MAX_FOTOS_GRUPO)
        return vistas.map((foto, indice) => ({
          type: 'Feature' as const,
          properties: {
            tipo: 'foto',
            icono: `foto-${foto.id}`,
            id: foto.id,
            grupo: indiceGrupo,
            hueco: `${grupo.nodo >= 0 ? 1 : 0}-${vistas.length}-${indice}`,
            orden: indice,
          },
          geometry: { type: 'Point' as const, coordinates: [grupo.lon, grupo.lat] },
        }))
      }),
    })
  }, [fieldProofs, onOpenFieldProofs, pintarFuente, missionStages])


  // 2D / 3D. Inclinar la cámara es gratis aquí -es la misma escena, otra
  // matriz- y no pide ni un dato más, así que funciona igual sin cobertura.
  // 24/10: 700 ms con curva suave y medio punto de zoom; al montar, sin tocar el zoom. Ver movimientoDeCamara.ts.
  const tresDAntesRef = useRef(tresD)
  useEffect(() => {
    const mapa = mapaRef.current
    if (!mapa) return
    const cambio = tresDAntesRef.current !== tresD
    tresDAntesRef.current = tresD
    // Cambiado con el gesto: se termina de inclinar (o de aplanar) sin tocar el zoom.
    if (tresDPorGestoRef.current) {
      tresDPorGestoRef.current = false
      inclinar(mapa, tresD ? PITCH_3D : 0, 0)
      return
    }
    inclinar(mapa, tresD ? PITCH_3D : 0, cambio ? (tresD ? ZOOM_AL_INCLINAR : -ZOOM_AL_INCLINAR) : 0)
  }, [tresD])

  // El código de la ficha, ya en memoria antes de que nadie toque a nadie (y sin cobertura, desde la caché).
  useEffect(() => {
    const reloj = window.setTimeout(() => void cargarFicha().catch(() => undefined), 6000)
    return () => window.clearTimeout(reloj)
  }, [])

  // La ficha abierta, con los datos de AHORA (posición, conexión, nodos) o los últimos que llegaron.
  const fichaActual = fichaDe ? (otherPlayers || []).find((j) => claveDeJugador(j) === fichaDe) : undefined
  if (fichaActual) fichaUltimaRef.current = fichaActual
  const fichaJugador = fichaDe ? (fichaActual ?? fichaUltimaRef.current) : null
  /** «Ir a él»: deja de seguirte y centra el mapa en él (sin cambiar la inclinación ni el giro). */
  const irAJugador = (j: TeamProfileLiveStatus) => {
    const mapa = mapaRef.current
    if (!mapa || typeof j.lat !== 'number' || typeof j.lon !== 'number') return
    onUserMapMoveRef.current?.()
    const p = fuenteRef.current.dibujo(claveDeJugador(j), performance.now()) ?? { lat: j.lat, lon: j.lon }
    mapa.easeTo({ center: [p.lon, p.lat], zoom: Math.max(mapa.getZoom(), 17.5), duration: 800 })
  }

  // Los textos de esta pantalla en el idioma de ahora (antes el aviso sin WebGL mezclaba castellano y gallego).
  const textosMapa = textosDePantallasDe(getLocale()).mapa

  return (
    <section className={['map-surface', className].filter(Boolean).join(' ')}>
      <div
        ref={contenedorRef}
        aria-label={textosMapa.aria}
        style={{ position: 'absolute', inset: 0 }}
      />
      {sinWebGL ? (
        <div
          role="alert"
          style={{
            position: 'absolute',
            left: 16,
            right: 16,
            top: '28%',
            margin: '0 auto',
            maxWidth: 360,
            padding: '14px 16px',
            borderRadius: 16,
            background: 'rgba(var(--theme-ink), .88)',
            color: '#ffffff',
            border: '1px solid rgba(255,255,255,.35)',
            font: '700 14px/1.35 system-ui, sans-serif',
            textAlign: 'center',
            zIndex: 5,
          }}
        >
          <div style={{ fontWeight: 900, marginBottom: 6 }}>{textosMapa.sinWebGLTitulo}</div>
          <div>{textosMapa.sinWebGL}</div>
          <div style={{ marginTop: 6, opacity: 0.85, fontSize: 13 }}>{textosMapa.sigueJugando}</div>
          {debugSimulation && onDebugSetPosition && currentStage?.lat != null && currentStage?.lon != null ? (
            <button
              type="button"
              onClick={() =>
                onDebugSetPosition({ lat: currentStage.lat as number, lon: currentStage.lon as number })
              }
              style={{
                marginTop: 10,
                minHeight: 44,
                padding: '0 16px',
                borderRadius: 999,
                border: '1px solid rgba(255,255,255,.5)',
                background: 'rgba(255,255,255,.14)',
                color: '#ffffff',
                font: '800 13px system-ui, sans-serif',
                cursor: 'pointer',
              }}
            >
              {textosMapa.colocarmeEnNodo}
            </button>
          ) : null}
        </div>
      ) : null}
      {!sinWebGL ? <AvisoPersonajes comp={obtenerAvatares} /> : null}
      {usuarioYo ? (
        // «¡Desbloqueado!» cuando se gana algo del vestuario, con el mapa libre.
        <AvisoDeDesbloqueo
          usuario={usuarioYo}
          nivel={currentLevel}
          alVerTienda={() => window.dispatchEvent(new CustomEvent(EVENTO_ELEGIR_PERSONAJE))}
        />
      ) : null}
      {fichaJugador ? (
        <Suspense fallback={null}>
          <FichaDeJugador
            key={fichaDe ?? ''}
            jugador={fichaJugador}
            esperaMs={encuadrandoRef.current ? ENCUADRE_MS : undefined}
            totalNodos={missionStages?.length || 0}
            sinCobertura={typeof navigator !== 'undefined' && navigator.onLine === false}
            alCerrar={() => setFichaDe(null)}
            alIrA={() => {
              setFichaDe(null)
              irAJugador(fichaJugador)
            }}
            alSaludar={() => {
              setFichaDe(null)
              // 5.59: antes saludaba tu muñeco con la cámara puesta en el otro y no veías nada. Ahora la cámara
              // vuelve a ti, saludas con «¡Hola!» encima y el otro lo ve en su mapa.
              const mapa = mapaRef.current
              const yo = yoRef.current.posicion(performance.now())
              if (mapa && yo) mapa.easeTo({ center: [yo.lon, yo.lat], duration: 700 })
              window.setTimeout(() => {
                window.dispatchEvent(new CustomEvent(EVENTO_GESTO, { detail: GESTO_SALUDAR }))
                window.dispatchEvent(new CustomEvent(EVENTO_MENSAJE, { detail: 'hola' }))
              }, 450)
              if (usuarioYo)
                void enviarReaccion({ user: usuarioYo, gesto: GESTO_SALUDAR, mensaje: 'hola' }).catch(() => undefined)
            }}
          />
        </Suspense>
      ) : null}
      {fueraDeTrazado !== null ? (
        /**
         * Aviso de fuera del trazado. Pequeño, en el centro, sin tapar la
         * barra de arriba ni la de abajo. Dice cuánto, porque no es lo
         * mismo 520 m que 3 km.
         */
        <div
          role="status"
          style={{
            // Centrado por márgenes, no por transform: el contenedor del
            // mapa lleva sus propias transformaciones y el `translateX`
            // se veía descentrado en el móvil.
            position: 'absolute',
            left: 0,
            right: 0,
            // 5.59: encima de la fila de botones redondos; en el 38 % caía justo sobre la cabeza de tu muñeco.
            bottom: '23%',
            width: 'fit-content',
            margin: '0 auto',
            padding: '8px 14px',
            borderRadius: 999,
            background: 'rgba(var(--theme-ink), .78)',
            color: '#ffffff',
            border: '1px solid rgba(255,255,255,.35)',
            font: '800 13px system-ui, sans-serif',
            letterSpacing: '.02em',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            zIndex: 5,
          }}
        >
          {textosMapa.fueraDelTrazado}{' '}
          {fueraDeTrazado >= 1000
            ? `${(fueraDeTrazado / 1000).toFixed(1).replace('.', ',')} km`
            : `${fueraDeTrazado} m`}
          {sinCaminoConocido ? textosMapa.sinCaminoConocido : ''}
        </div>
      ) : null}

    </section>
  )
}

export default MapSurfaceGL

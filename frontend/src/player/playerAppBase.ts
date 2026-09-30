import type { PlayerGamePayload, PlayerStage, PublicConfig } from '../types/player'
import type { EstadoDeCarga } from './offline/motorDeCarga'
import { haptics } from './utils/haptics'

/**
 * Piezas de `PlayerApp` que no dependen de su estado: el tipo de la carga, los
 * avisos bilingües y unas pocas funciones puras. Estaban al principio del
 * fichero de 3 800 líneas; se sacan tal cual, sin cambiar ni un nombre.
 */

export type LoadState =
  | {
      status: 'idle' | 'loading'
      mapProgress?: { done: number; total: number; detail?: string; label?: string }
      /**
       * Una barra por parte (App, Misión, Mapa), si hay algo que bajar.
       * Sin ella es la pantalla neutra de "conectando".
       */
      carga?: EstadoDeCarga
    }
  | { status: 'error'; message: string }
  | { status: 'ready'; payload: PlayerGamePayload; config: PublicConfig }

/**
 * Textos de avisos del jugador (showNotice/confirm), en castellano y galego.
 *
 * Antes estaban escritos a pelo en castellano (algunos incluso en inglés) y
 * el puente de idioma no los tocaba porque llevan números o variables
 * dentro (metros, contadores, nombres de objeto). Aquí van en los dos
 * idiomas y PlayerApp elige según `locale`.
 */
export const NOTICES = {
  es: {
    subiendoFoto: 'Subiendo foto…',
    activaGpsOFotoMapa: 'Activa GPS o usa modo debug para guardar la foto en el mapa.',
    confirmarBorrarFoto: '¿Eliminar esta foto del mapa? Solo puedes borrar tus propias fotos.',
    sinCoberturaBorradoFoto: 'Sin cobertura: la foto se borrará en el servidor al volver la red.',
    sinPosicionParaFoto: 'No hay posición para guardar la foto.',
    sinCoberturaFotoGuardada: 'Sin cobertura: la foto ya se ve, y se subirá sola. 📷',
    noSePudoGuardarFotoReintenta: 'No se pudo guardar la foto. Inténtalo de nuevo.',
    noSePudoGuardarFoto: 'No se pudo guardar la foto.',
    debugDesactivado: 'Debug desactivado. Recuperando GPS real…',
    modoPruebaActivo: 'Modo prueba activo. Toca un punto libre del mapa para colocar tu ubicación.',
    posicionDebugActualizada: 'Posición debug actualizada.',
    nodoActivoInexistente: 'No hay ningún nodo activo en este momento.',
    centradoEnNodo: 'Centrado en el nodo.',
    seguimientoActivado: 'Seguimiento del jugador activado.',
    mapaLibreActivado: 'Mapa libre activado.',
    gpsNoDisponibleDispositivo: 'GPS no disponible en este dispositivo o navegador.',
    gpsRequiereHttps:
      'El GPS requiere HTTPS o abrir SAGA como app instalada desde la pantalla de inicio.',
    solicitandoPermisoUbicacion: 'Solicitando permiso de ubicación… acepta el aviso del navegador.',
    gpsRealActivado: 'GPS real activado.',
    gpsPrecisoNoResponde:
      'El GPS de precisión no responde aquí -zona de monte o cobertura densa-. Usando ubicación aproximada por red mientras tanto.',
    permisoUbicacionDenegado:
      'Permiso de ubicación denegado. En iPhone revisa Ajustes > Safari > Ubicación, o elimina y vuelve a añadir la PWA.',
    noSePudoObtenerUbicacion:
      'No se pudo obtener ubicación. Prueba al aire libre, activa Ubicación precisa y reintenta.',
    gpsImpreciso: (n: number) =>
      `GPS impreciso (${n} m). Esperando una lectura mejor para desbloquear el nodo.`,
    misionDescargada: (n: number) => `Misión descargada para jugar sin conexión (${n} nodos).`,
    noSePudoDescargarMision: 'No se pudo descargar la misión sin conexión.',
    paquetesIncompletos: (n: number) =>
      `Faltan ${n} archivos de la aplicación por guardar. Con cobertura, pulsa Descargar otra vez.`,
    preparandoZip: 'Preparando archivo ZIP...',
    descargaZipCompletada: 'Descarga de ZIP completada',
    zipFaltanFotos: (fallidas: number, total: number) =>
      `ZIP descargado, pero faltan ${fallidas} de ${total} fotos. Vuelve a intentarlo con mejor cobertura.`,
    noSePudoPrepararZip: 'No se pudo preparar el ZIP. Hace falta conexión para armarlo.',
    teFalta: (label: string) => `Te falta ${label}. Fabrícalo en Mochila › Mesa de trabajo.`,
    acercateParaEscanear: 'Acércate al nodo físico para escanear su QR.',
    activaGpsParaQr: 'Activa GPS o usa modo debug para abrir este QR físico.',
    escaneaTarjetaQr: 'Escanea la tarjeta QR física de este nodo.',
    completaEtapaAnterior: 'Completa la etapa anterior antes de interactuar aquí.',
    yaEstasEnRango: 'Ya estás en rango. Pulsa el botón principal para abrir el nodo.',
    demasiadoLejos: (m: number) => `Demasiado lejos (${m}m). Acércate al nodo.`,
    fueraDeRango: 'Fuera de rango. Acércate al nodo.',
    gpsNoDisponibleActivalo: 'GPS no disponible. Actívalo para detectar tu posición.',
    completaNodoAnterior: 'Completa el nodo anterior antes de acceder a este.',
    nodoNoDisponibleTodavia: 'Este nodo no está disponible todavía.',
    unObjeto: 'un objeto',
    entraSinTerminar: (faltan: string) =>
      `Has entrado sin terminar la descarga (${faltan}). Todavía no está listo para jugar sin cobertura.`,
    mapaSinCompletar: (faltan: number) =>
      `El mapa se ha guardado a medias: faltan ${faltan} teselas. Vuelve a intentarlo con cobertura.`,
    partesDeLaCarga: { app: 'la app', mision: 'la misión', mapa: 'el mapa' },
    preparacionCompleta: 'Todo listo: app, misión y mapa guardados.',
  },
  gl: {
    subiendoFoto: 'Subindo foto…',
    activaGpsOFotoMapa: 'Activa o GPS ou usa o modo depuración para gardar a foto no mapa.',
    confirmarBorrarFoto: '¿Eliminar esta foto do mapa? Só podes borrar as túas propias fotos.',
    sinCoberturaBorradoFoto: 'Sen cobertura: a foto borrarase no servidor ao volver a rede.',
    sinPosicionParaFoto: 'Non hai posición para gardar a foto.',
    sinCoberturaFotoGuardada: 'Sen cobertura: a foto xa se ve, e subirase soa. 📷',
    noSePudoGuardarFotoReintenta: 'Non se puido gardar a foto. Téntao outra vez.',
    noSePudoGuardarFoto: 'Non se puido gardar a foto.',
    debugDesactivado: 'Depuración desactivada. Recuperando GPS real…',
    modoPruebaActivo: 'Modo proba activo. Toca un punto libre do mapa para colocar a túa ubicación.',
    posicionDebugActualizada: 'Posición de proba actualizada.',
    nodoActivoInexistente: 'Non hai ningún nodo activo neste momento.',
    centradoEnNodo: 'Centrado no nodo.',
    seguimientoActivado: 'Seguimento do xogador activado.',
    mapaLibreActivado: 'Mapa libre activado.',
    gpsNoDisponibleDispositivo: 'GPS non dispoñible neste dispositivo ou navegador.',
    gpsRequiereHttps:
      'O GPS require HTTPS ou abrir SAGA como app instalada desde a pantalla de inicio.',
    solicitandoPermisoUbicacion: 'Solicitando permiso de localización… acepta o aviso do navegador.',
    gpsRealActivado: 'GPS real activado.',
    gpsPrecisoNoResponde:
      'O GPS de precisión non responde aquí -zona de monte ou cobertura densa-. Usando localización aproximada por rede mentres tanto.',
    permisoUbicacionDenegado:
      'Permiso de localización denegado. No iPhone revisa Configuración > Safari > Localización, ou elimina e volve a engadir a PWA.',
    noSePudoObtenerUbicacion:
      'Non se puido obter a localización. Proba ao aire libre, activa Localización precisa e reténtao.',
    gpsImpreciso: (n: number) =>
      `GPS impreciso (${n} m). Agardando unha lectura mellor para desbloquear o nodo.`,
    misionDescargada: (n: number) => `Misión descargada para xogar sen conexión (${n} nodos).`,
    noSePudoDescargarMision: 'Non se puido descargar a misión sen conexión.',
    paquetesIncompletos: (n: number) =>
      `Faltan ${n} ficheiros da aplicación por gardar. Con cobertura, preme Descargar outra vez.`,
    preparandoZip: 'Preparando arquivo ZIP...',
    descargaZipCompletada: 'Descarga do ZIP completada',
    zipFaltanFotos: (fallidas: number, total: number) =>
      `ZIP descargado, pero faltan ${fallidas} de ${total} fotos. Téntao de novo con mellor cobertura.`,
    noSePudoPrepararZip: 'Non se puido preparar o ZIP. Fai falta conexión para armalo.',
    teFalta: (label: string) => `Fáltache ${label}. Fabrícao na Mochila › Mesa de traballo.`,
    acercateParaEscanear: 'Achégate ao nodo físico para escanear o seu QR.',
    activaGpsParaQr: 'Activa o GPS ou usa o modo depuración para abrir este QR físico.',
    escaneaTarjetaQr: 'Escanea a tarxeta QR física deste nodo.',
    completaEtapaAnterior: 'Completa a etapa anterior antes de interactuar aquí.',
    yaEstasEnRango: 'Xa estás no rango. Pulsa o botón principal para abrir o nodo.',
    demasiadoLejos: (m: number) => `Demasiado lonxe (${m}m). Achégate ao nodo.`,
    fueraDeRango: 'Fóra de rango. Achégate ao nodo.',
    gpsNoDisponibleActivalo: 'GPS non dispoñible. Actívao para detectar a túa posición.',
    completaNodoAnterior: 'Completa o nodo anterior antes de acceder a este.',
    nodoNoDisponibleTodavia: 'Este nodo aínda non está dispoñible.',
    unObjeto: 'un obxecto',
    entraSinTerminar: (faltan: string) =>
      `Entraches sen rematar a descarga (${faltan}). Aínda non está listo para xogar sen cobertura.`,
    mapaSinCompletar: (faltan: number) =>
      `O mapa gardouse a medias: faltan ${faltan} teselas. Téntao de novo con cobertura.`,
    partesDeLaCarga: { app: 'a app', mision: 'a misión', mapa: 'o mapa' },
    preparacionCompleta: 'Todo listo: app, misión e mapa gardados.',
  },
} as const

export type NoticeTone = 'info' | 'warn' | 'success'
export type FocusRequest = {
  target: 'player' | 'node' | 'route'
  token: number
} | null

export function vibrate(pattern: number | number[]) {
  haptics.vibrate(pattern)
}

export function getUserFromUrl(): string {
  const params = new URLSearchParams(window.location.search)
  return params.get('user') || 'PLAYER 1'
}

export function isPhysicalQrStage(stage: PlayerStage | null): boolean {
  if (!stage || typeof stage !== 'object') return false

  const record = stage as unknown as Record<string, unknown>
  const config =
    record.config && typeof record.config === 'object'
      ? (record.config as Record<string, unknown>)
      : {}
  if (config.is_map_collectible || record.is_map_collectible) {
    return false
  }

  const flatKind = record.physical_node_kind || record.physical_item_kind

  if (
    flatKind === 'collectible' ||
    flatKind === 'requirement' ||
    flatKind === 'clue' ||
    flatKind === 'bonus'
  ) {
    return true
  }

  const physicalQr = record.physical_qr
  if (physicalQr && typeof physicalQr === 'object') {
    const kind = (physicalQr as Record<string, unknown>).kind
    return kind === 'collectible' || kind === 'requirement' || kind === 'clue' || kind === 'bonus'
  }

  return false
}

/**
 * Nodo mas alto visto en esta sesion.
 *
 * Vive en memoria a proposito. Guardarlo en el telefono fue lo que se probo dos
 * veces y salio mal: un movil con datos viejos le imponia su version al
 * servidor y no habia forma de ponerlos de acuerdo. Asi, al cerrar la app se
 * olvida, de modo que un reset hecho desde administracion entra sin pelear. Lo
 * unico que impide es que la partida se deshaga en pantalla mientras se juega.
 *
 * La regla vive en `offline/revisiones.ts` (`mantenerNivel`), junto al resto de
 * decisiones de "que gana, el movil o el servidor", para poder probarla sin
 * navegador. Se re-exporta aqui con el mismo nombre de siempre.
 */
export { mantenerNivel } from './offline/revisiones'

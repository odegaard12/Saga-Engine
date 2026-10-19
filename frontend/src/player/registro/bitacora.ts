/**
 * Caja negra del jugador: cada paso de la partida, guardado en el móvil aunque no haya red y subido en lotes al volver.
 *
 * Para qué: al revisar una partida, saber qué pasó de verdad (la app se cerró sola con un nodo abierto, el servidor
 * falló al avanzar, se fue el GPS, el QR no se leía…) y devolver el tiempo que la app le hizo perder a alguien; y
 * para el antitrampas, que vea por ejemplo la hora del móvil cambiada a mano. El servidor lo convierte en
 * incidencias y en una sugerencia de tiempo a devolver (backend/app/runtime/bitacora.py).
 *
 * Que no sature, ni el móvil ni la red:
 * - Cada entrada es diminuta (`{i, t, k, n, d}`) y sólo se anotan pasos, nunca cosas que pasan 60 veces por segundo.
 * - Se guarda en localStorage como mucho cada pocos segundos (y al salir de la app), con un tope de entradas: si se
 *   llena sin cobertura, se tiran las más viejas y se cuenta cuántas.
 * - Sube con cobertura, como mucho un lote por minuto (antes si se acumulan muchas), comprimido con gzip cuando el
 *   navegador sabe; si no llega, espera cada vez más (hasta 10 min). El servidor no duplica un lote reenviado.
 */

import { cuerpoGzip } from '../offline/peticiones'

type Valor = string | number | boolean
export type TipoDeEntrada =
  | 'inicio'
  | 'oculta'
  | 'visible'
  | 'sin_red'
  | 'con_red'
  | 'gps_error'
  | 'gps_vuelve'
  | 'hoja'
  | 'comenzar'
  | 'reto_fallo'
  | 'reto_superado'
  | 'reto_reinicio'
  | 'avance_ok'
  | 'avance_sin_red'
  | 'avance_rechazado'
  | 'avance_error'
  | 'codigo_mal'
  | 'qr_fallo'
  | 'camara_denegada'
  | 'error'
  | 'reloj'

type Entrada = { i: number; t: number; k: TipoDeEntrada; n?: string; d?: Record<string, Valor> }
type Guardado = { s: string; seq: number; perdidas: number; entradas: Entrada[] }

const DESTINO = '/api/bitacora'
const CLAVE = 'saga:bitacora:'
const CLAVE_ABIERTA = 'saga:bitacora-abierta:'
/**
 * Última señal de vida con un nodo abierto (se SOBRESCRIBE cada 15 s; no son entradas): si la app muere, el próximo
 * arranque sabe cuánto estuvo caída de verdad, no desde el último paso anotado (que pudo ser minutos antes).
 */
const CLAVE_PULSO = 'saga:bitacora-pulso:'
const PULSO_CADA_MS = 15_000
const MAX_ENTRADAS = 1500
const MAX_POR_LOTE = 300
const GUARDAR_CADA_MS = 8000
const SUBIR_CADA_MS = 60_000
/** Tras una subida buena con más cola detrás (vuelta de un tramo largo sin red), el siguiente lote sale enseguida. */
const VACIAR_CADA_MS = 6000
const SUBIR_YA_CON = 150
const ESPERA_MAXIMA_MS = 10 * 60_000
const LIMITE_SUBIDA_MS = 20_000
/** Un salto así entre el reloj del móvil y el reloj interno (que no se puede tocar) es la hora cambiada a mano. */
const SALTO_DE_RELOJ_MS = 2 * 60_000

let usuario = ''
let estado: Guardado | null = null
let nodo = ''
let enReto = false
let sucio = false
let subiendo = false
let siguienteSubida = 0
let espera = 0
let desfaseBase = 0
let ocultaDesde = 0
let sinRedDesde = 0
let gpsCaidoDesde = 0
let relojAvisado = false
let fueraDesde: { pared: number; interno: number } | null = null
let instalado = false

function leer(u: string): Guardado {
  try {
    const crudo = JSON.parse(localStorage.getItem(CLAVE + u) || 'null') as Guardado | null
    if (crudo && Array.isArray(crudo.entradas)) return crudo
  } catch {
    // Roto o sin almacenamiento: se empieza de cero.
  }
  return { s: '', seq: 0, perdidas: 0, entradas: [] }
}

function guardar(): void {
  if (!estado || !sucio) return
  sucio = false
  try {
    localStorage.setItem(CLAVE + usuario, JSON.stringify(estado))
  } catch {
    // Lleno: se queda en memoria; si la app se cierra, se pierde (es diagnóstico, no partida).
  }
}

function meter(entrada: Entrada): void {
  if (!estado) return
  estado.entradas.push(entrada)
  if (estado.entradas.length > MAX_ENTRADAS) {
    const sobran = estado.entradas.length - MAX_ENTRADAS
    estado.entradas.splice(0, sobran)
    estado.perdidas += sobran
  }
  sucio = true
}

/**
 * La hora cambiada a mano: el reloj del sistema salta respecto al interno (`performance.now()`, que no se puede tocar).
 * Sólo con la app a la vista y re-anclado al volver: en Android el reloj interno se PARA mientras el móvil duerme, y
 * sin esto cada bloqueo de pantalla largo parecía una hora cambiada (falsa sospecha).
 */
function anclarReloj(): void {
  desfaseBase = typeof performance !== 'undefined' ? Date.now() - performance.now() : 0
}

function vigilarReloj(ahora: number): void {
  if (relojAvisado || !estado || typeof performance === 'undefined') return
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
  const desfase = ahora - performance.now()
  if (Math.abs(desfase - desfaseBase) > SALTO_DE_RELOJ_MS) {
    relojAvisado = true
    meter({ i: ++estado.seq, t: ahora, k: 'reloj', d: { salto_ms: Math.round(desfase - desfaseBase) } })
  }
}

/** Apunta un paso. `n`: el nodo (si no, el que esté abierto). Nunca lanza. */
export function anotar(k: TipoDeEntrada, d?: Record<string, Valor>, n?: string): void {
  if (!estado) return
  try {
    const t = Date.now()
    vigilarReloj(t)
    const entrada: Entrada = { i: ++estado.seq, t, k }
    const deQueNodo = n ?? nodo
    if (deQueNodo) entrada.n = deQueNodo
    if (d && Object.keys(d).length) entrada.d = d
    meter(entrada)
    // Guardado al momento (si la app muere justo después, es lo que más importa); sólo los fallos dentro de un reto,
    // que pueden llegar seguidos, esperan al guardado periódico.
    if (k !== 'reto_fallo') guardar()
    if (estado.entradas.length >= SUBIR_YA_CON) void subir()
  } catch {
    // La caja negra nunca puede romper la partida.
  }
}

/** El nodo abierto ahora (lo usan las entradas que no dicen otro); `null` al cerrarlo. */
export function ponerNodo(id: string | number | null | undefined): void {
  nodo = id == null ? '' : String(id)
  if (!nodo) {
    enReto = false
    try {
      localStorage.removeItem(CLAVE_PULSO + usuario)
    } catch {
      // Ídem.
    }
  }
}

export function retoEnMarcha(si: boolean): void {
  enReto = si
}

/** Un fallo dentro de un reto (lo llama la vibración de error, que es lo que todos los juegos tocan al fallar). */
export function falloDeReto(): void {
  if (enReto) anotar('reto_fallo')
}

/** Sube un lote si toca y hay red. Sólo borra del móvil lo que el servidor dice que ya tiene. */
export async function subir(forzar = false): Promise<void> {
  if (!estado || !usuario || subiendo || !estado.entradas.length) return
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return
  if (!forzar && Date.now() < siguienteSubida) return
  subiendo = true
  const lote = estado.entradas.slice(0, MAX_POR_LOTE)
  try {
    const texto = JSON.stringify({
      user: usuario,
      s: estado.s,
      entries: lote,
      perdidas: estado.perdidas,
      client_sent_at_ms: Date.now(),
    })
    const { body, gzip } = await cuerpoGzip(texto)
    // Con límite (revisión 19/10): con una barra la petición se quedaba colgada y `subiendo` no se soltaba nunca, así
    // que la caja negra dejaba de subir hasta recargar. 20 s cubren también la lectura de la respuesta.
    const control = new AbortController()
    const corte = setTimeout(() => control.abort(), LIMITE_SUBIDA_MS)
    let r: Response
    let datos: { aceptadas?: number }
    try {
      r = await fetch(DESTINO, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(gzip ? { 'Content-Encoding': 'gzip' } : {}) },
        credentials: 'include',
        body,
        signal: control.signal,
      })
      // 400/413: ese lote no va a entrar nunca; se tira para no atascar la caja. 403/429/5xx: se reintenta luego.
      if (!(r.ok || r.status === 400 || r.status === 413)) throw new Error(String(r.status))
      datos = (await r.json().catch(() => ({}))) as { aceptadas?: number }
    } finally {
      clearTimeout(corte)
    }
    const quitar = r.ok ? Math.min(lote.length, Number(datos.aceptadas) || lote.length) : lote.length
    const ultimo = lote[quitar - 1]?.i ?? 0
    estado.entradas = estado.entradas.filter((e) => e.i > ultimo)
    estado.perdidas = 0
    sucio = true
    guardar()
    espera = 0
    const quedaCola = estado.entradas.length >= MAX_POR_LOTE
    siguienteSubida = Date.now() + (quedaCola ? VACIAR_CADA_MS : SUBIR_CADA_MS)
    if (quedaCola) window.setTimeout(() => void subir(), VACIAR_CADA_MS)
  } catch {
    espera = espera ? Math.min(espera * 2, ESPERA_MAXIMA_MS) : SUBIR_CADA_MS
    siguienteSubida = Date.now() + espera
  } finally {
    subiendo = false
  }
}

/**
 * Tras un latido que fue bien (lo llama PlayerApp): la caja sube si le toca, aprovechando que la radio ya está
 * despierta, en vez de despertarla otra vez por su cuenta (revisión 19/10). Si esperaba por un fallo, ese latido
 * demuestra que ya hay red y deja de esperar.
 */
export function trasLatidoBueno(): void {
  if (espera) siguienteSubida = 0
  void subir()
}

function marcarAbierta(): void {
  try {
    localStorage.setItem(CLAVE_ABIERTA + usuario, '1')
  } catch {
    // Sin almacenamiento no se distingue un cierre inesperado; da igual.
  }
}

/** Arranca la caja negra de este jugador (una vez por carga de la app). */
export function instalarBitacora(u: string, version = ''): void {
  if (!u || typeof window === 'undefined' || (instalado && u === usuario)) return
  guardar()
  usuario = u
  estado = leer(u)
  // Cada sesión con su id: el servidor usa (sesión, número) para no duplicar lo reenviado.
  estado.s = Math.random().toString(36).slice(2, 10)
  anclarReloj()
  relojAvisado = false

  // Si la sesión anterior no llegó a cerrarse (no hubo `pagehide`), la app murió con ella abierta.
  let previo = 'ok'
  let caida = 0
  try {
    if (localStorage.getItem(CLAVE_ABIERTA + u)) {
      previo = 'cerrada_mal'
      const pulso = Number(localStorage.getItem(CLAVE_PULSO + u)) || 0
      if (pulso) caida = Math.max(0, Date.now() - pulso)
    }
    localStorage.removeItem(CLAVE_PULSO + u)
  } catch {
    previo = 'desconocido'
  }
  marcarAbierta()
  anotar('inicio', { v: version, red: navigator.onLine !== false, previo, ...(caida ? { caida_ms: caida } : {}) })
  guardar()

  if (instalado) return
  instalado = true

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      ocultaDesde = Date.now()
      fueraDesde = typeof performance !== 'undefined' ? { pared: Date.now(), interno: performance.now() } : null
      anotar('oculta', { reto: enReto })
      guardar()
    } else {
      // Fuera de la app el reloj del sistema sólo puede ir POR DELANTE del interno (el móvil durmió). Si va por detrás,
      // alguien atrasó la hora mientras estaba fuera: justo lo que haría para recortar tiempos.
      if (fueraDesde && !relojAvisado && estado) {
        const atraso = performance.now() - fueraDesde.interno - (Date.now() - fueraDesde.pared)
        if (atraso > SALTO_DE_RELOJ_MS) {
          relojAvisado = true
          meter({ i: ++estado.seq, t: Date.now(), k: 'reloj', d: { salto_ms: -Math.round(atraso), fuera: true } })
        }
      }
      fueraDesde = null
      anclarReloj()
      anotar('visible', { ms: ocultaDesde ? Date.now() - ocultaDesde : 0 })
      marcarAbierta()
      void subir()
    }
  })
  window.addEventListener('pagehide', () => {
    guardar()
    try {
      localStorage.removeItem(CLAVE_ABIERTA + usuario)
    } catch {
      // Ídem.
    }
  })
  window.addEventListener('pageshow', marcarAbierta)
  window.addEventListener('offline', () => {
    sinRedDesde = Date.now()
    anotar('sin_red')
  })
  window.addEventListener('online', () => {
    anotar('con_red', { ms: sinRedDesde ? Date.now() - sinRedDesde : 0 })
    sinRedDesde = 0
  })
  // Al volver la red ya no se fuerza la subida en 'online' (revisión 19/10): todos los módulos salían a la vez y la
  // primera barra se saturaba. Se espera a que PlayerApp avise de que la cola de avances ya subió ('saga:red-ok') y
  // aun así 10-15 s, respetando la espera que toque.
  window.addEventListener('saga:red-ok', () => {
    window.setTimeout(() => void subir(), 10_000 + Math.random() * 5_000)
  })
  window.setInterval(guardar, GUARDAR_CADA_MS)
  window.setInterval(() => {
    if (!nodo || document.visibilityState !== 'visible') return
    try {
      localStorage.setItem(CLAVE_PULSO + usuario, String(Date.now()))
    } catch {
      // Sin almacenamiento, la caída se estima por el último paso (como antes).
    }
  }, PULSO_CADA_MS)
  window.setInterval(() => {
    if (document.visibilityState === 'visible') void subir()
  }, SUBIR_CADA_MS / 2)
}

/** El GPS: se anota al caer y al volver (con cuánto estuvo caído), no cada lectura. */
export function gpsEnLaCaja(ok: boolean, codigo?: number): void {
  if (!ok && !gpsCaidoDesde) {
    gpsCaidoDesde = Date.now()
    anotar('gps_error', codigo != null ? { codigo } : undefined)
  } else if (ok && gpsCaidoDesde) {
    anotar('gps_vuelve', { ms: Date.now() - gpsCaidoDesde })
    gpsCaidoDesde = 0
  }
}

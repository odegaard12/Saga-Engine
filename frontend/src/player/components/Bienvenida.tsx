/**
 * 20/11 (propuesta A elegida por Óscar): al abrir el juego con la sesión ya iniciada (entrada directa desde la portada),
 * antes de nada sale una bienvenida con la foto del login, la marca SAGA, tu cara, «Hola, …», el tiempo de MeteoCatoira y
 * dos botones: «Seguir jugando» y «No soy yo · cambiar de jugador». Mientras, la partida se prepara por detrás (barra fina
 * abajo): al pulsar «Seguir» la bienvenida se funde y debajo está la carga o ya el mapa.
 *
 * Va encima de PlayerApp (App.tsx) y PlayerApp le publica el avance, el nombre y la cara con `publicarBienvenida`.
 */
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { PrevisionDePartida } from './TiempoDelJuego'
import { creditosDelMapa } from './creditosMapa'
import { fetchPublicConfig } from '../../shared/api'
import { cachePublicConfig, getCachedPublicConfig } from '../../shared/offlinePublicConfig'
import { getPlayerNameFromLocation } from '../../shared/playerRoute'
import { elegirFoto, esFotoDePerfil, fotoDeArchivo, guardarMiFoto, leerMiFoto, recordarMiFoto } from '../../shared/miFoto'

type Datos = { pct: number | null; nombre: string | null; cara: string | null }
let datos: Datos = { pct: null, nombre: null, cara: null }
const avisar = new Set<() => void>()

export function publicarBienvenida(p: Partial<Datos>): void {
  if ((Object.keys(p) as (keyof Datos)[]).every((k) => datos[k] === p[k])) return
  datos = { ...datos, ...p }
  avisar.forEach((f) => f())
}
/** Lo último publicado: la pantalla de carga enseña el MISMO nombre y la MISMA foto (ver CabeceraDeBienvenida). */
export const datosDeBienvenida = (): Readonly<Datos> => datos
const suscribir = (f: () => void) => {
  avisar.add(f)
  return () => avisar.delete(f)
}

/**
 * 21/11 (Óscar: «el diseño de antes pero con MI FOTO del login»): la foto de perfil del jugador de la URL.
 * 23/11 («ahí pone foto avatar pero no la mía»): primero SU COPIA en este móvil (ver shared/miFoto.ts: instantánea y sin red,
 * hecha con la foto que ve en el login), y si no hay, la del servidor: `servidor` (la de la partida, cuando llega) o la de la
 * copia guardada de la configuración. Nunca otra imagen: sin foto, null y la bienvenida ofrece «Poner mi foto».
 */
export function fotoDelJugador(servidor: string | null = null): string | null {
  try {
    const user = getPlayerNameFromLocation()
    const delServidor = servidor ?? fotoDePerfil(user ? getCachedPublicConfig()?.player_profiles?.find((p) => p.id === user) : null)
    return elegirFoto(leerMiFoto(user), delServidor)
  } catch {
    return null
  }
}

/** La foto de una ficha de jugador (la del login), o null si no tiene o no es una foto nuestra (JPEG/PNG/WebP o `/api/player-avatar/`). */
export function fotoDePerfil(perfil: { avatar_url?: string; avatar_ref?: string } | null | undefined): string | null {
  const url = String(perfil?.avatar_url || perfil?.avatar_ref || '').trim()
  return esFotoDePerfil(url) ? url : null
}

/** La portada marca la entrada directa con `?directo=1` (ver LoginApp). Se mira una vez y se quita de la dirección. */
export function hayBienvenida(): boolean {
  if (typeof window === 'undefined') return false
  const p = new URLSearchParams(window.location.search)
  if (p.get('directo') !== '1') return false
  p.delete('directo')
  const q = p.toString()
  window.history.replaceState(
    window.history.state,
    '',
    window.location.pathname + (q ? `?${q}` : '')
  )
  return true
}

const TX = {
  es: {
    hola: 'Hola',
    seguir: 'Seguir jugando',
    cambiar: 'No soy yo · cambiar de jugador',
    prep: 'Preparando tu partida…',
    lista: 'Tu partida está lista',
    ponerFoto: 'Poner mi foto',
  },
  gl: {
    hola: 'Ola',
    seguir: 'Seguir xogando',
    cambiar: 'Non son eu · cambiar de xogador',
    prep: 'Preparando a túa partida…',
    lista: 'A túa partida está lista',
    ponerFoto: 'Poñer a miña foto',
  },
}

/**
 * El título y el subtítulo de la portada: lo que el organizador escribe en «Pantalla de inicio de sesión» (como en
 * LoginApp); si no hay nada, el nombre del sitio, y si tampoco, «SAGA».
 */
function textosDePortada(): { titulo: string; sub: string } {
  const c = getCachedPublicConfig()
  const vale = (v?: string) => {
    const t = String(v || '').trim()
    return t && !t.toUpperCase().startsWith('PUT ') ? t : ''
  }
  return {
    titulo: vale(c?.login_title) || vale(c?.site_name) || 'SAGA',
    sub: vale(c?.login_subtitle) || vale(c?.story_title),
  }
}

/** Fotos ya pintadas en esta sesión: al volver a montarse (la carga bajo la bienvenida, el velo) sale ya puesta. */
const fotosVistas = new Set<string>()

/**
 * Tu cara: la foto del login, que sólo se pone ya decodificada (nunca un círculo a medio bajar) y entra fundida la
 * primera vez; sin foto, o si no carga (sin red y sin guardar), tu inicial sobre el acento.
 */
function Cara({ foto, nombre, alFallar }: { foto: string | null; nombre: string; alFallar?: (foto: string) => void }) {
  const [decodificada, setDecodificada] = useState<string | null>(null)
  const vista = foto && fotosVistas.has(foto) ? foto : decodificada
  const [alMontar] = useState(vista)
  useEffect(() => {
    if (!foto || fotosVistas.has(foto)) return undefined
    let vivo = true
    const img = new Image()
    img.src = foto
    img
      .decode()
      .then(() => {
        fotosVistas.add(foto)
        if (vivo) setDecodificada(foto)
        // 23/11: la que se ve del servidor se queda en este móvil (si ya hay copia de esa URL no hace nada).
        if (foto.startsWith('/api/')) void recordarMiFoto(getPlayerNameFromLocation() || '', foto)
      })
      .catch(() => vivo && alFallar?.(foto))
    return () => {
      vivo = false
    }
  }, [foto, alFallar])
  return (
    <div data-saga-logo data-saga-foto={vista ? '' : undefined} style={caraMarco} aria-hidden="true">
      <span style={inicial}>{nombre.trim().charAt(0).toUpperCase()}</span>
      {vista ? (
        <img
          src={vista}
          alt=""
          draggable={false}
          style={{ ...caraImg, animation: vista === alMontar ? undefined : ENTRADA_DE_LA_CARA }}
        />
      ) : null}
    </div>
  )
}

/**
 * 21/11 (C1, elegida por Óscar): la cabecera de la bienvenida —marca, tu cara y una línea— que la pantalla de carga
 * repite IGUAL (mismo componente, misma columna): al pulsar «Seguir» la bienvenida se funde y debajo la cabecera ya
 * está en el mismo sitio; sólo se van los botones y aparecen la barra y la tarjeta.
 */
export function CabeceraDeBienvenida({
  nombre,
  foto,
  linea,
  alFallar,
}: {
  nombre: string
  foto: string | null
  linea: ReactNode
  alFallar?: (foto: string) => void
}) {
  const [portada] = useState(textosDePortada)
  return (
    <div style={cabeceraEstilo}>
      <div style={{ marginTop: 'max(40px, 7vh)', textAlign: 'center' }}>
        <div
          style={
            portada.titulo.length > 8
              ? { ...marca, fontSize: 30, letterSpacing: '.04em', paddingLeft: 0 }
              : marca
          }
        >
          {portada.titulo}
        </div>
        {portada.sub ? <div style={sub}>{portada.sub}</div> : null}
      </div>
      <Cara foto={foto} nombre={nombre || portada.titulo} alFallar={alFallar} />
      <div style={hola}>{linea}</div>
    </div>
  )
}

export function Bienvenida({ usuario }: { usuario: string }) {
  const d = useSyncExternalStore(suscribir, () => datos)
  const [saliendo, setSaliendo] = useState(false)
  const [fuera, setFuera] = useState(false)
  // 20/11 (QA): la foto salía de golpe a medio bajar. Se pide aquí y entra fundida cuando YA está entera; hasta
  // entonces, el velo sobre el fondo liso.
  const [fotoLista, setFotoLista] = useState(false)
  useEffect(() => {
    let vivo = true
    const img = new Image()
    img.onload = () => vivo && setFotoLista(true)
    img.src = FOTO
    return () => {
      vivo = false
    }
  }, [])
  const tx =
    typeof localStorage !== 'undefined' && localStorage.getItem('saga_locale') === 'gl'
      ? TX.gl
      : TX.es
  // 23/11: su foto (copia en este móvil o del servidor); si no hay ninguna, se pregunta al servidor y, si tampoco la tiene
  // (purgada o nunca subida), se ofrece «Poner mi foto» en vez de dejar un círculo de relleno.
  const [version, setVersion] = useState(0)
  const [sinFoto, setSinFoto] = useState(false)
  const [rota, setRota] = useState<string | null>(null)
  const fotoActual = useMemo(() => fotoDelJugador(d.cara), [d.cara, version, usuario]) // eslint-disable-line react-hooks/exhaustive-deps
  const hayFoto = fotoActual !== null
  useEffect(() => {
    if (hayFoto) return undefined
    let vivo = true
    fetchPublicConfig()
      .then((config) => {
        cachePublicConfig(config)
        const perfil = config.player_profiles?.find((p) => p.id === usuario)
        if (!vivo || !perfil) return
        if (fotoDePerfil(perfil)) setVersion((v) => v + 1)
        else setSinFoto(true)
      })
      .catch(() => undefined)
    return () => {
      vivo = false
    }
  }, [hayFoto, usuario])
  // La copia del móvil se ve al instante; si el servidor (la partida) trae OTRA foto (se cambió en el panel), se refresca.
  useEffect(() => {
    const copia = leerMiFoto(usuario)
    if (!d.cara || !copia || copia.u === '' || copia.u === d.cara) return
    void recordarMiFoto(usuario, d.cara).then((hecho) => hecho && setVersion((v) => v + 1))
  }, [d.cara, usuario])
  const entrada = useRef<HTMLInputElement>(null)
  const alElegirFoto = (archivo: File | undefined) => {
    if (!archivo) return
    fotoDeArchivo(archivo)
      .then((d64) => {
        if (guardarMiFoto(usuario, { u: '', d: d64 })) {
          setSinFoto(false)
          setRota(null)
          setVersion((v) => v + 1)
        }
      })
      .catch(() => undefined)
  }
  const ofrecerFoto = (sinFoto || (rota !== null && rota === fotoActual)) && (typeof navigator === 'undefined' || navigator.onLine !== false)
  useEffect(() => {
    if (!saliendo) return undefined
    // Holgado sobre SALIDA (320 ms, o 120 con «reducir movimiento»): se desmonta ya apagada.
    const id = window.setTimeout(() => setFuera(true), 420)
    return () => window.clearTimeout(id)
  }, [saliendo])
  // 20/11 (QA): la barra nunca retrocede (al quedar el mapa «al día» el total se recalculaba y bajaba de 99 % a 40 %),
  // y mientras se comprueba sigue donde iba en vez de volver a una franja fija.
  const maxPct = useRef<number | null>(null)
  if (d.pct !== null) maxPct.current = Math.max(maxPct.current ?? 0, d.pct)
  const pct = maxPct.current
  if (fuera) return null
  const nombre = d.nombre || usuario
  const lista = pct !== null && pct >= 100
  return createPortal(
    <div
      data-saga-bienvenida
      style={{
        ...capa,
        overflowY: 'auto',
        opacity: saliendo ? 0 : 1,
        pointerEvents: saliendo ? 'none' : 'auto',
      }}
    >
      <style>
        {/* La tarjeta del tiempo llega cuando contesta la previsión: sube y se funde (ya va al final: no empuja nada). */}
        {`[data-saga-bienvenida-tiempo] > * { animation: ${ENTRADA_DEL_TIEMPO}; }`}
      </style>
      {fotoLista ? (
        <div style={{ ...foto, position: 'fixed', animation: ENTRADA_DE_LA_FOTO }} />
      ) : null}
      <div style={{ ...velo, position: 'fixed' }} />
      {/* 20/11 (QA): todo apilado desde arriba y el tiempo AL FINAL: cuando llega su tarjeta no empuja nada (antes
          un hueco elástico pegaba todo abajo y al llegar el tiempo la cara y los botones saltaban ~140 px). */}
      <div style={COLUMNA_DE_BIENVENIDA}>
        {/* 21/11: su FOTO del login, no la cara del personaje 3D; antes de que llegue la partida, la de la copia guardada
            de la configuración (la de la portada). */}
        <CabeceraDeBienvenida
          nombre={nombre}
          foto={fotoActual}
          linea={`${tx.hola}, ${nombre}`}
          alFallar={setRota}
        />
        {ofrecerFoto ? (
          <>
            <input
              ref={entrada}
              type="file"
              accept="image/*"
              capture="user"
              hidden
              onChange={(e) => alElegirFoto(e.target.files?.[0])}
            />
            <button type="button" style={ponerFotoEstilo} onClick={() => entrada.current?.click()}>
              {tx.ponerFoto}
            </button>
          </>
        ) : null}
        <button type="button" style={{ ...boton, ...primario }} onClick={() => setSaliendo(true)}>
          {tx.seguir}
        </button>
        <button
          type="button"
          style={{ ...boton, ...secundario }}
          onClick={() => window.location.assign('/?cambiar=1')}
        >
          {tx.cambiar}
        </button>
        <div style={{ width: '100%', marginTop: 14 }}>
          <div style={pistaEstilo}>
            <div
              style={{
                ...relleno,
                width: pct === null ? '6%' : `${Math.max(4, pct)}%`,
                background: lista ? VERDE : AZUL,
              }}
            />
          </div>
          <div style={fila}>
            <span>{lista ? tx.lista : tx.prep}</span>
            {pct !== null ? <span>{Math.round(pct)} %</span> : null}
          </div>
        </div>
        {/* 21/11: el tiempo, abajo del todo como la tarjeta de la carga, y en su mismo sitio (debajo van los créditos de
            la carga, aquí ocultos para ocupar lo mismo). Pegado abajo con el margen y no con un hueco elástico: lo de
            arriba no se mueve cuando llega. */}
        <div data-saga-bienvenida-tiempo style={{ width: '100%', marginTop: 'auto', paddingTop: 14 }}>
          <PrevisionDePartida />
        </div>
        <p aria-hidden="true" style={{ ...PIE_DE_CREDITOS, visibility: 'hidden' }}>
          {creditosDelMapa(tx === TX.gl ? 'gl' : 'es')}
        </p>
      </div>
    </div>,
    document.body
  )
}

const FOTO = '/login-fondo.jpg'
/** La cara, ya decodificada, entra fundiendo (sólo opacidad: igual con «reducir movimiento»). */
const ENTRADA_DE_LA_CARA = 'sagaCapaEntra var(--saga-dur-larga) var(--saga-curva-entra) both'
/** La foto, ya cargada, aparece fundiendo (sagaCapaEntra: sólo opacidad). */
const ENTRADA_DE_LA_FOTO = 'sagaCapaEntra var(--saga-dur-larga) var(--saga-curva-entra) both'
/** La tarjeta del tiempo sube un poco y se funde (sagaPanelEntra: con «reducir movimiento», sólo el fundido). */
const ENTRADA_DEL_TIEMPO = 'sagaPanelEntra var(--saga-dur-larga) var(--saga-curva-entra) both'
/** La bienvenida se apaga al pulsar «Seguir»; la entrada es el fundido de la portada de encima (PuertaDeMision). */
const SALIDA = 'opacity var(--saga-dur-larga) var(--saga-curva-sale)'
const VERDE = 'var(--s-ok, #22c55e)' // no-tema
const AZUL = 'var(--s-acento, #38bdf8)' // no-tema
const capa: CSSProperties = { position: 'fixed', inset: 0, zIndex: 1000002, color: '#fff', transition: SALIDA, background: '#0b1622' } // no-tema: sobre la foto del login
const foto: CSSProperties = { position: 'absolute', inset: 0, background: `#0b1622 url(${FOTO}) center 30% / cover` } // no-tema: sobre la foto del login
const velo: CSSProperties = { position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(6,19,15,.15) 0%, rgba(10,22,34,.55) 45%, rgba(8,16,26,.96) 80%)' } // no-tema: sobre la foto del login
/** El fondo de la bienvenida (foto del login + velo), que la pantalla de carga pone igual. */
export const FONDO_DE_BIENVENIDA = { foto, velo }
/** La columna de la bienvenida y de la carga: mismos márgenes, misma anchura → la cabecera no salta de una a otra. */
export const COLUMNA_DE_BIENVENIDA: CSSProperties = {
  position: 'relative',
  minHeight: '100%',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  padding: '0 22px',
  paddingTop: 'env(safe-area-inset-top)',
  paddingBottom: 'max(14px, env(safe-area-inset-bottom))',
  maxWidth: 460,
  margin: '0 auto',
  boxSizing: 'border-box',
}
/**
 * Lo que va directamente sobre la foto (oscura en todos los temas) se lee en claro también en Día: los tokens de texto
 * se pisan SÓLO en ese bloque; las tarjetas (tiempo, permisos) siguen con los del tema.
 */
export const SOBRE_LA_FOTO = {
  '--s-texto': '#ffffff', // no-tema: sobre la foto del login
  '--s-texto-2': 'rgba(255,255,255,.82)', // no-tema: sobre la foto del login
  '--s-texto-3': 'rgba(255,255,255,.62)', // no-tema: sobre la foto del login
  '--s-borde': 'rgba(255,255,255,.28)', // no-tema: sobre la foto del login
  '--s-aviso': '#fbbf24', // no-tema: sobre la foto del login
  color: 'var(--s-texto)',
} as CSSProperties
/** El pie de créditos de la carga (`creditos` en PantallaDeCarga): la bienvenida reserva su alto con uno oculto. */
const PIE_DE_CREDITOS: CSSProperties = { margin: '18px 0 0', maxWidth: 300, fontSize: 10.5, lineHeight: 1.35 }
const cabeceraEstilo: CSSProperties = { width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }
const marca: CSSProperties = { fontWeight: 900, letterSpacing: '.18em', fontSize: 42, textShadow: '0 2px 18px rgba(0,0,0,.5)', paddingLeft: '.18em' } // no-tema: sobre la foto del login
const caraMarco: CSSProperties = { flexShrink: 0, marginTop: 'max(22px, 5vh)', width: 92, height: 92, borderRadius: '50%', background: 'linear-gradient(145deg, var(--s-acento), color-mix(in srgb, var(--s-acento) 55%, black))', border: '3px solid var(--s-acento, #38bdf8)', overflow: 'hidden', display: 'grid', placeItems: 'center', position: 'relative', boxShadow: '0 8px 28px rgba(0,0,0,.45)' } // no-tema: sobre la foto del login
const caraImg: CSSProperties = {
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  objectFit: 'cover',
}
const inicial: CSSProperties = { fontSize: 40, fontWeight: 900, color: '#fff', textShadow: '0 2px 8px rgba(0,0,0,.25)' } // no-tema: sobre el acento
const sub: CSSProperties = { fontSize: 15, opacity: 0.9, marginTop: 4, textShadow: '0 1px 10px rgba(0,0,0,.6)' } // no-tema
const hola: CSSProperties = { fontSize: 26, fontWeight: 800, marginTop: 10, textAlign: 'center', textShadow: '0 2px 12px rgba(0,0,0,.5)' } // no-tema: sobre la foto del login
const boton: CSSProperties = {
  width: '100%',
  minHeight: 54,
  borderRadius: 27,
  fontSize: 17,
  fontWeight: 800,
  marginTop: 12,
  cursor: 'pointer',
}
const primario: CSSProperties = { marginTop: 18, background: 'var(--s-acento, #38bdf8)', color: 'var(--s-acento-texto, #052033)', border: 0 } // no-tema: sobre la foto del login
const secundario: CSSProperties = { background: 'rgba(255,255,255,.1)', color: '#fff', border: '1px solid rgba(255,255,255,.28)', fontSize: 15 } // no-tema: sobre la foto del login
const ponerFotoEstilo: CSSProperties = { marginTop: 10, minHeight: 44, padding: '0 18px', borderRadius: 22, background: 'transparent', color: '#fff', border: '1px solid rgba(255,255,255,.4)', fontSize: 14, fontWeight: 700, cursor: 'pointer' } // no-tema: sobre la foto del login
const pistaEstilo: CSSProperties = { width: '100%', height: 6, borderRadius: 3, background: 'rgba(255,255,255,.15)', overflow: 'hidden' } // no-tema: sobre la foto del login
const relleno: CSSProperties = { height: '100%', borderRadius: 3, transition: 'width 400ms ease' }
const fila: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  fontSize: 12,
  opacity: 0.85,
  marginTop: 6,
}

/** Sale sólo si la portada entró directa (se decide una vez, al montar el jugador). */
export function BienvenidaSiToca({ usuario }: { usuario: string }) {
  const [toca] = useState(hayBienvenida)
  return toca ? <Bienvenida usuario={usuario} /> : null
}

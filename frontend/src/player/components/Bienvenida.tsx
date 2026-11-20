/**
 * 20/11 (propuesta A elegida por Óscar): al abrir el juego con la sesión ya iniciada (entrada directa desde la portada),
 * antes de nada sale una bienvenida con la foto del login, la marca SAGA, tu cara, «Hola, …», el tiempo de MeteoCatoira y
 * dos botones: «Seguir jugando» y «No soy yo · cambiar de jugador». Mientras, la partida se prepara por detrás (barra fina
 * abajo): al pulsar «Seguir» la bienvenida se funde y debajo está la carga o ya el mapa.
 *
 * Va encima de PlayerApp (App.tsx) y PlayerApp le publica el avance, el nombre y la cara con `publicarBienvenida`.
 */
import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { PrevisionDePartida } from './TiempoDelJuego'
import { getCachedPublicConfig } from '../../shared/offlinePublicConfig'

type Datos = { pct: number | null; nombre: string | null; cara: string | null }
let datos: Datos = { pct: null, nombre: null, cara: null }
const avisar = new Set<() => void>()

export function publicarBienvenida(p: Partial<Datos>): void {
  if ((Object.keys(p) as (keyof Datos)[]).every((k) => datos[k] === p[k])) return
  datos = { ...datos, ...p }
  avisar.forEach((f) => f())
}
const suscribir = (f: () => void) => {
  avisar.add(f)
  return () => avisar.delete(f)
}

/** La portada marca la entrada directa con `?directo=1` (ver LoginApp). Se mira una vez y se quita de la dirección. */
export function hayBienvenida(): boolean {
  if (typeof window === 'undefined') return false
  const p = new URLSearchParams(window.location.search)
  if (p.get('directo') !== '1') return false
  p.delete('directo')
  const q = p.toString()
  window.history.replaceState(window.history.state, '', window.location.pathname + (q ? `?${q}` : ''))
  return true
}

const TX = {
  es: { hola: 'Hola', seguir: 'Seguir jugando', cambiar: 'No soy yo · cambiar de jugador', prep: 'Preparando tu partida…', lista: 'Tu partida está lista' },
  gl: { hola: 'Ola', seguir: 'Seguir xogando', cambiar: 'Non son eu · cambiar de xogador', prep: 'Preparando a túa partida…', lista: 'A túa partida está lista' },
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

export function Bienvenida({ usuario }: { usuario: string }) {
  const [portada] = useState(textosDePortada)
  const d = useSyncExternalStore(suscribir, () => datos)
  const [saliendo, setSaliendo] = useState(false)
  const [fuera, setFuera] = useState(false)
  const tx = (typeof localStorage !== 'undefined' && localStorage.getItem('saga_locale') === 'gl') ? TX.gl : TX.es
  useEffect(() => {
    if (!saliendo) return undefined
    const id = window.setTimeout(() => setFuera(true), 420)
    return () => window.clearTimeout(id)
  }, [saliendo])
  // 20/11 (QA): la barra nunca retrocede (al quedar el mapa «al día» el total se recalculaba y bajaba de 99 % a 40 %),
  // y mientras se comprueba sigue donde iba en vez de volver a una franja fija.
  const maxPct = useRef<number | null>(null)
  if (d.pct !== null) maxPct.current = Math.max(maxPct.current ?? 0, d.pct)
  const pct = maxPct.current
  // La cara entra fundida cuando su imagen YA está cargada (antes, el círculo quedaba vacío un instante).
  const [caraLista, setCaraLista] = useState<string | null>(null)
  useEffect(() => {
    if (!d.cara) return undefined
    let vivo = true
    const img = new Image()
    img.onload = () => vivo && setCaraLista(d.cara)
    img.src = d.cara
    return () => {
      vivo = false
    }
  }, [d.cara])
  if (fuera) return null
  const nombre = d.nombre || usuario
  const lista = pct !== null && pct >= 100
  return createPortal(
    <div data-saga-bienvenida style={{ ...capa, overflowY: 'auto', opacity: saliendo ? 0 : 1, pointerEvents: saliendo ? 'none' : 'auto' }}>
      <style>{'@keyframes sagaBienvenidaCara { from { opacity: 0 } to { opacity: 1 } }'}</style>
      <div style={{ ...foto, position: 'fixed' }} />
      <div style={{ ...velo, position: 'fixed' }} />
      {/* 20/11 (QA): todo apilado desde arriba y el tiempo AL FINAL: cuando llega su tarjeta no empuja nada (antes
          un hueco elástico pegaba todo abajo y al llegar el tiempo la cara y los botones saltaban ~140 px). */}
      <div style={col}>
        <div style={{ marginTop: 'max(40px, 7vh)', textAlign: 'center' }}>
          <div style={portada.titulo.length > 8 ? { ...marca, fontSize: 30, letterSpacing: '.04em', paddingLeft: 0 } : marca}>
            {portada.titulo}
          </div>
          {portada.sub ? <div style={sub}>{portada.sub}</div> : null}
        </div>
        <div style={{ ...caraMarco, marginTop: 'max(22px, 5vh)' }}>
          <span style={inicial}>{nombre.slice(0, 1).toUpperCase()}</span>
          {caraLista ? <img src={caraLista} alt="" style={caraImg} /> : null}
        </div>
        <div style={hola}>
          {tx.hola}, {nombre}
        </div>
        <button type="button" style={{ ...boton, ...primario }} onClick={() => setSaliendo(true)}>
          {tx.seguir}
        </button>
        <button type="button" style={{ ...boton, ...secundario }} onClick={() => window.location.assign('/?cambiar=1')}>
          {tx.cambiar}
        </button>
        <div style={{ width: '100%', marginTop: 14 }}>
          <div style={pistaEstilo}>
            <div style={{ ...relleno, width: pct === null ? '6%' : `${Math.max(4, pct)}%`, background: lista ? VERDE : AZUL }} />
          </div>
          <div style={fila}>
            <span>{lista ? tx.lista : tx.prep}</span>
            {pct !== null ? <span>{Math.round(pct)} %</span> : null}
          </div>
        </div>
        <div style={{ width: '100%', marginTop: 14, paddingBottom: 'max(18px, env(safe-area-inset-bottom))' }}>
          <PrevisionDePartida />
        </div>
      </div>
    </div>,
    document.body
  )
}

const VERDE = 'var(--s-ok, #22c55e)' // no-tema
const AZUL = 'var(--s-acento, #38bdf8)' // no-tema
const capa: CSSProperties = { position: 'fixed', inset: 0, zIndex: 1000002, color: '#fff', transition: 'opacity 400ms ease', background: '#0b1622' } // no-tema: sobre la foto del login
const foto: CSSProperties = { position: 'absolute', inset: 0, background: '#0b1622 url(/login-fondo.jpg) center 30% / cover' } // no-tema: sobre la foto del login
const velo: CSSProperties = { position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(6,19,15,.15) 0%, rgba(10,22,34,.55) 45%, rgba(8,16,26,.96) 80%)' } // no-tema: sobre la foto del login
const col: CSSProperties = { position: 'relative', minHeight: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0 22px', maxWidth: 460, margin: '0 auto', boxSizing: 'border-box' }
const marca: CSSProperties = { fontWeight: 900, letterSpacing: '.18em', fontSize: 42, textShadow: '0 2px 18px rgba(0,0,0,.5)', paddingLeft: '.18em' } // no-tema: sobre la foto del login
const caraMarco: CSSProperties = { width: 92, height: 92, borderRadius: '50%', background: '#f2e6d8', border: '3px solid var(--s-acento, #38bdf8)', overflow: 'hidden', display: 'grid', placeItems: 'center', position: 'relative', boxShadow: '0 8px 28px rgba(0,0,0,.45)' } // no-tema: sobre la foto del login
const caraImg: CSSProperties = { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', animation: 'sagaBienvenidaCara 320ms ease both' }
const inicial: CSSProperties = { fontSize: 40, fontWeight: 900, color: '#1e293b' } // no-tema: sobre la foto del login
const sub: CSSProperties = { fontSize: 15, opacity: 0.9, marginTop: 4, textShadow: '0 1px 10px rgba(0,0,0,.6)' } // no-tema
const hola: CSSProperties = { fontSize: 26, fontWeight: 800, marginTop: 10, textAlign: 'center', textShadow: '0 2px 12px rgba(0,0,0,.5)' } // no-tema: sobre la foto del login
const boton: CSSProperties = { width: '100%', minHeight: 54, borderRadius: 27, fontSize: 17, fontWeight: 800, marginTop: 12, cursor: 'pointer' }
const primario: CSSProperties = { marginTop: 18, background: 'var(--s-acento, #38bdf8)', color: '#052033', border: 0 } // no-tema: sobre la foto del login
const secundario: CSSProperties = { background: 'rgba(255,255,255,.1)', color: '#fff', border: '1px solid rgba(255,255,255,.28)', fontSize: 15 } // no-tema: sobre la foto del login
const pistaEstilo: CSSProperties = { width: '100%', height: 6, borderRadius: 3, background: 'rgba(255,255,255,.15)', overflow: 'hidden' } // no-tema: sobre la foto del login
const relleno: CSSProperties = { height: '100%', borderRadius: 3, transition: 'width 400ms ease' }
const fila: CSSProperties = { display: 'flex', justifyContent: 'space-between', fontSize: 12, opacity: 0.85, marginTop: 6 }

/** Sale sólo si la portada entró directa (se decide una vez, al montar el jugador). */
export function BienvenidaSiToca({ usuario }: { usuario: string }) {
  const [toca] = useState(hayBienvenida)
  return toca ? <Bienvenida usuario={usuario} /> : null
}

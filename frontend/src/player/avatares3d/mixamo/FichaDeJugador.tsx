import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { getLocale } from '../../../i18n'
import type { TeamProfileLiveStatus } from '../../../types/player'
import { getPlayerAvatarUrl, getPlayerColor } from '../../../shared/playerIdentity'
import { elementoDeRetrato, urlDeFotoValida } from '../../avatares/retratoDeMapa'
import { useAreaVisible } from './areaVisible'
import { aspectoDe } from './catalogo'
import { crearEscenaDeTienda, type EscenaDeTienda } from './escenaTienda'
import {
  datosDeFicha,
  idiomaDeFicha,
  TEXTOS_FICHA,
  textoDeConexion,
  tiempoLegible,
} from './fichaJugador'
import './ficha.css'

/** Lo que dura la entrada de la hoja (`--saga-dur-larga`, ms): el muñeco 3D se crea DESPUÉS, sin pisar la animación. */
export const DURACION_FICHA_MS = 280

/**
 * La ficha de un compañero: la hoja inferior que sale al tocarlo en el mapa (en 2D, en 3D y en el
 * retrato lejano). Su muñeco 3D con su ropa y objetos girando (el escenario de la tienda: UN contexto
 * WebGL más, que se suelta al cerrar), su foto con el aro de su equipo, su conexión, los nodos hechos y
 * su tiempo, y dos botones: «Ir a él» (centra el mapa) y «Saludar» (un gesto de TU avatar).
 *
 * Sin cobertura enseña lo último que llegó del equipo y el muñeco sale de la caché del móvil (nunca de
 * la red); si no está, su retrato.
 */
export function FichaDeJugador({
  jugador,
  totalNodos,
  sinCobertura,
  alCerrar,
  alIrA,
  alSaludar,
}: {
  jugador: TeamProfileLiveStatus
  totalNodos: number
  sinCobertura?: boolean
  alCerrar: () => void
  alIrA: () => void
  alSaludar: () => void
}) {
  useAreaVisible()
  const idioma = idiomaDeFicha(getLocale())
  const t = TEXTOS_FICHA[idioma]
  const [saliendo, setSaliendo] = useState(false)
  const [sinModelo, setSinModelo] = useState(false)
  const [fotoRota, setFotoRota] = useState(false)
  const escenarioRef = useRef<HTMLDivElement | null>(null)
  const retratoRef = useRef<HTMLDivElement | null>(null)
  const escenaRef = useRef<EscenaDeTienda | null>(null)
  // «hace N min» avanza solo mientras la hoja está abierta.
  const [ahora, setAhora] = useState(() => Date.now())
  useEffect(() => {
    const reloj = window.setInterval(() => setAhora(Date.now()), 20000)
    return () => window.clearInterval(reloj)
  }, [])

  const datos = datosDeFicha(jugador, totalNodos, ahora)
  const nombre = datos.nombre || t.jugador
  const colorBruto = getPlayerColor(jugador)
  const color = /^#[0-9a-f]{6}$/i.test(colorBruto) ? colorBruto : '#3b82f6'
  const fotoUrl = getPlayerAvatarUrl(jugador)
  const foto = !fotoRota && urlDeFotoValida(fotoUrl) ? fotoUrl : ''
  const aspecto = useMemo(() => aspectoDe(jugador), [jugador])
  const claveAspecto = JSON.stringify(aspecto)

  // Cerrar = animación de salida y luego desmontar.
  const cerrarCon = (despues: () => void) => {
    if (saliendo) return
    setSaliendo(true)
    window.setTimeout(despues, DURACION_FICHA_MS)
  }
  const cerrar = () => cerrarCon(alCerrar)

  useEffect(() => {
    const alTecla = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') cerrar()
    }
    window.addEventListener('keydown', alTecla)
    return () => window.removeEventListener('keydown', alTecla)
  })

  // El muñeco: se crea cuando la hoja ya ha entrado (crear un contexto WebGL y leer un modelo da tirón).
  useEffect(() => {
    const escenario = escenarioRef.current
    if (!escenario) return undefined
    let vivo = true
    const reloj = window.setTimeout(() => {
      if (!vivo) return
      try {
        const escena = crearEscenaDeTienda(escenario, {
          permitirRed: false,
          peana: false,
          alPerderContexto: () => setSinModelo(true),
        })
        escenaRef.current = escena
        escena.mostrar(aspecto).catch(() => {
          if (vivo) setSinModelo(true)
        })
      } catch {
        setSinModelo(true)
      }
    }, DURACION_FICHA_MS)
    return () => {
      vivo = false
      window.clearTimeout(reloj)
      escenaRef.current?.destruir()
      escenaRef.current = null
    }
    // Se rehace sólo si cambia su aspecto (no con cada fix de posición).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveAspecto])

  // Sin su muñeco en el móvil: su retrato grande en el escenario (y el aviso debajo).
  const retratoGrandeRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const caja = retratoGrandeRef.current
    if (!caja || !sinModelo) return
    caja.replaceChildren(elementoDeRetrato(aspecto.mx, color, 132, foto || undefined))
  }, [sinModelo, aspecto.mx, color, foto])

  // Sin foto (o si no llega): el retrato de su personaje con el aro de su color.
  useEffect(() => {
    const caja = retratoRef.current
    if (!caja || foto) return
    caja.replaceChildren(elementoDeRetrato(aspecto.mx, color, 64))
  }, [foto, aspecto.mx, color])

  const conexion = textoDeConexion(datos.conexion, idioma)
  return createPortal(
    <div
      className={'saga-ficha' + (saliendo ? ' saga-ficha-sale' : '')}
      role="dialog"
      aria-modal="true"
      aria-label={t.titulo(nombre)}
      onClick={cerrar}
    >
      <div className="saga-ficha-hoja" onClick={(ev) => ev.stopPropagation()}>
        <div className="saga-ficha-asa" aria-hidden="true" />
        <div className="saga-ficha-escenario" ref={escenarioRef}>
          {sinModelo ? (
            <div className="saga-ficha-sin-modelo">
              <div ref={retratoGrandeRef} className="saga-ficha-retrato-grande" />
              {t.sinModelo}
            </div>
          ) : (
            <div className="saga-ficha-gira">{t.gira}</div>
          )}
          <button
            type="button"
            className="saga-ficha-cerrar"
            aria-label={t.cerrar}
            onClick={cerrar}
          >
            ×
          </button>
        </div>
        <div className="saga-ficha-cabecera">
          <div
            className={'saga-ficha-foto' + (foto ? '' : ' saga-ficha-foto-retrato')}
            style={foto ? { borderColor: color } : undefined}
          >
            {foto ? (
              <img src={foto} alt="" draggable={false} onError={() => setFotoRota(true)} />
            ) : (
              <div ref={retratoRef} className="saga-ficha-retrato" />
            )}
          </div>
          <div className="saga-ficha-quien">
            <b>{nombre}</b>
            <span className={`saga-ficha-conexion saga-ficha-conexion-${datos.conexion.tipo}`}>
              <i aria-hidden="true" />
              {conexion}
            </span>
          </div>
        </div>
        <div className="saga-ficha-datos">
          <div>
            <small>{t.nodos}</small>
            <b>{datos.terminado ? t.terminado : t.deTotal(datos.hechos, datos.total)}</b>
          </div>
          <div>
            <small>{t.tiempo}</small>
            <b>{tiempoLegible(datos.tiempoMs)}</b>
          </div>
        </div>
        {sinCobertura ? <div className="saga-ficha-aviso">{t.cacheado}</div> : null}
        <div className="saga-ficha-botones">
          <button
            type="button"
            className="saga-ficha-boton saga-ficha-boton-principal"
            onClick={() => cerrarCon(alIrA)}
          >
            {t.irA}
          </button>
          <button type="button" className="saga-ficha-boton" onClick={() => cerrarCon(alSaludar)}>
            {t.saludar}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

export default FichaDeJugador

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fetchEstadoPersonaje } from '../../shared/api'
import { getLocale } from '../../i18n'
import { claveDeAvatar, clavesOcupadas, leerEstadoDePersonaje, personajeInicial } from './avatarConfig'
import { guardarPersonaje, personajeLocal } from './elegirPersonaje'
import { PERSONAJES, personajePorDefecto, type Personaje } from './personajes'
import { SelectorDePersonaje } from './SelectorDePersonaje'

/** Aviso a toda la app (el mapa redibuja tu muñeco) cuando eliges uno. */
export const EVENTO_PERSONAJE_ELEGIDO = 'saga:personaje-elegido'
/** Quien quiera abrir el selector (tocarte en el mapa, Herramientas) lo pide con esto. */
export const EVENTO_ELEGIR_PERSONAJE = 'saga:elegir-personaje'

const TEXTO_OCUPADO = {
  es: 'Ese personaje ya lo tiene otro jugador. Elige otro.',
  gl: 'Ese personaxe xa o ten outro xogador. Escolle outro.',
  en: 'Another player already has that character. Pick another one.',
} as const

/**
 * Quien decide qué se guarda al elegir personaje: pregunta al servidor qué está
 * ocupado, deja tocar sólo lo libre, guarda al pulsar «Listo» y, si en medio otro
 * jugador se adelantó (409), lo avisa, refresca lo ocupado y deja elegir otro.
 *
 * `primera`: antes de la pantalla de carga, a pantalla completa y sin cancelar
 * (si no hay cobertura se puede elegir igual y se sube luego).
 * `cambiar`: desde Herramientas o tocándote en el mapa; se puede cancelar.
 */
export function GestorDePersonaje({
  usuario,
  modo,
  color,
  actual,
  alTerminar,
}: {
  usuario: string
  modo: 'primera' | 'cambiar'
  color: string
  /** El que se ve ahora (si lo hay), para marcarlo al abrir. */
  actual: Personaje | null
  alTerminar: (elegido: Personaje | null) => void
}) {
  const locale = getLocale()
  const [ocupadas, setOcupadas] = useState<Set<string>>(new Set())
  const [seleccionado, setSeleccionado] = useState<Personaje>(actual ?? personajePorDefecto(usuario))
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const yaTocadoRef = useRef(false)
  const miRef = useRef<Personaje | null>(personajeLocal(usuario) ?? actual)

  const refrescar = useCallback(async () => {
    try {
      const estado = leerEstadoDePersonaje(await fetchEstadoPersonaje(usuario))
      if (!estado) return
      const claves = clavesOcupadas(estado.taken)
      setOcupadas(claves)
      if (estado.avatar) miRef.current = estado.avatar.character
      // Mientras no haya tocado nada, se abre en uno libre; si el suyo se acaba de ocupar, también.
      setSeleccionado((previo) =>
        yaTocadoRef.current && !claves.has(claveDeAvatar({ character: previo }))
          ? previo
          : personajeInicial(usuario, miRef.current ?? previo, claves)
      )
    } catch {
      // Sin respuesta: se puede elegir igual y el servidor dirá la última palabra.
    }
  }, [usuario])

  useEffect(() => {
    void refrescar()
  }, [refrescar])

  const ocupados = useMemo(
    () => new Set<Personaje>(PERSONAJES.filter((p) => ocupadas.has(claveDeAvatar({ character: p })))),
    [ocupadas]
  )

  const confirmar = useCallback(async () => {
    if (guardando) return
    setGuardando(true)
    setMensaje(null)
    const resultado = await guardarPersonaje(usuario, seleccionado)
    setGuardando(false)
    if (resultado === 'ocupado') {
      yaTocadoRef.current = false
      setMensaje(TEXTO_OCUPADO[locale in TEXTO_OCUPADO ? locale : 'es'])
      await refrescar()
      return
    }
    window.dispatchEvent(new CustomEvent(EVENTO_PERSONAJE_ELEGIDO, { detail: seleccionado }))
    alTerminar(seleccionado)
  }, [guardando, usuario, seleccionado, locale, refrescar, alTerminar])

  return (
    <SelectorDePersonaje
      seleccionado={seleccionado}
      ocupados={ocupados}
      color={color}
      pleno={modo === 'primera'}
      guardando={guardando}
      mensaje={mensaje}
      alSeleccionar={(p) => {
        yaTocadoRef.current = true
        setMensaje(null)
        setSeleccionado(p)
      }}
      alConfirmar={() => void confirmar()}
      alCancelar={modo === 'cambiar' ? () => alTerminar(null) : undefined}
    />
  )
}

export default GestorDePersonaje

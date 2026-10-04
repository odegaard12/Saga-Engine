import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { fetchEstadoPersonaje } from '../../shared/api'
import { getLocale } from '../../i18n'
import { clavesOcupadas, leerEstadoDePersonaje } from './avatarConfig'
import { avatarLocal, guardarPersonaje } from './elegirPersonaje'
import {
  aspectoPorDefecto,
  configDeAspecto,
  partsAAspecto,
  type Aspecto,
} from '../avatares3d/mixamo/catalogo'
import { idiomaDeTienda, TEXTOS_TIENDA } from '../avatares3d/mixamo/textosTienda'
import type { Personaje } from './personajes'

const TiendaDeRopa = lazy(() => import('../avatares3d/mixamo/TiendaDeRopa'))

/** Aviso a toda la app (el mapa redibuja tu muñeco) cuando eliges uno. El detalle es la configuración entera. */
export const EVENTO_PERSONAJE_ELEGIDO = 'saga:personaje-elegido'
/** Quien quiera abrir la tienda de ropa (el botón redondo, Herramientas) lo pide con esto. */
export const EVENTO_ELEGIR_PERSONAJE = 'saga:elegir-personaje'
/** Tocarte en el mapa con tu avatar 3D a la vista: el menú de gestos. */
export const EVENTO_MENU_DE_GESTOS = 'saga:menu-de-gestos'
/** Hacer un gesto (detalle: el nombre del clip `ge__*`). */
export const EVENTO_GESTO = 'saga:gesto'

/**
 * Quien decide qué se guarda al elegir aspecto: pregunta al servidor qué está
 * ocupado, enseña la tienda de ropa, guarda al pulsar «Listo» y, si en medio otro
 * jugador se adelantó (409), lo avisa, refresca lo ocupado y deja elegir otro.
 * La unicidad es por la configuración ENTERA (personaje, colores, complementos).
 *
 * `primera`: antes de la pantalla de carga, a pantalla completa y sin cancelar
 * (si no hay cobertura se puede elegir igual y se sube luego).
 * `cambiar`: desde el botón de la camiseta, Herramientas o el menú de tu avatar;
 * se puede cancelar.
 */
export function GestorDePersonaje({
  usuario,
  modo,
  alTerminar,
}: {
  usuario: string
  modo: 'primera' | 'cambiar'
  /** Ya no se usa (el color de la hoja sale del tema); sigue aquí para no romper quien lo pasa. */
  color?: string
  /** Ya no se usa: el aspecto de partida sale de lo guardado. */
  actual?: Personaje | null
  alTerminar: (elegido: Personaje | null) => void
}) {
  const locale = getLocale()
  const t = TEXTOS_TIENDA[idiomaDeTienda(locale)]
  const [ocupadas, setOcupadas] = useState<Set<string>>(new Set())
  const [enUso, setEnUso] = useState<Record<string, number>>({})
  // El aspecto de partida es el de este móvil (o el de por defecto): la tienda sale ya, sin esperar al servidor.
  const [inicial] = useState<Aspecto>(
    () => partsAAspecto(avatarLocal(usuario)?.parts) ?? aspectoPorDefecto(usuario)
  )
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [sinCobertura, setSinCobertura] = useState(false)

  const refrescar = useCallback(async () => {
    try {
      const estado = leerEstadoDePersonaje(await fetchEstadoPersonaje(usuario))
      if (!estado) return
      setOcupadas(clavesOcupadas(estado.taken))
      setEnUso(estado.enUso)
    } catch {
      // Sin respuesta: se puede elegir igual y el servidor dirá la última palabra.
      setSinCobertura(true)
    }
  }, [usuario])

  useEffect(() => {
    void refrescar()
  }, [refrescar])

  const confirmar = useCallback(
    async (aspecto: Aspecto) => {
      if (guardando) return
      setGuardando(true)
      setMensaje(null)
      const config = configDeAspecto(aspecto)
      const resultado = await guardarPersonaje(usuario, config)
      setGuardando(false)
      if (resultado === 'ocupado') {
        setMensaje(t.ocupadoTrasGuardar)
        await refrescar()
        return
      }
      if (resultado === 'pendiente') setSinCobertura(true)
      window.dispatchEvent(new CustomEvent(EVENTO_PERSONAJE_ELEGIDO, { detail: config }))
      alTerminar(config.character)
    },
    [guardando, usuario, refrescar, alTerminar, t]
  )

  return (
    <Suspense fallback={null}>
      <TiendaDeRopa
        pleno={modo === 'primera'}
        aspectoInicial={inicial}
        ocupadas={ocupadas}
        enUso={enUso}
        guardando={guardando}
        mensaje={mensaje}
        sinCobertura={sinCobertura}
        alConfirmar={(a) => void confirmar(a)}
        alCancelar={modo === 'cambiar' ? () => alTerminar(null) : undefined}
      />
    </Suspense>
  )
}

export default GestorDePersonaje

import { useCallback, useEffect, useRef, useState } from 'react'
import type { PlayerGamePayload } from '../../types/player'
import { avisarPeticionDePermisoPropia } from '../utils/permissionPromptGuard'
import {
  estaInstalada,
  estadoDelAlmacenamiento,
  evaluarEspacio,
  pedirAlmacenamientoPersistente,
  type EstadoDelAlmacenamiento,
  type NivelDeEspacio,
  type ResultadoDePersistir,
} from './almacenamiento'
import { cargarTodo, type ResultadoDeCarga } from './cargaCompleta'
import { cargaInicial, type EstadoDeCarga } from './motorDeCarga'

/**
 * «Prepararse antes de salir»: la misma comprobación y descarga que la pantalla
 * de carga, más lo que sólo se puede hacer con el jugador delante — el micrófono,
 * el espacio persistente y la guía de «Añadir a pantalla de inicio».
 *
 * Días antes de la salida cada jugador entra en casa, con wifi, y deja el móvil
 * listo: la aplicación, la misión y el mapa bajados y COMPROBADOS, los permisos
 * concedidos y los datos protegidos para que el navegador no los borre.
 */

export type EstadoDePermisoExtra = 'idle' | 'pidiendo' | 'ok' | 'error'

export type FaseDePreparacion = 'idle' | 'corriendo' | 'listo' | 'fallo' | 'sin_cobertura'

export interface EstadoDeEspacio extends EstadoDelAlmacenamiento {
  fase: 'idle' | 'pidiendo' | 'hecho'
  /** Qué respondió el navegador al pedir que no borre los datos. */
  resultado: ResultadoDePersistir | null
  nivel: NivelDeEspacio
}

const ESPACIO_INICIAL: EstadoDeEspacio = {
  fase: 'idle',
  resultado: null,
  nivel: 'desconocido',
  persistente: null,
  usoBytes: null,
  cuotaBytes: null,
  libreBytes: null,
}

/**
 * Lo que dice la lista final sobre el espacio.
 *
 * ✓ si los datos están protegidos (o el navegador no sabe protegerlos pero hay
 * sitio de sobra); ⚠ si el navegador puede borrarlos o va justo de espacio.
 */
export function espacioParaLaLista(
  espacio: EstadoDeEspacio,
  sinEspacioAlBajar: boolean
): 'ok' | 'aviso' | 'pendiente' {
  if (sinEspacioAlBajar) return 'aviso'
  if (espacio.fase !== 'hecho') return 'pendiente'
  if (espacio.nivel === 'justo') return 'aviso'
  if (espacio.persistente === true) return 'ok'
  if (espacio.resultado === 'no_soportado') return espacio.nivel === 'ok' ? 'ok' : 'pendiente'
  return 'aviso'
}

export function usePreparacion(args: {
  user: string
  playerUrl: string
  payloadEnPantalla: () => PlayerGamePayload | null
  /** Con la partida ya puesta al día, para que la aplicación la use. */
  alTerminar: (resultado: ResultadoDeCarga) => void
}) {
  const [abierta, setAbierta] = useState(false)
  const [fase, setFase] = useState<FaseDePreparacion>('idle')
  const [partes, setPartes] = useState<EstadoDeCarga | null>(null)
  const [microfono, setMicrofono] = useState<EstadoDePermisoExtra>('idle')
  const [espacio, setEspacio] = useState<EstadoDeEspacio>(ESPACIO_INICIAL)
  const [instalada] = useState(() => estaInstalada())
  const [sinEspacioAlBajar, setSinEspacioAlBajar] = useState(false)

  const corriendoRef = useRef(false)
  const canceladoRef = useRef(false)
  const argsRef = useRef(args)
  argsRef.current = args

  useEffect(() => {
    return () => {
      canceladoRef.current = true
    }
  }, [])

  const medirEspacio = useCallback(async (pedirPersistencia: boolean) => {
    setEspacio((actual) => ({ ...actual, fase: 'pidiendo' }))
    const resultado = pedirPersistencia ? await pedirAlmacenamientoPersistente() : null
    const estado = await estadoDelAlmacenamiento()
    setEspacio((actual) => ({
      ...actual,
      ...estado,
      fase: 'hecho',
      resultado: resultado ?? actual.resultado,
      nivel: evaluarEspacio(estado),
    }))
  }, [])

  const ejecutar = useCallback(async () => {
    if (corriendoRef.current) return
    corriendoRef.current = true
    canceladoRef.current = false

    setFase('corriendo')
    setPartes(cargaInicial())
    setSinEspacioAlBajar(false)

    // Se pide desde el toque que abrió esto: es el momento en que el navegador
    // más se fía. No espera a la descarga.
    void medirEspacio(true)

    try {
      const actual = argsRef.current
      const resultado = await cargarTodo(actual.user, {
        modo: 'preparacion',
        playerUrl: actual.playerUrl,
        alCambiar: (estado) => {
          if (estado && !canceladoRef.current) setPartes(estado)
        },
        cancelado: () => canceladoRef.current,
        entrarIgualmente: () => false,
        payloadEnPantalla: actual.payloadEnPantalla,
      })

      if (canceladoRef.current) return

      if (!resultado.cobertura) {
        setFase('sin_cobertura')
        return
      }

      setPartes(resultado.partes)
      setSinEspacioAlBajar(
        Boolean(
          resultado.partes &&
            (resultado.partes.app.sinEspacio ||
              resultado.partes.mision.sinEspacio ||
              resultado.partes.mapa.sinEspacio)
        )
      )
      actual.alTerminar(resultado)
      setFase(resultado.faltan.length > 0 ? 'fallo' : 'listo')

      // Con lo bajado, cuánto ocupa y cuánto queda.
      await medirEspacio(false)
    } catch {
      if (!canceladoRef.current) setFase('fallo')
    } finally {
      corriendoRef.current = false
    }
  }, [medirEspacio])

  const abrir = useCallback(() => {
    setAbierta(true)
    void ejecutar()
    // Si el micrófono ya estaba concedido no hace falta volver a pedirlo.
    void (async () => {
      try {
        const estado = await navigator.permissions?.query({ name: 'microphone' as PermissionName })
        if (estado?.state === 'granted') setMicrofono('ok')
      } catch {
        // Sin Permissions API para el micrófono: se pedirá con el botón.
      }
    })()
  }, [ejecutar])

  const cerrar = useCallback(() => {
    canceladoRef.current = true
    setAbierta(false)
    setFase('idle')
  }, [])

  const pedirMicrofono = useCallback(async () => {
    setMicrofono('pidiendo')
    // Sin esto, el aviso del sistema quita el foco a la pestaña y el anti-trampas
    // lo cuenta como una salida (+30 s).
    avisarPeticionDePermisoPropia()

    try {
      const flujo = await navigator.mediaDevices?.getUserMedia({ audio: true })
      if (!flujo) throw new Error('sin micrófono')
      // Sólo se quería el permiso: se suelta en el acto.
      flujo.getTracks().forEach((pista) => pista.stop())
      setMicrofono('ok')
    } catch {
      setMicrofono('error')
    }
  }, [])

  const pedirEspacio = useCallback(() => medirEspacio(true), [medirEspacio])

  return {
    abierta,
    fase,
    partes,
    microfono,
    espacio,
    instalada,
    sinEspacioAlBajar,
    abrir,
    cerrar,
    reintentar: ejecutar,
    pedirMicrofono,
    pedirEspacio,
  }
}

import { useEffect, useRef, useState } from 'react'
import type { UiNotice } from '../components/ToastNotice'
import type { QuietNoticeData } from '../components/QuietNotice'
import type { OverlayState } from '../components/PlayerLayout'
import type { NoticeTone } from '../playerAppBase'

/**
 * Los avisos de la pantalla del jugador: el cartel que interrumpe, la línea discreta de abajo y la pantalla de
 * «misión completada», cada uno con su temporizador. Sacado tal cual de PlayerApp.tsx (mejora 5, 21/11).
 */
export function useAvisos() {
  const [uiNotice, setUiNotice] = useState<UiNotice>(null)
  const [uiQuiet, setUiQuiet] = useState<QuietNoticeData>(null)
  const [overlayState, setOverlayState] = useState<OverlayState>(null)
  const noticeTimerRef = useRef<number | null>(null)
  const quietTimerRef = useRef<number | null>(null)
  const overlayTimerRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (noticeTimerRef.current !== null) {
        window.clearTimeout(noticeTimerRef.current)
      }
      if (quietTimerRef.current !== null) {
        window.clearTimeout(quietTimerRef.current)
      }
      if (overlayTimerRef.current !== null) {
        window.clearTimeout(overlayTimerRef.current)
      }
    }
  }, [])


  /**
   * Dos destinos, no uno.
   *
   * Antes habia un solo sitio -el cartel- y para no llenar la pantalla de
   * carteles esta funcion se tragaba en silencio todo lo que llegara con tono
   * `info` o `success`:
   *
   *     const normalizedTone = tone === 'success' ? 'info' : tone
   *     if (normalizedTone === 'info') return
   *
   * Medido contra produccion el 2026-08-17, mismo nodo y mismo boton: con un
   * 500 del servidor el aviso salia a los 101 ms, y quedandose SIN COBERTURA no
   * salia nunca. El caso raro avisaba y el caso normal del monte era mudo,
   * porque `avisoDeAvanceSinServidor` devuelve `success` justo en esa rama.
   *
   * Ahora lo que interrumpe va al cartel y lo que solo se cuenta va a una linea
   * discreta abajo. Nada se descarta.
   */
  function showNotice(message: string, tone: NoticeTone) {
    if (tone === 'warn') {
      setUiNotice({ message, tone })

      if (noticeTimerRef.current !== null) {
        window.clearTimeout(noticeTimerRef.current)
      }

      noticeTimerRef.current = window.setTimeout(() => {
        setUiNotice(null)
        noticeTimerRef.current = null
      }, 3000)
      return
    }

    // Calla, pero se lee. Mas tiempo que el cartel: no interrumpe, asi que hay
    // que darle margen a que alguien la vea sin mirar aposta.
    setUiQuiet({ message })

    if (quietTimerRef.current !== null) {
      window.clearTimeout(quietTimerRef.current)
    }

    quietTimerRef.current = window.setTimeout(() => {
      setUiQuiet(null)
      quietTimerRef.current = null
    }, 5000)
  }

  function showOverlay(nextState: OverlayState) {
    if (nextState !== 'finish') return
    setOverlayState(nextState)

    if (overlayTimerRef.current !== null) {
      window.clearTimeout(overlayTimerRef.current)
    }

    overlayTimerRef.current = window.setTimeout(
      () => {
        setOverlayState(null)
        overlayTimerRef.current = null
      },
      nextState === 'finish' ? 1800 : 900
    )
  }

  return { uiNotice, setUiNotice, uiQuiet, overlayState, showNotice, showOverlay }
}

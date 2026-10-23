import React from 'react'
import './error-boundary.css'
import { reportarError } from './reportarErrores'

type ErrorBoundaryProps = {
  children: React.ReactNode
  surface?: string
}

type ErrorBoundaryState = {
  hasError: boolean
  message: string
  stack?: string
}

/**
 * La pila sólo en desarrollo (servidor local) o con `?debug=1` (el mismo parámetro que el GPS de depuración). Antes
 * salía siempre: al jugador no le dice nada y enseña rutas internas de la app (auditoría 23/10).
 */
export function mostrarDetallesTecnicos(): boolean {
  try {
    const url = new URL(window.location.href)
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') return true
    return url.searchParams.get('debug') === '1'
  } catch {
    return false
  }
}

/** Igual que en public/sw.js, pwaShell.ts y versionGuard.ts. */
const PREFIJO_DEL_ARMAZON = 'saga-player-shell'

/**
 * Borra SÓLO la caché del armazón (la página y los paquetes de la app).
 *
 * Antes se borraba TODO y se desregistraba el service worker: teselas de la ruta (`saga-route-tile-coverage-*`), red
 * de caminos, fotos... Sin cobertura, el jugador que pulsaba el botón se quedaba sin app y sin mapa en mitad del monte
 * (auditoría 23/10). Lo que puede venir de una versión vieja es el armazón; lo demás son datos que no se recuperan sin
 * red. El service worker se queda: es quien sirve la app sin cobertura.
 */
export async function limpiarCacheDelArmazon(): Promise<void> {
  if (typeof caches === 'undefined') return
  const nombres = await caches.keys()
  await Promise.all(
    nombres
      .filter((nombre) => nombre.startsWith(PREFIJO_DEL_ARMAZON))
      .map((nombre) => caches.delete(nombre))
  )
}

/** Sin red, limpiar el armazón no deja nada con qué volver a arrancar: entonces sólo se ofrece recargar. */
export function puedeLimpiarCache(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    message: '',
  }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : 'Error inesperado en la interfaz.',
      stack: error instanceof Error ? error.stack : undefined,
    }
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    // Keep this intentionally small. It helps field debugging without exposing data in the UI.
    console.error('[SAGA ErrorBoundary]', {
      surface: this.props.surface || 'SAGA Engine',
      error,
      componentStack: info.componentStack,
    })
    // También al servidor, para analizar la partida (ver reportarErrores.ts).
    reportarError({
      tipo: 'js',
      mensaje: `[${this.props.surface || 'SAGA'}] ${error instanceof Error ? error.message : String(error)}`,
      pila: error instanceof Error ? error.stack : undefined,
    })
  }

  private reload = () => {
    window.location.reload()
  }

  private goHome = () => {
    window.location.href = '/'
  }

  private clearCacheAndReload = async () => {
    // Se vuelve a mirar al pulsar: la red pudo irse con la pantalla ya pintada.
    if (!puedeLimpiarCache()) {
      window.location.reload()
      return
    }
    try {
      await limpiarCacheDelArmazon()
    } finally {
      window.location.reload()
    }
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children
    }

    const surface = this.props.surface || 'SAGA Engine'
    const showDetails = mostrarDetallesTecnicos()
    const conRed = puedeLimpiarCache()

    return (
      <main className="saga-error-boundary" role="alert">
        <section className="saga-error-boundary__card">
          <p className="saga-error-boundary__eyebrow">SAGA Engine</p>
          <h1>{surface} no pudo cargarse correctamente</h1>
          <p className="saga-error-boundary__message">
            La aplicación encontró un error de interfaz. Tus datos del servidor no se han borrado.
            {conRed
              ? ' Recarga primero. Si vuelve a pasar, limpia la caché de la app por si el fallo viene de una versión antigua guardada en el móvil.'
              : ' Recarga para seguir: la app y el mapa siguen guardados en el móvil. Para limpiar la caché de la app hace falta cobertura.'}
          </p>

          <div className="saga-error-boundary__actions">
            <button type="button" onClick={this.reload}>
              Recargar
            </button>
            {conRed ? (
              <button type="button" onClick={this.clearCacheAndReload}>
                Limpiar caché y recargar
              </button>
            ) : null}
            <button type="button" onClick={this.goHome}>
              Volver al inicio
            </button>
          </div>

          {showDetails ? (
            <details className="saga-error-boundary__details">
              <summary>Detalles técnicos</summary>
              <pre>
                {this.state.message}
                {this.state.stack ? `\n\n${this.state.stack}` : ''}
              </pre>
            </details>
          ) : null}
        </section>
      </main>
    )
  }
}

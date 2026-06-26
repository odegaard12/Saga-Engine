import React from 'react'
import './error-boundary.css'

type ErrorBoundaryProps = {
  children: React.ReactNode
  surface?: string
}

type ErrorBoundaryState = {
  hasError: boolean
  message: string
  stack?: string
}

function shouldShowTechnicalDetails(): boolean {
  return true
}

async function clearRuntimeCaches(): Promise<void> {
  if (typeof window === 'undefined') return

  if ('caches' in window) {
    const names = await window.caches.keys()
    await Promise.all(names.map((name) => window.caches.delete(name)))
  }

  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations()
    await Promise.all(registrations.map((registration) => registration.unregister()))
  }
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
  }

  private reload = () => {
    window.location.reload()
  }

  private goHome = () => {
    window.location.href = '/'
  }

  private clearCacheAndReload = async () => {
    try {
      await clearRuntimeCaches()
    } finally {
      window.location.reload()
    }
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children
    }

    const surface = this.props.surface || 'SAGA Engine'
    const showDetails = shouldShowTechnicalDetails()

    return (
      <main className="saga-error-boundary" role="alert">
        <section className="saga-error-boundary__card">
          <p className="saga-error-boundary__eyebrow">SAGA Engine</p>
          <h1>{surface} no pudo cargarse correctamente</h1>
          <p className="saga-error-boundary__message">
            La aplicación encontró un error de interfaz. Tus datos del servidor no se han borrado.
            Puedes recargar o limpiar la caché de la app si el fallo viene de una versión antigua guardada offline.
          </p>

          <div className="saga-error-boundary__actions">
            <button type="button" onClick={this.reload}>
              Recargar
            </button>
            <button type="button" onClick={this.clearCacheAndReload}>
              Limpiar caché y recargar
            </button>
            <button type="button" onClick={this.goHome}>
              Volver al inicio
            </button>
          </div>

          {showDetails ? (
            <details className="saga-error-boundary__details">
              <summary>Detalles técnicos</summary>
              <pre>{this.state.message}{this.state.stack ? `\n\n${this.state.stack}` : ''}</pre>
            </details>
          ) : null}
        </section>
      </main>
    )
  }
}

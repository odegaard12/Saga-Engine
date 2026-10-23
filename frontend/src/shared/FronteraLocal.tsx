import React from 'react'
import { reportarError } from './reportarErrores'

/**
 * Una frontera de errores para UN trozo de la pantalla, con reinicio.
 *
 * Auditoría 23/10: sólo había una para toda la app (main.tsx), así que un fallo al PINTAR el mapa, el HUD, una hoja
 * o un minijuego cambiaba la partida entera por «SAGA Engine no pudo cargarse correctamente». Con esto el trozo roto
 * se sustituye por su respaldo y el resto sigue: el GPS, el reloj y la cola de avances no se enteran.
 *
 * El error se manda igual que el de la frontera de arriba (`reportarError`), con la zona delante para saber qué falló.
 * `respaldo` recibe `reiniciar`, que vuelve a montar el trozo; sin respaldo no se pinta nada.
 */
type Props = {
  zona: string
  children: React.ReactNode
  respaldo?: (reiniciar: () => void) => React.ReactNode
}

type Estado = { fallo: boolean }

export class FronteraLocal extends React.Component<Props, Estado> {
  state: Estado = { fallo: false }

  static getDerivedStateFromError(): Estado {
    return { fallo: true }
  }

  componentDidCatch(error: unknown) {
    reportarError({
      tipo: 'js',
      mensaje: `[${this.props.zona}] ${error instanceof Error ? error.message : String(error)}`,
      pila: error instanceof Error ? error.stack : undefined,
    })
  }

  private reiniciar = () => this.setState({ fallo: false })

  render() {
    if (!this.state.fallo) return this.props.children
    return this.props.respaldo ? this.props.respaldo(this.reiniciar) : null
  }
}

/**
 * Entrada propia del panel (24/11, acceso con poca cobertura): la carga `admin.html`, que el servidor da en `/admin` y
 * `/admin-react`.
 *
 * Antes el panel arrancaba desde la entrada del jugador (main.tsx → App.tsx), que baja primero su código y sólo
 * después pide AdminApp: dos rondas seguidas. Aquí AdminApp va importado directamente, así que Vite lo pone en la
 * página con `modulepreload` y todo baja en paralelo con la página. Se queda lo que el panel usaba de main.tsx (las
 * hojas globales, el informe de errores y la versión de la esquina); no el vigilante de versión, que prepara la caché
 * sin red del JUGADOR (~5 MB) y el panel no la usa: su página siempre se pide al servidor.
 */
import React from 'react'
import ReactDOM from 'react-dom/client'
import AdminApp from './AdminApp'
import { BuildInfoBadge } from '../shared/BuildInfoBadge'
import { ErrorBoundary } from '../shared/ErrorBoundary'
import { instalarReporteDeErrores } from '../shared/reportarErrores'
import '../styles/mobile-shell.css'
import '../mobile-themes.css'
import '../saga-lenguaje.css'
import '../player/components/map-surface.css'

instalarReporteDeErrores()

// 25/11: como en main.tsx, con la pantalla oculta (bloqueada, otra app) se paran las animaciones infinitas (regla en
// saga-lenguaje.css): la vista previa de los minijuegos del editor seguía animándose en el bolsillo.
const marcarOculta = () => document.documentElement.toggleAttribute('data-saga-oculta', document.visibilityState === 'hidden')
document.addEventListener('visibilitychange', marcarOculta)
marcarOculta()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary surface="SAGA Engine">
      <AdminApp />
      <BuildInfoBadge />
    </ErrorBoundary>
  </React.StrictMode>
)

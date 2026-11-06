import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ErrorBoundary } from './shared/ErrorBoundary'
import './styles/mobile-shell.css'
// Después de la carcasa, para que el tema pueda pisarle el fondo y las
// variables de los paneles. Sin este import vite no lo empaqueta y el tema no
// existe en el móvil, que es lo que pasaba: el `dist` no tenía ni una regla.
import './mobile-themes.css'
import './player/components/map-surface.css'
import { setupLegacySpanishBridge } from './i18n/legacySpanishBridge'
import { installDebugGeolocationShim } from './player/utils/debugGeolocationShim'
import { vixiarVersion } from './shared/versionGuard'
import { instalarReporteDeErrores } from './shared/reportarErrores'

setupLegacySpanishBridge()

// Errores de JS y fallos de red relevantes al servidor, para analizar la partida
// (ver shared/reportarErrores.ts: sin consultas de URL ni datos locales).
instalarReporteDeErrores()

// El shim de GPS de depuración existía pero NADIE lo llamaba: el modo debug de
// ubicación era código muerto y no había forma de probar la ruta sin caminarla.
installDebugGeolocationShim()

/**
 * Y el vigilante de versión, por lo mismo: estaba escrito y no lo llamaba nadie.
 *
 * Compara la versión del bundle con la que dice `/api/version` y, si no
 * coinciden, borra la caché del armazón y recarga UNA vez. Su propia cabecera
 * explica para qué se escribió: «se desplegaban arreglos, el servidor los
 * servía, y en el móvil no». Exactamente eso seguía pasando, porque el
 * mecanismo estaba sin enchufar.
 *
 * Va con `void` a propósito: sin cobertura `/api/version` no contesta, y
 * arrancar es justo lo que tiene que seguir funcionando en el monte. La
 * pantalla no espera a esto.
 *
 * Al ARRANCAR y no en un ciclo: es el único momento en que una recarga no le
 * interrumpe un minijuego a nadie.
 */
void vixiarVersion()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary surface="SAGA Engine">
      {/* 7/11: sin React Query: el proveedor estaba montado y nadie lo usaba (0 useQuery). */}
      <App />
    </ErrorBoundary>
  </React.StrictMode>
)

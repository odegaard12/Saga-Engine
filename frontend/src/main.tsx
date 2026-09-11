import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
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

setupLegacySpanishBridge()

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

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2, // Reintenta peticiones en caso de fallos de red
      staleTime: 1000 * 60 * 5, // 5 min de cache por defecto
    },
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary surface="SAGA Engine">
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>
)

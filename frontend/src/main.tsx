import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import { ErrorBoundary } from './shared/ErrorBoundary'
import './styles/mobile-shell.css'
import './player/components/map-surface.css'
import { setupLegacySpanishBridge } from './i18n/legacySpanishBridge'
import { setupAdminSettingsLanguageMenu } from './i18n/adminSettingsLanguageMenu'

setupLegacySpanishBridge()
setupAdminSettingsLanguageMenu()

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

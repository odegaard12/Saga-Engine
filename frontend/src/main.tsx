import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/mobile-shell.css'
import './player/components/map-surface.css'
import { setupLegacySpanishBridge } from './i18n/legacySpanishBridge'
import { setupAdminSettingsLanguageMenu } from './i18n/adminSettingsLanguageMenu'
import { installDebugGeolocationShim } from './player/utils/debugGeolocationShim'


setupLegacySpanishBridge()
setupAdminSettingsLanguageMenu()
installDebugGeolocationShim()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

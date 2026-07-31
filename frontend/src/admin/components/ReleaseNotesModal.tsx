import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

interface ReleaseNotesModalProps {
  onClose: () => void
}

export default function ReleaseNotesModal({ onClose }: ReleaseNotesModalProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const modalContent = (
    <div style={backdrop} onClick={onClose} role="dialog" aria-modal="true">
      <div style={card} onClick={(e) => e.stopPropagation()}>
        <header style={header}>
          <div>
            <span style={badge}>🚀 SAGA ENGINE RELEASE NOTES</span>
            <h2 style={title}>Novedades de las Versiones</h2>
          </div>
          <button type="button" style={closeBtn} onClick={onClose}>
            ✕
          </button>
        </header>

        <div style={content}>
          {/* Version 3.9.4 */}
          {/* Version 3.9.7 */}
          <article style={versionBlock}>
            <div style={versionHeader}>
              <span style={vTag}>v3.9.7</span>
              <span style={vDate}>31 de Julio, 2026</span>
              <span style={vBadgeCurrent}>VERSIÓN ACTUAL</span>
            </div>

            <h3 style={releaseTitle}>🏷️ Rediseño de Tarjetas QR Físicas, Capas de Mapas y Mejoras UI</h3>

            <ul style={featureList}>
              <li>
                <strong>🏷️ Tarjetas y Objetos QR Físicos:</strong> Soporte completo para Objeto QR, Llave QR, Pista QR y Bonus QR con badges visuales distintivos.
              </li>
              <li>
                <strong>🗺️ Rastros y Senderos OSM:</strong> Renderizado persistente de senderos a cualquier nivel de zoom en el editor de misiones.
              </li>
              <li>
                <strong>⚡ Sincronización Real-Time:</strong> HUD de métricas actualizado al instante durante el arrastre de nodos.
              </li>
            </ul>
          </article>

          {/* Version 3.9.4 */}
          <article style={versionBlock}>
            <div style={versionHeader}>
              <span style={vTagMuted}>v3.9.4</span>
              <span style={vDate}>29 de Julio, 2026</span>
            </div>

            <h3 style={releaseTitle}>🌲 Motor de Rutas Multinodo, Pegatinas QR Personalizables y Sincronización SQLite</h3>

            <ul style={featureList}>
              <li>
                <strong>🗺️ Motor de Rutas Multinodo:</strong> Configuración mística con coleccionables de mochila y minijuegos activos.
              </li>
              <li>
                <strong>🖨️ Pegatinas QR Personalizables:</strong> Generador ultra-limpio con selector de multiplicador (1x, 2x, 4x, 6x, 8x copias) y códigos independientes del orden.
              </li>
              <li>
                <strong>🗄️ Persistencia SQLite en Producción:</strong> Sincronización bi-direccional en tiempo real y corrección de permisos de archivo en la Raspberry Pi.
              </li>
            </ul>
          </article>

          {/* Version 3.9.2 */}
          <article style={versionBlock}>
            <div style={versionHeader}>
              <span style={vTagMuted}>v3.9.2</span>
              <span style={vDate}>24 de Julio, 2026</span>
            </div>

            <h3 style={releaseTitle}>🔮 10 Recetas Temáticas, Colocación de Chinchetas e i18n Gallego 100%</h3>

            <ul style={featureList}>
              <li>
                <strong>🔮 10 Recetas Temáticas Completas:</strong> Recetas ampliadas en 3 familias de juego:
                <ul style={subList}>
                  <li><b>🚀 Tecnología / Sci-Fi:</b> Reparar Llave Maestra, Carga EMP, Decodificador Cuántico, Escáner Biométrico.</li>
                  <li><b>🛡️ Medieval / Fantasía:</b> Amuleto del Guardián, Elixir de Alquimia, Escudo Rúnico.</li>
                  <li><b>🔮 Místico / Oculto:</b> Orbe de Fuego Arcano, Reliquia Sagrada, Amuleto de Visión Suprema.</li>
                </ul>
              </li>
              <li>
                <strong>📍 Colocación Interactivas de Chinchetas:</strong> Generación paso a paso de chinchetas en el mapa (1/2, 2/2) con confirmación sin modales molestos.
              </li>
              <li>
                <strong>🌐 Traducción Gallego 100% Bi-direccional:</strong> Cambio instantáneo entre Español y Gallego sin textos atascados.
              </li>
              <li>
                <strong>💻 Panel Flotante Ampliado en PC:</strong> Ancho de 1180px con organización de jugadores y objetos en rejilla de 2 a 3 columnas.
              </li>
              <li>
                <strong>🎒 Vaciar Mochila y Gestión de Objetos:</strong> Acción para vaciar mochila completa o retirar objetos específicos de jugadores en directo.
              </li>
              <li>
                <strong>📸 Cámara Glassmorphic:</strong> UI pulida de cámara en directo con selector frontal/trasera y visor libre de bordes sobrantes.
              </li>
            </ul>
          </article>

          {/* Version 3.4.0 */}
          <article style={versionBlock}>
            <div style={versionHeader}>
              <span style={vTagMuted}>v3.4.0</span>
              <span style={vDate}>20 de Julio, 2026</span>
            </div>

            <h3 style={releaseTitle}>📍 Cono de Dirección GPS, Caché PWA y Memoria de Sesión</h3>

            <ul style={featureList}>
              <li>
                <strong>🧭 Cono de Dirección y Orientación GPS:</strong> Visualización en tiempo real de la dirección del jugador en el mapa mediante un cono azul translucido.
              </li>
              <li>
                <strong>📱 PWA Cache Revamp:</strong> Sistema de almacenamiento offline optimizado para precargar mapas y activos sin conexión a internet.
              </li>
              <li>
                <strong>🔒 Memoria de Sesión de Jugador:</strong> Persistencia del login de jugador activo tras recargar o reabrir la app.
              </li>
              <li>
                <strong>🛡️ Validación de Rutas de Receta:</strong> El comprobador del Admin verifica automáticamente que existan todos los ingredientes en el mapa antes de guardar.
              </li>
            </ul>
          </article>
        </div>
      </div>
    </div>
  )

  if (!mounted || typeof document === 'undefined') return null

  return createPortal(modalContent, document.body)
}

const backdrop: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  width: '100vw',
  height: '100vh',
  zIndex: 99999999,
  background: 'rgba(11, 17, 32, 0.85)',
  backdropFilter: 'blur(10px)',
  display: 'grid',
  placeItems: 'center',
  padding: 16,
}

const card: React.CSSProperties = {
  width: '100%',
  maxWidth: 780,
  maxHeight: '88vh',
  display: 'flex',
  flexDirection: 'column',
  background: 'linear-gradient(145deg, #0f172a 0%, #1e293b 100%)',
  borderRadius: 24,
  border: '1px solid rgba(148, 163, 184, 0.2)',
  boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6)',
  overflow: 'hidden',
}

const header: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '20px 24px',
  borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
}

const badge: React.CSSProperties = {
  fontSize: '10px',
  fontWeight: 800,
  letterSpacing: '0.08em',
  color: '#38bdf8',
}

const title: React.CSSProperties = {
  margin: '4px 0 0',
  fontSize: '20px',
  fontWeight: 800,
  color: '#f8fafc',
}

const closeBtn: React.CSSProperties = {
  background: 'rgba(255, 255, 255, 0.06)',
  border: 'none',
  color: '#94a3b8',
  width: 36,
  height: 36,
  borderRadius: 18,
  fontSize: '16px',
  cursor: 'pointer',
  display: 'grid',
  placeItems: 'center',
}

const content: React.CSSProperties = {
  padding: 24,
  overflowY: 'auto',
  display: 'flex',
  flexDirection: 'column',
  gap: 24,
}

const versionBlock: React.CSSProperties = {
  background: 'rgba(255, 255, 255, 0.03)',
  border: '1px solid rgba(255, 255, 255, 0.08)',
  borderRadius: 16,
  padding: 20,
}

const versionHeader: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  marginBottom: 10,
}

const vTag: React.CSSProperties = {
  padding: '3px 10px',
  borderRadius: 12,
  background: 'linear-gradient(135deg, #0ea5e9 0%, #2563eb 100%)',
  color: '#ffffff',
  fontWeight: 800,
  fontSize: '12px',
}

const vTagMuted: React.CSSProperties = {
  ...vTag,
  background: 'rgba(148, 163, 184, 0.2)',
  color: '#cbd5e1',
}

const vDate: React.CSSProperties = {
  fontSize: '12px',
  color: '#94a3b8',
}

const vBadgeCurrent: React.CSSProperties = {
  fontSize: '10px',
  fontWeight: 800,
  color: '#4ade80',
  background: 'rgba(74, 222, 128, 0.12)',
  border: '1px solid rgba(74, 222, 128, 0.3)',
  padding: '2px 8px',
  borderRadius: 8,
}

const releaseTitle: React.CSSProperties = {
  margin: '0 0 14px',
  fontSize: '15px',
  fontWeight: 700,
  color: '#e2e8f0',
}

const featureList: React.CSSProperties = {
  margin: 0,
  paddingLeft: 18,
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  fontSize: '13px',
  color: '#cbd5e1',
  lineHeight: 1.5,
}

const subList: React.CSSProperties = {
  marginTop: 6,
  paddingLeft: 18,
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
}

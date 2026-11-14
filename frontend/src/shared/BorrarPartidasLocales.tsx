import { useState, type CSSProperties } from 'react'
import { getLocale } from '../i18n'
import { textosDePantallasDe } from '../player/components/textosDePantallas'
import { borrarPartidasGuardadas } from '../player/minigames/core/partidasGuardadas'
import { palabraConfirmada } from './fallosSeguidos'

/**
 * 14/11: salida cuando un trozo de pantalla ha fallado dos veces seguidas. Pide escribir BORRAR (confirmación nominal) y
 * borra solo las partidas de minijuego guardadas en este móvil; después recarga la app. Los avances, la mochila y el
 * mapa no se tocan.
 */
const caja: CSSProperties = { display: 'grid', gap: 8, flex: '1 1 100%', marginTop: 6 }
const boton: CSSProperties = {
  border: '1px solid var(--theme-hairline)',
  borderRadius: 999,
  padding: '8px 14px',
  background: 'transparent',
  color: 'inherit',
  font: 'inherit',
  cursor: 'pointer',
  minHeight: 44,
}
const campo: CSSProperties = {
  border: '1px solid var(--theme-hairline)',
  borderRadius: 12,
  padding: '10px 12px',
  background: 'transparent',
  color: 'inherit',
  font: 'inherit',
  minHeight: 44,
}

export function BorrarPartidasLocales() {
  const t = textosDePantallasDe(getLocale()).ui.errorLocal
  const [abierto, setAbierto] = useState(false)
  const [escrito, setEscrito] = useState('')

  if (!abierto) {
    return (
      <button type="button" style={boton} onClick={() => setAbierto(true)}>
        {t.borrar}
      </button>
    )
  }
  return (
    <div style={caja}>
      <span style={{ fontSize: 13, fontWeight: 500 }}>{t.borrarAviso}</span>
      <input
        value={escrito}
        onChange={(e) => setEscrito(e.target.value)}
        placeholder={t.palabra}
        aria-label={t.palabra}
        autoCapitalize="characters"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        style={campo}
      />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          style={{ ...boton, opacity: palabraConfirmada(escrito, t.palabra) ? 1 : 0.5 }}
          disabled={!palabraConfirmada(escrito, t.palabra)}
          onClick={() => {
            borrarPartidasGuardadas()
            window.location.reload()
          }}
        >
          {t.borrarConfirmar}
        </button>
        <button type="button" style={boton} onClick={() => setAbierto(false)}>
          {t.borrarCancelar}
        </button>
      </div>
    </div>
  )
}

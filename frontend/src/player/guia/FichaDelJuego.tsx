import type { CSSProperties } from 'react'
import { AhoraDeLaGuia } from './AhoraDeLaGuia'
import { juegoEnSuIdioma, textoDeLaGuia, type ClaveDeJuego, type Idioma } from './guia'

const T: Record<Idioma, { guia: string; volver: string; historia: string }> = {
  es: { guia: 'GUÍA', volver: 'Volver al juego', historia: 'Ver la historia del nodo' },
  gl: { guia: 'GUÍA', volver: 'Volver ao xogo', historia: 'Ver a historia do nodo' },
}

/**
 * La ficha de la Guía de ESTE juego, sobre el juego (el «?» de su barra).
 *
 * El juego sigue montado debajo: abrirla no reinicia nada ni para el reloj (cuenta lo mismo que leer las reglas
 * del propio juego). La historia del nodo, que era lo que abría ese «?», sigue aquí con su botón.
 */
export function FichaDelJuego({
  juego,
  enJuego,
  respaldo,
  idioma,
  alCerrar,
  alVerHistoria,
}: {
  juego: ClaveDeJuego | null
  enJuego: 'reglas' | 'jugando'
  respaldo: string
  idioma: Idioma
  alCerrar: () => void
  alVerHistoria?: () => void
}) {
  const t = T[idioma] || T.es
  const nombre = juego ? juegoEnSuIdioma(juego, idioma).nombre : ''
  const texto = textoDeLaGuia(
    {
      terminada: false,
      horaDeInicio: null,
      motivo: 'within_radius',
      distancia: null,
      radio: null,
      numero: 0,
      juego,
      esQr: false,
      esColeccionable: false,
      objeto: '',
      enLinea: true,
      pendientes: 0,
      enJuego,
      respaldo,
    },
    idioma
  )
  // 7/11: en las reglas no se repite la regla (ya está en la pantalla del juego); jugando, «Ahora» es la regla.
  return (
    <div
      data-saga-ficha-guia=""
      role="dialog"
      aria-label={`${t.guia} · ${nombre}`}
      style={capa}
      onClick={alCerrar}
    >
      <div style={ficha} onClick={(e) => e.stopPropagation()}>
        <div style={cabecera}>
          {t.guia}
          {nombre ? ` · ${nombre}` : ''}
        </div>
        <AhoraDeLaGuia
          ahora={texto.ahora}
          despues={texto.despues}
          notas={[]}
          idioma={idioma}
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
          <button type="button" className="saga-toque" style={botonPrincipal} onClick={alCerrar}>
            {t.volver}
          </button>
          {alVerHistoria ? (
            <button
              type="button"
              className="saga-toque"
              style={botonSecundario}
              onClick={alVerHistoria}
            >
              {t.historia}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}

// fixed dentro de una hoja con transform: se ancla a la hoja, no a la pantalla, y no se va con el scroll del juego.
const capa: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 30,
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'center',
  padding: '56px 12px 12px',
  background: 'rgba(var(--theme-ink-deep), .45)',
}

const ficha: CSSProperties = {
  width: 'min(100%, 420px)',
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  padding: 14,
  borderRadius: 16,
  background: 'var(--saga-pizarra, rgb(49,55,67))',
  border: '1px solid var(--saga-pizarra-borde, rgba(var(--theme-line), .3))',
  boxShadow: '0 12px 40px rgba(0,0,0,.45)',
  color: '#fff',
}

const cabecera: CSSProperties = {
  fontSize: 11,
  fontWeight: 900,
  letterSpacing: '0.14em',
  color: 'rgb(var(--theme-line))',
}

const botonPrincipal: CSSProperties = {
  minHeight: 44,
  borderRadius: 12,
  border: '1px solid rgba(255,255,255,.16)',
  background: 'rgba(255,255,255,.12)',
  color: '#fff',
  fontSize: 14,
  fontWeight: 800,
}

const botonSecundario: CSSProperties = {
  minHeight: 44,
  borderRadius: 12,
  border: 0,
  background: 'transparent',
  color: 'rgb(var(--theme-line))',
  fontSize: 13,
  fontWeight: 700,
}

import type { CSSProperties } from 'react'

/**
 * 6/11: la pista frío/templado/caliente de Mapa mudo, para que se entienda.
 *
 * Antes era una pastilla roja «CALIENTE» suelta dentro de una caja vacía («queda fea y no la entiendo», Óscar), y
 * seguía saliendo cuando ya se podía abrir el nodo. Ahora son tres tramos con el actual encendido y una frase corta;
 * sólo mientras se busca (lo decide PlayerHud). El cálculo no cambia: llega hecho (`calorDelMapaMudo`, o el
 * `hot_cold` del servidor) y aquí sólo se pinta. Se ve igual con red o sin ella.
 *
 * Diseño elegido por Óscar (6/11): termómetro, barra de tres tramos con sus nombres debajo (la «línea compacta» se
 * descartó).
 */
export type BandaDeCalor = 'frio' | 'templado' | 'caliente'

const ORDEN: BandaDeCalor[] = ['frio', 'templado', 'caliente']
const COLOR: Record<BandaDeCalor, string> = {
  frio: '#60a5fa',
  templado: '#fbbf24',
  caliente: '#f87171',
}

const TEXTOS = {
  es: {
    nombre: { frio: 'Frío', templado: 'Templado', caliente: 'Caliente' },
    frase: { frio: 'aún lejos de la zona', templado: 'te acercas', caliente: 'busca por aquí' },
  },
  gl: {
    nombre: { frio: 'Frío', templado: 'Morno', caliente: 'Quente' },
    frase: { frio: 'aínda lonxe da zona', templado: 'achégaste', caliente: 'busca por aquí' },
  },
} as const

export function textoDeLaPista(banda: BandaDeCalor, locale: string): string {
  const t = TEXTOS[locale === 'gl' ? 'gl' : 'es']
  return `${t.nombre[banda]} · ${t.frase[banda]}`
}

export function PistaDeCalor({ banda, locale }: { banda: BandaDeCalor; locale: string }) {
  const t = TEXTOS[locale === 'gl' ? 'gl' : 'es']
  const actual = ORDEN.indexOf(banda)
  const frase = textoDeLaPista(banda, locale)
  return (
    <div data-saga-pista-calor={banda} role="status" style={columnaA}>
      <span style={{ ...fraseEstilo, color: '#f8fafc' }}>{frase}</span>
      <div
        style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}
        aria-hidden="true"
      >
        {ORDEN.map((b, i) => (
          <div key={b} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span
              style={{
                height: 7,
                borderRadius: 999,
                background: i === actual ? COLOR[b] : `${COLOR[b]}40`,
                boxShadow: i === actual ? `0 0 10px ${COLOR[b]}` : 'none',
              }}
            />
            <span
              style={{
                fontSize: 10.5,
                fontWeight: i === actual ? 900 : 700,
                letterSpacing: '0.04em',
                textAlign: 'center',
                color: i === actual ? COLOR[b] : 'rgba(var(--theme-line), .8)',
              }}
            >
              {t.nombre[b]}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

const fraseEstilo: CSSProperties = { fontSize: 13, fontWeight: 800, lineHeight: 1.25 }
const columnaA: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  padding: '0 2px',
  marginBottom: 8,
}

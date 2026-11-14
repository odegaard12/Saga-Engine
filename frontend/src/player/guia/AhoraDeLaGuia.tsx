import type { CSSProperties } from 'react'
import type { Idioma } from './guia'

const ROTULOS: Record<Idioma, { ahora: string; despues: string }> = {
  es: { ahora: 'AHORA', despues: 'Después' },
  gl: { ahora: 'AGORA', despues: 'Despois' },
}

/** «Ahora» arriba y «Después» debajo: lo mismo en la pestaña Guía y en la ficha del «?» de un juego. */
export function AhoraDeLaGuia({
  ahora,
  despues,
  notas = [],
  idioma,
  aviso = false,
}: {
  ahora: string
  despues: string | null
  notas?: string[]
  idioma: Idioma
  /** Ámbar: sin red, sin GPS, falta un objeto (algo que no depende de caminar). */
  aviso?: boolean
}) {
  const r = ROTULOS[idioma] || ROTULOS.es
  return (
    <div data-saga-guia-ahora="" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ ...tarjeta, borderColor: aviso ? 'rgba(251,191,36,.5)' : tarjeta.borderColor }}>
        <div style={{ ...rotulo, color: aviso ? '#fbbf24' : rotulo.color }}>{r.ahora}</div>
        <div style={textoAhora}>{ahora}</div>
      </div>
      {despues ? (
        <div style={lineaDespues}>
          <span style={{ fontWeight: 800, color: '#e2e8f0' }}>{r.despues}: </span>
          {despues}
        </div>
      ) : null}
      {notas.map((n) => (
        <div key={n} style={nota}>
          {n}
        </div>
      ))}
    </div>
  )
}

const tarjeta: CSSProperties = {
  background: 'var(--saga-pizarra-tarjeta, rgba(255,255,255,.08))',
  border: '1px solid',
  borderColor: 'rgba(var(--theme-info), .45)',
  borderRadius: 14,
  padding: '10px 12px',
}

const rotulo: CSSProperties = {
  fontSize: 11,
  fontWeight: 900,
  letterSpacing: '0.14em',
  color: 'rgb(var(--theme-info))',
  marginBottom: 3,
}

const textoAhora: CSSProperties = { color: '#fff', fontSize: 15, fontWeight: 800, lineHeight: 1.3 }

const lineaDespues: CSSProperties = {
  color: 'rgb(var(--theme-line))',
  fontSize: 13,
  lineHeight: 1.4,
  padding: '0 2px',
}

const nota: CSSProperties = {
  color: 'rgb(var(--theme-line))',
  fontSize: 12.5,
  lineHeight: 1.4,
  padding: '7px 10px',
  borderRadius: 10,
  border: '1px solid var(--saga-pizarra-raya, rgba(var(--theme-line), .16))',
}

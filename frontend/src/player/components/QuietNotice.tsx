import type { CSSProperties } from 'react'
import { usePresencia, useValorCongelado } from '../ui/movimiento'

/**
 * El aviso que sólo hay que saber, no mirar.
 *
 * Había un único destino para todo —el cartel de `ToastNotice`— y como no se
 * quería llenar la pantalla de carteles, `showNotice` se tragaba en silencio
 * todo lo que llegara con tono `info` o `success`. Medido contra producción el
 * 2026-08-17: quedarse sin cobertura no decía NADA. El jugador avanzaba, la
 * pantalla pasaba al nodo siguiente en 60 ms, y nada le contaba que eso no
 * había salido del móvil. El caso raro —un 500 del servidor— sí avisaba,
 * porque ése venía con tono `warn`.
 *
 * La salida no es quitar el filtro y que todo grite igual. Es que haya dos
 * sitios: el cartel para lo que interrumpe, y esta línea para lo que sólo se
 * cuenta. Va abajo, separada del cartel, y no tapa el mapa.
 *
 * Ni un color clavado y el radio sale del tema. Un número escrito en línea gana
 * a la regla del tema y la deja muerta sin dar ningún error: ya ha pasado
 * cuatro veces (el alfiler del mapa, la barra de arriba, el filtro de los
 * iconos y el fondo de la barra).
 */
export type QuietNoticeData = { message: string } | null

export function QuietNotice({ notice }: { notice: QuietNoticeData }) {
  // Sale con transicion, como el resto: el padre lo pone a `null` y antes se
  // borraba en seco. El ultimo texto se queda mientras se va.
  const presencia = usePresencia(Boolean(notice))
  const mensaje = useValorCongelado(notice?.message ?? '', Boolean(notice))

  if (!presencia.montada) return null

  return (
    <div
      className="saga-aviso saga-aviso--callado"
      data-saga-anim="aviso-callado"
      data-estado={presencia.estado}
      data-animando={presencia.animando ? 'true' : 'false'}
      onTransitionEnd={presencia.alTerminar}
      style={quietLine}
      role="status"
      aria-live="polite"
    >
      {mensaje}
    </div>
  )
}

const quietLine: CSSProperties = {
  maxWidth: 'min(92vw, 420px)',
  padding: '6px 12px',
  // Del tema, con el valor de siempre como respaldo: cristal no cambia.
  borderRadius: 'var(--theme-radius-pill, 999px)',
  border: '1px solid rgba(var(--theme-line), .45)',
  // La opacidad va multiplicada por --theme-solid, como todas las superficies
  // que tapan: 1 en cristal -el mismo numero exacto de antes- y 2.8 en fuego.
  // Sin eso, en fuego se veria el mapa a traves de la linea.
  background: 'rgba(var(--theme-sheen-a), calc(.72 * var(--theme-solid)))',
  color: 'rgb(var(--theme-ink-soft))',
  fontSize: 11,
  lineHeight: 1.35,
  fontWeight: 700,
  textAlign: 'center',
  letterSpacing: '0.01em',
  backdropFilter: 'var(--theme-blur)',
  WebkitBackdropFilter: 'var(--theme-blur)',
  // Entra sin rebote: es una linea que se cuenta, no algo que reclame la vista
  // (la entrada y la salida las pone `.saga-aviso`, ver mobile-themes.css).
}

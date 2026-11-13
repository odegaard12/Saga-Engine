import { useEffect, useState, type CSSProperties } from 'react'
import { leerNumero } from '../lib/leerNumero'

type Props = {
  value: number
  min: number
  max: number
  onCommit: (n: number) => void
  style?: CSSProperties
  ariaLabel?: string
}

/**
 * Campo numérico que se puede VACIAR mientras se escribe (14/11): con `value={Number(x || 50)}` borrar el contenido
 * lo devolvía al instante a 50 (o a 0) y no había forma de teclear «80». Aquí el texto es del campo; sólo se guarda
 * un número válido y, al salir, un campo vacío o con letras vuelve al último valor bueno (nunca se guarda 0 por vacío).
 */
export default function CampoNumero({ value, min, max, onCommit, style, ariaLabel }: Props) {
  const [texto, setTexto] = useState(String(value))
  const [enfocado, setEnfocado] = useState(false)

  useEffect(() => {
    if (!enfocado) setTexto(String(value))
  }, [value, enfocado])

  const leer = (t: string) => leerNumero(t, min, max)

  return (
    <input
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      value={texto}
      style={style}
      aria-label={ariaLabel}
      onFocus={() => setEnfocado(true)}
      onChange={(event) => {
        setTexto(event.target.value)
        const n = leer(event.target.value)
        if (n !== null) onCommit(n)
      }}
      onBlur={() => {
        setEnfocado(false)
        const n = leer(texto)
        setTexto(String(n ?? value))
        if (n !== null && n !== value) onCommit(n)
      }}
    />
  )
}

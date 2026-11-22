import type { CSSProperties } from 'react'

/**
 * 21/11 (I2 «fichas duotono», elegida por Óscar): cada objeto es una ficha cuadrada redondeada con un tinte suave del
 * color de su familia y el glifo de trazo en ese color (más claro en Pizarra, más oscuro en Día: se mezcla con el texto
 * del tema). Estados: `falta` (borde punteado y glifo apagado, sin filtro gris), `tiene` y `listo` (con brillo).
 *
 * El icono sale de una tabla EXACTA id → icono (las recetas de recipeCatalog.ts y los objetos de las rutas). Antes se
 * buscaban trozos en orden y fallaba: `placa_hierro` salía placa base, `sello_rojo` contiene «ojo» (gema),
 * «tiempo/templo» contienen «emp» (rayo) y `hilo_plata`, `polvo_estelar`… caían en la caja gris. Sólo si el id no está
 * en la tabla se miran palabras ENTERAS del id (y del nombre), y si nada encaja, una bolsa en el acento del tema.
 *
 * El color del glifo va por `style.stroke`, no por `color`: Día pisa con !important el `color` de todo svg dentro de
 * las hojas (mobile-themes.css) y el icono salía en el color del texto.
 */
export type EstadoDeFicha = 'falta' | 'tiene' | 'listo'

export type ItemIconSvgProps = {
  itemId: string
  /** El nombre visible: sólo para buscar palabras si el id no está en la tabla. */
  nombre?: string
  customIcon?: string
  className?: string
  /** Lado de la ficha, en px (el glifo ocupa la mitad). */
  size?: number
  estado?: EstadoDeFicha
}

/** Glifos de trazo 24×24, como el resto de iconos de la aplicación. */
const GLIFOS = {
  gema: '<path d="M6 3h12l4 6-10 12L2 9z"/><path d="M2 9h20M12 21 8 9l4-6 4 6-4 12"/>',
  escudo: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M12 7v10M8 11h8"/>',
  hilo: '<path d="M7 3h10M7 21h10"/><path d="M8.5 3v18M15.5 3v18"/><path d="m8.5 8 7 2.5M8.5 12.5l7 2.5M8.5 17l7 1.5"/>',
  sello: '<circle cx="12" cy="9.5" r="6.2"/><path d="m12 6.6 1 2 2.2.3-1.6 1.5.4 2.2-2-1-2 1 .4-2.2-1.6-1.5 2.2-.3z"/><path d="m8.6 14.6-1.8 6.4 3-1.3 2.2 2.3M15.4 14.6l1.8 6.4-3-1.3"/>',
  llave: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.7 12.3 9.3-9.3M17 6l3 3M14.5 8.5l2 2"/>',
  cinta: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.2"/><path d="M21 12v9h-9"/>',
  bateria: '<rect x="3" y="7" width="16" height="10" rx="2"/><path d="M22 11v2M11.5 9 9 12.5h4L10.5 15"/>',
  placa: '<rect x="5" y="5" width="14" height="14" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/>',
  elixir: '<path d="M9 3h6M10 3v5L5 17a3 3 0 0 0 2.7 4h8.6a3 3 0 0 0 2.7-4L14 8V3"/><path d="M7.5 14h9"/>',
  pergamino: '<path d="M15 3H6a2 2 0 0 0-2 2v2h4"/><path d="M8 7v12a2 2 0 0 0 4 0v-1h8v1a2 2 0 0 1-2 2h-8"/><path d="M20 18V5a2 2 0 0 0-2-2h-3M11 8h5M11 12h5"/>',
  polvo: '<path d="m12 3 1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15v5M16.5 17.5h5M5 3v3M3.5 4.5h3"/>',
  fuego: '<path d="M12 22a7 7 0 0 0 7-7c0-4.5-4-6.5-4.5-11-3 2-5.5 5.5-5.5 9-1-.8-1.8-2-2-3.5C5.8 11 5 13 5 15a7 7 0 0 0 7 7z"/>',
  cable: '<path d="M9 2v5M15 2v5M6 7h12v4a6 6 0 0 1-12 0z"/><path d="M12 17v5"/>',
  antena: '<path d="M12 12v10M8 22h8"/><circle cx="12" cy="10" r="2"/><path d="M7.8 5.8a6 6 0 0 0 0 8.4M16.2 5.8a6 6 0 0 1 0 8.4M5 3a10 10 0 0 0 0 14M19 3a10 10 0 0 1 0 14"/>',
  ojo: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  orbe: '<circle cx="12" cy="11" r="7"/><path d="M9 8.5a3.5 3.5 0 0 1 3-1.5"/><path d="M7 21h10"/>',
  hoja: '<path d="M11 20A7 7 0 0 1 4 13c0-6 6-9 16-9 0 10-3 16-9 16z"/><path d="M4 20c4-5 7-7 11-9"/>',
  gota: '<path d="M12 2.7s6 6.4 6 11.3a6 6 0 0 1-12 0c0-4.9 6-11.3 6-11.3z"/>',
  runa: '<path d="M7 3h10l2 9-2 9H7l-2-9z"/><path d="M12 7v10M12 10l3-2M12 13l-3-2"/>',
  lamina: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 10h.01M17 10h.01M7 14h.01M17 14h.01"/>',
  reliquia: '<path d="M7 3h10v4a5 5 0 0 1-10 0z"/><path d="M12 12v6M8 21h8M9 18h6"/>',
  amuleto: '<path d="m8 3 4 5 4-5"/><circle cx="12" cy="14" r="6"/><circle cx="12" cy="14" r="2.2"/>',
  bolsa: '<path d="M9 4h6l-1.5 3h-3z"/><path d="M10.5 7C6 9 4 13 4 16a5 5 0 0 0 5 5h6a5 5 0 0 0 5-5c0-3-2-7-6.5-9"/>',
} as const

type Glifo = keyof typeof GLIFOS

/** El tono de cada familia (horneado: es el color del objeto, igual en los tres temas). */
const FAMILIAS = {
  rosa: '#db2777', // no-tema: color de la familia del objeto
  ambar: '#d97706', // no-tema: color de la familia del objeto
  plata: '#64748b', // no-tema: color de la familia del objeto
  rojo: '#dc2626', // no-tema: color de la familia del objeto
  verde: '#16a34a', // no-tema: color de la familia del objeto
  azul: '#2563eb', // no-tema: color de la familia del objeto
  violeta: '#7c3aed', // no-tema: color de la familia del objeto
  purpura: '#9333ea', // no-tema: color de la familia del objeto
  cuero: '#b45309', // no-tema: color de la familia del objeto
  cian: '#0891b2', // no-tema: color de la familia del objeto
  naranja: '#ea580c', // no-tema: color de la familia del objeto
  tema: 'var(--s-acento)',
} as const

type Familia = keyof typeof FAMILIAS
type Icono = readonly [Glifo, Familia]

/** Id exacto → icono: los objetos de recipeCatalog.ts y los que entregan las rutas. */
const POR_ID: Record<string, Icono> = {
  gemas_antiguas: ['gema', 'rosa'],
  fragmento_escudo: ['escudo', 'ambar'],
  hilo_plata: ['hilo', 'plata'],
  sello: ['sello', 'rojo'],
  llave_rota: ['llave', 'ambar'],
  llave_maestra: ['llave', 'ambar'],
  cinta_aislante: ['cinta', 'verde'],
  bateria_litio: ['bateria', 'azul'],
  cables_cobre: ['cable', 'naranja'],
  placa_base: ['placa', 'violeta'],
  emp_device: ['bateria', 'cian'],
  chip_encriptado: ['placa', 'azul'],
  antena_frecuencia: ['antena', 'azul'],
  decodificador_cuantico: ['antena', 'cian'],
  sensor_optico: ['ojo', 'cian'],
  cristal_enfoque: ['gema', 'cian'],
  escaner_biometrico: ['ojo', 'azul'],
  hierbas_curativas: ['hoja', 'verde'],
  frasco_cristal: ['elixir', 'cian'],
  agua_purificada: ['gota', 'azul'],
  elixir_alquimia: ['elixir', 'purpura'],
  placa_hierro: ['lamina', 'plata'],
  runa_proteccion: ['runa', 'violeta'],
  escudo_runico: ['escudo', 'violeta'],
  esfera_cristal: ['orbe', 'cian'],
  esencia_ignea: ['fuego', 'naranja'],
  polvo_estelar: ['polvo', 'cian'],
  orbe_fuego: ['orbe', 'naranja'],
  fragmento_reliquia: ['reliquia', 'cuero'],
  esencia_sagrada: ['gota', 'ambar'],
  pergamino_antiguo: ['pergamino', 'cuero'],
  reliquia_sagrada: ['reliquia', 'ambar'],
  ojo_mistico: ['ojo', 'purpura'],
  amuleto_vision: ['amuleto', 'purpura'],
}

/** Último recurso: palabras ENTERAS del id o del nombre («sello_rojo» → sello; «tiempo» ya no es «emp»). */
const POR_PALABRA: [RegExp, Icono][] = [
  [/^(sello|selo|seal)s?$/, ['sello', 'rojo']],
  [/^(llave|chave|key)s?$/, ['llave', 'ambar']],
  [/^(gemas?|gem|joya|rubi|esmeralda|diamante)$/, ['gema', 'rosa']],
  [/^(cristal|vidrio)$/, ['gema', 'cian']],
  [/^(escudo|shield|armadura)$/, ['escudo', 'ambar']],
  [/^(hilo|fio|cuerda|plata)$/, ['hilo', 'plata']],
  [/^(cinta|tape)$/, ['cinta', 'verde']],
  [/^(bateria|battery|pila|emp)$/, ['bateria', 'azul']],
  [/^(placa|chip|circuito|board)$/, ['placa', 'violeta']],
  [/^(cables?|cobre)$/, ['cable', 'naranja']],
  [/^(antena|radio|senal)$/, ['antena', 'azul']],
  [/^(ojo|ollo|sensor|eye|escaner)$/, ['ojo', 'cian']],
  [/^(orbe|esfera)$/, ['orbe', 'cian']],
  [/^(hierbas?|herba|planta|hoja)$/, ['hoja', 'verde']],
  [/^(agua|auga|gota)$/, ['gota', 'azul']],
  [/^(elixir|pocion|frasco)$/, ['elixir', 'purpura']],
  [/^(runas?)$/, ['runa', 'violeta']],
  [/^(hierro|ferro|metal)$/, ['lamina', 'plata']],
  [/^(pergamino|mapa|carta|nota|libro)$/, ['pergamino', 'cuero']],
  [/^(polvo|po|estelar|estrella)$/, ['polvo', 'cian']],
  [/^(fuego|lume|ignea|igneo|llama)$/, ['fuego', 'naranja']],
  [/^(esencia)$/, ['polvo', 'purpura']],
  [/^(reliquia|caliz)$/, ['reliquia', 'cuero']],
  [/^(amuleto|colgante)$/, ['amuleto', 'purpura']],
]

const RESPALDO: Icono = ['bolsa', 'tema']

function iconoDe(itemId: string, nombre = ''): Icono {
  const id = itemId.trim().toLowerCase()
  if (POR_ID[id]) return POR_ID[id]
  const palabras = `${id} ${nombre}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
  for (const [patron, icono] of POR_PALABRA) {
    if (palabras.some((p) => patron.test(p))) return icono
  }
  return RESPALDO
}

export default function ItemIconSvg({
  itemId,
  nombre,
  customIcon,
  className = '',
  size = 24,
  estado = 'tiene',
}: ItemIconSvgProps) {
  const [glifo, familia] = customIcon ? RESPALDO : iconoDe(itemId, nombre)
  const tono = FAMILIAS[familia]
  const falta = estado === 'falta'
  const lado = Math.round(size * 0.5)
  return (
    <span
      className={`saga-svg-icon saga-ficha-objeto ${className}`}
      data-saga-ficha={estado}
      data-saga-icono={glifo}
      style={{ ...ficha, width: size, height: size, ...(falta ? fichaFalta : estiloConTono(tono, estado)) }}
    >
      {customIcon ? (
        <span style={{ fontSize: size * 0.55, lineHeight: 1 }}>{customIcon}</span>
      ) : (
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          width={lado}
          height={lado}
          fill="none"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            display: 'block',
            stroke: falta ? 'var(--s-texto-3)' : `color-mix(in srgb, ${tono} 50%, var(--s-texto))`,
          }}
          dangerouslySetInnerHTML={{ __html: GLIFOS[glifo] }}
        />
      )}
    </span>
  )
}

const ficha: CSSProperties = {
  display: 'inline-grid',
  placeItems: 'center',
  flexShrink: 0,
  borderRadius: '30%',
  boxSizing: 'border-box',
}

/** Tinte suave del tono y un aro interior; `listo`, además, el brillo dorado de «ya se puede». */
function estiloConTono(tono: string, estado: EstadoDeFicha): CSSProperties {
  const aro = `inset 0 0 0 1.5px color-mix(in srgb, ${tono} 42%, transparent)`
  return {
    background: `color-mix(in srgb, ${tono} 18%, transparent)`,
    boxShadow:
      estado === 'listo'
        ? `${aro}, 0 0 0 2px var(--s-aviso), 0 0 16px color-mix(in srgb, var(--s-aviso) 55%, transparent)`
        : aro,
  }
}

/** Lo que falta: sin tinte, borde punteado; nunca gris por filtro. */
const fichaFalta: CSSProperties = {
  background: 'transparent',
  outline: '1.5px dashed color-mix(in srgb, var(--s-texto) 32%, transparent)',
  outlineOffset: -1.5,
}

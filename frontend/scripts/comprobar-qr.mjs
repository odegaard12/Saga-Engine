/**
 * ¿Se puede leer la pegatina que vamos a imprimir?
 *
 * Sustituye al autotest viejo (/qr-selftest), que comprobaba un motor de visión
 * de 11 MB sobre seis fotos de campo. Esto comprueba lo que de verdad importa
 * ahora: que el código que genera la aplicación lo decodifica el mismo lector
 * que lleva el móvil.
 *
 *     cd frontend && node scripts/comprobar-qr.mjs
 *
 * ⚠️ Lo que mide es el caso MÁS FÁCIL posible: un raster perfecto, sin ruido,
 * sin perspectiva y sin brillos. Una foto hecha en el monte falla mucho antes.
 * Que aquí lea NO garantiza que lea en campo; que aquí NO lea garantiza que en
 * campo tampoco. Sirve para descartar, no para dar por bueno: la prueba de
 * verdad son fotos de las pegatinas impresas.
 */
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QRCodeSVG } from 'qrcode.react'
import jsQR from 'jsqr'

const PAYLOADS = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['SAGA_01', 'SAGA_02', 'chip_encriptado']

/** Los mismos ajustes que src/shared/qrCard.tsx. Si divergen, esto miente. */
const AJUSTES = {
  level: 'H',
  marginSize: 4,
  bgColor: '#ffffff',
  fgColor: '#000000',
  size: 512,
}

function medir(payload, ajustes) {
  const svg = renderToStaticMarkup(createElement(QRCodeSVG, { value: payload, ...ajustes }))
  const viewBox = /viewBox="0 0 (\d+) (\d+)"/.exec(svg)
  if (!viewBox) throw new Error('el generador no devolvió un viewBox')
  return { lado: Number(viewBox[1]), svg }
}

function rasterizar(payload, ajustes, escala = 8) {
  const { svg, lado } = medir(payload, ajustes)

  const trazado =
    /<path[^>]*fill="#000000"[^>]*d="([^"]+)"/.exec(svg) ||
    /<path[^>]*d="([^"]+)"[^>]*fill="#000000"/.exec(svg)
  if (!trazado) throw new Error('no se encontró el trazado del código')

  const px = lado * escala
  const datos = new Uint8ClampedArray(px * px * 4).fill(255)

  // qrcode.react mezcla dos formas para el mismo comando: "M4 4h7v1H4z" y
  // "M18,4 h7v1H18z". Leer sólo una deja fuera la mitad de los módulos, y el
  // resultado parece que el código no se lee cuando el que falla es el lector.
  const comandos = trazado[1].matchAll(
    /M(\d+(?:\.\d+)?)[ ,](\d+(?:\.\d+)?)\s*h(\d+(?:\.\d+)?)v(\d+(?:\.\d+)?)/g
  )

  for (const c of comandos) {
    const x0 = Number(c[1])
    const y0 = Number(c[2])
    const ancho = Number(c[3])
    const alto = Number(c[4])

    for (let y = Math.round(y0 * escala); y < Math.round((y0 + alto) * escala); y += 1) {
      for (let x = Math.round(x0 * escala); x < Math.round((x0 + ancho) * escala); x += 1) {
        const p = (y * px + x) * 4
        datos[p] = 0
        datos[p + 1] = 0
        datos[p + 2] = 0
        datos[p + 3] = 255
      }
    }
  }

  return { datos, px }
}

/** Tapa el centro con un recuadro blanco: el logo de las pegatinas viejas. */
function taparCentro(datos, px, fraccion) {
  const lado = Math.round(px * fraccion)
  const desde = Math.round((px - lado) / 2)

  for (let y = desde; y < desde + lado; y += 1) {
    for (let x = desde; x < desde + lado; x += 1) {
      const p = (y * px + x) * 4
      datos[p] = 255
      datos[p + 1] = 255
      datos[p + 2] = 255
    }
  }

  return datos
}

function leer(datos, px) {
  return jsQR(datos, px, px, { inversionAttempts: 'attemptBoth' })?.data ?? null
}

let fallos = 0

console.log('Zona de silencio (la norma pide 4 módulos; el generador trae 0):')
console.log()
console.log('  payload             módulos   con margen   zona')
console.log('  ' + '-'.repeat(52))

for (const payload of PAYLOADS) {
  const desnudo = medir(payload, { ...AJUSTES, marginSize: 0 }).lado
  const vestido = medir(payload, AJUSTES).lado
  const zona = (vestido - desnudo) / 2

  if (zona < 4) fallos += 1

  console.log(
    '  %s %s %s %s',
    payload.padEnd(18),
    String(desnudo).padStart(7),
    String(vestido).padStart(12),
    (zona + ' módulos' + (zona >= 4 ? '' : '  ⚠ FALLA')).padStart(12)
  )
}

console.log()
console.log('Lectura con jsQR, que es el decodificador del móvil sin lector nativo.')
console.log('Las columnas de logo miden cuánto aguanta el código con algo encima:')
console.log()
console.log('  payload             limpio   logo 16%  logo 24%  logo 30%  logo 40%')
console.log('  ' + '-'.repeat(66))

for (const payload of PAYLOADS) {
  const limpio = rasterizar(payload, AJUSTES)
  const leLimpio = leer(limpio.datos, limpio.px) === payload

  if (!leLimpio) fallos += 1

  const conLogo = [0.16, 0.24, 0.3, 0.4].map((fraccion) => {
    const r = rasterizar(payload, AJUSTES)
    return leer(taparCentro(r.datos, r.px, fraccion), r.px) === payload
  })

  const marca = (ok) => (ok ? 'lee  ' : 'NO   ')

  console.log(
    '  %s %s    %s     %s     %s     %s',
    payload.padEnd(18),
    marca(leLimpio),
    ...conLogo.map(marca)
  )
}

console.log()

if (fallos) {
  console.log('⚠ %d comprobación(es) fallidas. NO imprimas pegatinas con esto.', fallos)
  process.exit(1)
}

console.log('Todo correcto. Recuerda: esto descarta problemas, no los da por resueltos.')
console.log('Imprime una, hazle una foto en el monte y compruébala con el móvil.')

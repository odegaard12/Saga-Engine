/**
 * Dibujos en canvas de los iconos del mapa: funciones puras, devuelven ImageData (sacado tal cual de MapSurfaceGL.tsx).
 */
import { COLOR_TIPO, OSCURO_TIPO } from '../bolaRenderizada'
import { type TipoDeNodo } from '../nodosTresD'
import { DESPLAZAMIENTO_PIES_PX } from '../../avatares/retratoDeMapa'
import { RADIO_ENTRADA_PX, COLOR_NODO_ACTUAL } from './capas'

/**
 * Dibuja una chincheta con el número dentro, en un canvas.
 *
 * A doble resolución (`pixelRatio: 2` al registrarla) para que no salga
 * borrosa en un móvil. Forma: cabeza redonda con luz arriba y borde
 * oscuro, punta hacia abajo, y una sombra elíptica en el suelo que es lo
 * que la hace parecer CLAVADA y no pegada a la pantalla.
 */
export function dibujarChincheta(numero: string, color: string): ImageData | null {
  const ancho = 56
  const alto = 72
  const lienzo = document.createElement('canvas')
  lienzo.width = ancho * 2
  lienzo.height = alto * 2
  const ctx = lienzo.getContext('2d')
  if (!ctx) return null
  ctx.scale(2, 2)

  // Sombra en el suelo, bajo la punta.
  ctx.save()
  ctx.translate(ancho / 2, alto - 4)
  ctx.scale(1, 0.38)
  const sombra = ctx.createRadialGradient(0, 0, 2, 0, 0, 16)
  sombra.addColorStop(0, 'rgba(0,0,0,.55)')
  sombra.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = sombra
  ctx.beginPath()
  ctx.arc(0, 0, 16, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  // Cuerpo: círculo arriba + punta abajo, en un solo trazo.
  const cx = ancho / 2
  const cy = 24
  const r = 19
  ctx.beginPath()
  ctx.arc(cx, cy, r, Math.PI * 0.8, Math.PI * 0.2, false)
  ctx.lineTo(cx, alto - 6)
  ctx.closePath()
  const luz = ctx.createRadialGradient(cx - 6, cy - 7, 2, cx, cy, r + 6)
  luz.addColorStop(0, 'rgba(255,255,255,.55)')
  luz.addColorStop(0.35, color)
  luz.addColorStop(1, 'rgba(0,0,0,.45)')
  ctx.fillStyle = luz
  ctx.fill()
  ctx.lineWidth = 2.5
  ctx.strokeStyle = '#0b1220'
  ctx.stroke()

  // Disco claro para que el número se lea sobre cualquier color.
  ctx.beginPath()
  ctx.arc(cx, cy, 12.5, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255,255,255,.92)'
  ctx.fill()

  ctx.fillStyle = '#0b1220'
  ctx.font = `900 ${numero.length > 1 ? 14 : 16}px system-ui, -apple-system, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(numero, cx, cy + 0.5)

  return ctx.getImageData(0, 0, lienzo.width, lienzo.height)
}

/**
 * La BOLA de un nodo, como imagen para un símbolo del mapa.
 *
 * Los nodos se dibujaban con three.js dentro del lienzo de MapLibre y en
 * el móvil salían serrados -sin antialiasing de contexto, y activarlo
 * rompía las fotos-, además de temblar al mover el mapa. Un símbolo lo
 * pinta el propio MapLibre, a tres veces la resolución de pantalla, en el
 * mismo fotograma y a la altura exacta del terreno: nítido a cualquier
 * zoom y sin nada que parpadee. El aspecto de bola (luz, sombra, brillo)
 * va horneado en la imagen; el número, la chapa del tipo y la peana con
 * la forma del tipo, también.
 */
export function dibujarBola(numero: string, estado: 'hecho' | 'actual' | 'pendiente' | 'oro', tipo: TipoDeNodo): ImageData | null {
  const escala = 3
  const ancho = 64
  const alto = 92
  const lienzo = document.createElement('canvas')
  lienzo.width = ancho * escala
  lienzo.height = alto * escala
  const ctx = lienzo.getContext('2d')
  if (!ctx) return null
  ctx.scale(escala, escala)

  // El color es el TIPO, como en 3D (poképaradas); el hecho, apagado.
  // 'oro': el hecho recién completado, dorado sólo mientras dura la celebración (ver ORO_MONEDA_MS).
  const color = estado === 'oro' ? '#fbbf24' : estado === 'hecho' ? '#94a3b8' : COLOR_TIPO[tipo] // no-tema: color horneado en la imagen del nodo
  const oscuro = estado === 'oro' ? '#b45309' : estado === 'hecho' ? '#475569' : OSCURO_TIPO[tipo] // no-tema: color horneado en la imagen del nodo
  const cx = ancho / 2
  const suelo = alto - 8
  const r = estado === 'actual' ? 21 : 18
  const cy = suelo - 34 - r

  // Suelo: sombra, aro de color y peana con la forma del tipo, aplastados
  // como los vería la cámara inclinada.
  ctx.save()
  ctx.translate(cx, suelo)
  ctx.scale(1, 0.4)
  const sombra = ctx.createRadialGradient(0, 0, 2, 0, 0, 20)
  sombra.addColorStop(0, 'rgba(0,0,0,.5)')
  sombra.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = sombra
  ctx.beginPath()
  ctx.arc(0, 0, 20, 0, Math.PI * 2)
  ctx.fill()
  const aro = ctx.createRadialGradient(0, 0, 10, 0, 0, 19)
  aro.addColorStop(0, 'rgba(0,0,0,0)')
  aro.addColorStop(0.55, color + 'cc')
  aro.addColorStop(1, color + '00')
  ctx.fillStyle = aro
  ctx.beginPath()
  ctx.arc(0, 0, 19, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = 'rgba(15,23,42,.85)' // no-tema: peana horneada en la imagen, no un color de pantalla
  ctx.beginPath()
  if (tipo === 'qr') {
    ctx.rect(-8, -8, 16, 16)
  } else if (tipo === 'minijuego') {
    ctx.moveTo(0, -10)
    ctx.lineTo(10, 7)
    ctx.lineTo(-10, 7)
    ctx.closePath()
  } else if (tipo === 'coleccionable') {
    for (let i = 0; i < 6; i += 1) {
      const a = (Math.PI / 3) * i
      const x = Math.cos(a) * 9.5
      const y = Math.sin(a) * 9.5
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.closePath()
  } else {
    ctx.arc(0, 0, 9, 0, Math.PI * 2)
  }
  ctx.fill()
  ctx.restore()

  // Mástil: canto oscuro y alma clara.
  ctx.lineCap = 'round'
  ctx.strokeStyle = 'rgba(11,18,32,.5)'
  ctx.lineWidth = 4.5
  ctx.beginPath()
  ctx.moveTo(cx, suelo - 2)
  ctx.lineTo(cx, cy + r - 2)
  ctx.stroke()
  ctx.strokeStyle = 'rgba(255,255,255,.9)'
  ctx.lineWidth = 2.5
  ctx.stroke()

  // La bola: luz arriba a la izquierda, sombra abajo a la derecha.
  const luz = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r * 1.05)
  luz.addColorStop(0, 'rgba(255,255,255,.95)')
  luz.addColorStop(0.28, color)
  luz.addColorStop(1, oscuro)
  ctx.fillStyle = luz
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.lineWidth = 1.5
  ctx.strokeStyle = 'rgba(11,18,32,.55)'
  ctx.stroke()
  ctx.fillStyle = 'rgba(255,255,255,.35)'
  ctx.beginPath()
  ctx.ellipse(cx - r * 0.3, cy - r * 0.45, r * 0.32, r * 0.2, -0.6, 0, Math.PI * 2)
  ctx.fill()

  // Disco claro con el número: se lee sobre cualquier color.
  const rd = r * 0.62
  ctx.beginPath()
  ctx.arc(cx, cy, rd, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255,255,255,.95)'
  ctx.fill()
  ctx.fillStyle = '#0b1220'
  ctx.font = `900 ${numero.length > 1 ? rd * 1.15 : rd * 1.35}px system-ui, -apple-system, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(numero, cx, cy + 0.5)

  // Chapa del tipo, arriba a la derecha.
  const bx = cx + r * 0.72
  const by = cy - r * 0.72
  ctx.beginPath()
  ctx.arc(bx, by, 7.5, 0, Math.PI * 2)
  ctx.fillStyle = '#ffffff'
  ctx.fill()
  ctx.lineWidth = 1.5
  ctx.strokeStyle = color
  ctx.stroke()
  ctx.fillStyle = oscuro
  ctx.strokeStyle = oscuro
  ctx.lineWidth = 1.6
  ctx.lineJoin = 'round'
  ctx.beginPath()
  if (tipo === 'checkpoint') {
    ctx.moveTo(bx - 2.5, by - 4)
    ctx.lineTo(bx - 2.5, by + 4)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(bx - 2.5, by - 4)
    ctx.lineTo(bx + 3.5, by - 4)
    ctx.lineTo(bx + 2, by - 1.5)
    ctx.lineTo(bx + 3.5, by + 1)
    ctx.lineTo(bx - 2.5, by + 1)
    ctx.closePath()
    ctx.fill()
  } else if (tipo === 'qr') {
    ctx.rect(bx - 4, by - 4, 2.8, 2.8)
    ctx.rect(bx + 1.2, by - 4, 2.8, 2.8)
    ctx.rect(bx - 4, by + 1.2, 2.8, 2.8)
    ctx.rect(bx + 1.6, by + 1.6, 2, 2)
    ctx.fill()
  } else if (tipo === 'coleccionable') {
    ctx.moveTo(bx, by - 4.2)
    ctx.lineTo(bx + 4, by - 1)
    ctx.lineTo(bx, by + 4.2)
    ctx.lineTo(bx - 4, by - 1)
    ctx.closePath()
    ctx.fill()
  } else {
    ctx.moveTo(bx - 2.6, by - 3.6)
    ctx.lineTo(bx + 3.6, by)
    ctx.lineTo(bx - 2.6, by + 3.6)
    ctx.closePath()
    ctx.fill()
  }

  return ctx.getImageData(0, 0, lienzo.width, lienzo.height)
}

/**
 * 7/11 (Óscar eligió la A): en 2D, o con el mapa sin inclinar, el nodo es SÓLO su moneda con el número, centrada en
 * su punto, sin poste ni peana. El estado va en el tamaño: el actual, grande y con su halo; el siguiente, normal; los
 * pendientes, más pequeños y apagados; los hechos, grises y pequeños con una chapa verde ✓. Lienzo de 80 px a escala
 * 3 (moneda normal de 36 px de diámetro a tamaño 1, como la bola de la chincheta), horneado una vez por nombre.
 */
export function dibujarMoneda(
  numero: string,
  estado: 'hecho' | 'actual' | 'siguiente' | 'pendiente' | 'oro',
  tipo: TipoDeNodo
): ImageData | null {
  const escala = 3
  const lado = 80
  const lienzo = document.createElement('canvas')
  lienzo.width = lado * escala
  lienzo.height = lado * escala
  const ctx = lienzo.getContext('2d')
  if (!ctx) return null
  ctx.scale(escala, escala)
  const oro = estado === 'oro' // el hecho recién completado: dorado sólo mientras dura la celebración
  const hecho = estado === 'hecho' || oro
  const color = oro ? '#fbbf24' : hecho ? '#94a3b8' : COLOR_TIPO[tipo] // no-tema: color horneado en la imagen del nodo
  const oscuro = oro ? '#b45309' : hecho ? '#475569' : OSCURO_TIPO[tipo] // no-tema: color horneado en la imagen del nodo
  const c = lado / 2
  const r = estado === 'actual' ? 21 : estado === 'siguiente' ? 18 : 15.5
  if (estado === 'actual') {
    const halo = ctx.createRadialGradient(c, c, r * 0.7, c, c, r * 1.65)
    halo.addColorStop(0, color + 'b0')
    halo.addColorStop(1, color + '00')
    ctx.fillStyle = halo
    ctx.beginPath()
    ctx.arc(c, c, r * 1.65, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = estado === 'pendiente' ? 0.82 : 1
  const luz = ctx.createRadialGradient(c - r * 0.35, c - r * 0.4, r * 0.1, c, c, r * 1.05)
  luz.addColorStop(0, 'rgba(255,255,255,.95)') // no-tema: horneado en la imagen del nodo
  luz.addColorStop(0.28, color)
  luz.addColorStop(1, oscuro)
  ctx.fillStyle = luz
  ctx.beginPath()
  ctx.arc(c, c, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.lineWidth = 1.5
  ctx.strokeStyle = 'rgba(11,18,32,.55)' // no-tema: horneado en la imagen del nodo
  ctx.stroke()
  const rd = r * 0.62
  ctx.beginPath()
  ctx.arc(c, c, rd, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255,255,255,.95)' // no-tema: horneado en la imagen del nodo
  ctx.fill()
  ctx.fillStyle = '#0b1220' // no-tema: número horneado en la imagen del nodo
  ctx.font = `900 ${numero.length > 1 ? rd * 1.15 : rd * 1.35}px system-ui, -apple-system, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(numero, c, c + 0.5)
  ctx.globalAlpha = 1
  if (hecho) {
    const x = c + r * 0.72
    const y = c + r * 0.72
    ctx.beginPath()
    ctx.arc(x, y, 7, 0, Math.PI * 2)
    ctx.fillStyle = '#16a34a' // no-tema: chapa de hecho horneada en la imagen del nodo
    ctx.fill()
    ctx.lineWidth = 1.5
    ctx.strokeStyle = '#ffffff' // no-tema: horneado en la imagen del nodo
    ctx.stroke()
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(x - 3, y)
    ctx.lineTo(x - 0.8, y + 2.6)
    ctx.lineTo(x + 3.4, y - 2.6)
    ctx.stroke()
  }
  return ctx.getImageData(0, 0, lienzo.width, lienzo.height)
}

/** Resplandor del nodo en juego, del mismo tamaño que la bola: late por `icon-opacity`. */
/**
 * El radio de entrada, visto desde arriba: velo muy suave dentro y un anillo
 * que brilla justo en el borde, del color del tipo. Nada de relleno oscuro
 * (el círculo de antes, "cutre" y "demasiado oscuro").
 */
export function dibujarEntrada(tipo: TipoDeNodo): ImageData | null {
  const escala = 2
  const lado = RADIO_ENTRADA_PX * 2 * escala
  const lienzo = document.createElement('canvas')
  lienzo.width = lado
  lienzo.height = lado
  const ctx = lienzo.getContext('2d')
  if (!ctx) return null
  const c = lado / 2
  const hex = COLOR_TIPO[tipo]
  const g = ctx.createRadialGradient(c, c, 0, c, c, c)
  g.addColorStop(0, hex + '0f')
  g.addColorStop(0.78, hex + '1a')
  g.addColorStop(0.9, hex + '59')
  g.addColorStop(0.965, hex + 'e6')
  g.addColorStop(1, hex + '00')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, lado, lado)
  return ctx.getImageData(0, 0, lado, lado)
}

export function dibujarHalo(centroY = 92 - 8 - 34 - 21, ancho = 64, alto = 92): ImageData | null {
  const escala = 3
  const lienzo = document.createElement('canvas')
  lienzo.width = ancho * escala
  lienzo.height = alto * escala
  const ctx = lienzo.getContext('2d')
  if (!ctx) return null
  ctx.scale(escala, escala)
  const cx = ancho / 2
  const r = 21
  const cy = centroY
  const g = ctx.createRadialGradient(cx, cy, r * 0.7, cx, cy, r * 1.5)
  g.addColorStop(0, COLOR_NODO_ACTUAL + 'aa')
  g.addColorStop(1, COLOR_NODO_ACTUAL + '00')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(cx, cy, r * 1.5, 0, Math.PI * 2)
  ctx.fill()
  return ctx.getImageData(0, 0, lienzo.width, lienzo.height)
}

/**
 * Enmarca una miniatura como foto de campo: cuadrado con esquinas
 * redondeadas, marco blanco grueso y sombra en el suelo bajo la base.
 * Sin imagen (aún cargando, o fallida) deja el marco con un gris neutro:
 * el sitio se ve igual, la foto llega cuando llega.
 */
/**
 * El montón de fotos de un nodo: dos tarjetas detrás, la primera foto
 * delante y cuántas hay. Antes las de un nodo no se veían hasta el zoom 18 y
 * entonces salían en fila, pequeñas y encima del camino ("se ven mal").
 */
export function dibujarPila(imagen: HTMLImageElement | null, cuantas: number): ImageData | null {
  const lado = 64
  const lienzo = document.createElement('canvas')
  lienzo.width = lado * 2
  lienzo.height = lado * 2
  const ctx = lienzo.getContext('2d')
  if (!ctx) return null
  ctx.scale(2, 2)
  const tarjeta = (angulo: number, dx: number, dy: number) => {
    ctx.save()
    ctx.translate(30 + dx, 36 + dy)
    ctx.rotate((angulo * Math.PI) / 180)
    ctx.beginPath()
    ctx.roundRect(-21, -21, 42, 42, 7)
    ctx.fillStyle = '#e2e8f0'
    ctx.shadowColor = 'rgba(0,0,0,.4)'
    ctx.shadowBlur = 5
    ctx.shadowOffsetY = 2
    ctx.fill()
    ctx.restore()
  }
  if (cuantas > 2) tarjeta(-12, -4, 1)
  if (cuantas > 1) tarjeta(9, 4, 0)
  // La de delante, con la foto.
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(8, 14, 44, 44, 8)
  ctx.fillStyle = '#f8fafc'
  ctx.shadowColor = 'rgba(0,0,0,.45)'
  ctx.shadowBlur = 6
  ctx.shadowOffsetY = 2
  ctx.fill()
  ctx.restore()
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(11, 17, 38, 38, 6)
  ctx.clip()
  if (imagen) {
    const escala = Math.max(38 / imagen.width, 38 / imagen.height)
    const w = imagen.width * escala
    const h = imagen.height * escala
    ctx.drawImage(imagen, 11 + (38 - w) / 2, 17 + (38 - h) / 2, w, h)
  } else {
    ctx.fillStyle = '#94a3b8' // no-tema: color horneado en la imagen del montón
    ctx.fillRect(11, 17, 38, 38)
  }
  ctx.restore()
  // Cuántas.
  if (cuantas > 1) {
    ctx.beginPath()
    ctx.arc(50, 15, 11, 0, Math.PI * 2)
    ctx.fillStyle = '#0f172a' // no-tema: color horneado en la imagen del montón
    ctx.fill()
    ctx.lineWidth = 2
    ctx.strokeStyle = '#ffffff'
    ctx.stroke()
    ctx.fillStyle = '#ffffff'
    ctx.font = '800 12px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(cuantas > 99 ? '99+' : String(cuantas), 50, 15.5)
  }
  return ctx.getImageData(0, 0, lienzo.width, lienzo.height)
}

export function dibujarFoto(imagen: HTMLImageElement | null): ImageData | null {
  const lado = 48
  const ancho = 60
  const alto = 64
  const lienzo = document.createElement('canvas')
  lienzo.width = ancho * 2
  lienzo.height = alto * 2
  const ctx = lienzo.getContext('2d')
  if (!ctx) return null
  ctx.scale(2, 2)

  // Sombra en el suelo.
  ctx.save()
  ctx.translate(ancho / 2, alto - 5)
  ctx.scale(1, 0.35)
  const sombra = ctx.createRadialGradient(0, 0, 3, 0, 0, 20)
  sombra.addColorStop(0, 'rgba(0,0,0,.5)')
  sombra.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = sombra
  ctx.beginPath()
  ctx.arc(0, 0, 20, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  const x = (ancho - lado) / 2
  const y = 4
  const radio = 9
  const trazarMarco = (inset: number) => {
    const r = Math.max(2, radio - inset)
    ctx.beginPath()
    ctx.roundRect(x + inset, y + inset, lado - inset * 2, lado - inset * 2, r)
  }

  trazarMarco(0)
  ctx.fillStyle = '#f8fafc'
  ctx.shadowColor = 'rgba(0,0,0,.45)'
  ctx.shadowBlur = 6
  ctx.shadowOffsetY = 2
  ctx.fill()
  ctx.shadowColor = 'transparent'

  trazarMarco(3)
  ctx.save()
  ctx.clip()
  if (imagen) {
    // Recorte centrado, como `object-fit: cover`.
    const escala = Math.max((lado - 6) / imagen.width, (lado - 6) / imagen.height)
    const w = imagen.width * escala
    const h = imagen.height * escala
    ctx.drawImage(imagen, x + 3 + (lado - 6 - w) / 2, y + 3 + (lado - 6 - h) / 2, w, h)
  } else {
    // Gris de foto sin cargar: es un hueco, no un color de la piel. (no-tema)
    ctx.fillStyle = '#94a3b8' // no-tema
    ctx.fillRect(x, y, lado, lado)
  }
  ctx.restore()

  return ctx.getImageData(0, 0, lienzo.width, lienzo.height)
}

/**
 * El icono de un grupo de compañeros: disco oscuro con el número dentro, en el
 * mismo lienzo (64 × 84) y con los pies en el mismo sitio que los muñecos, para
 * que compartan ancla y desplazamiento en la capa.
 */
export function dibujarGrupo(cuantos: number): ImageData | null {
  const escala = 3
  const lienzo = document.createElement('canvas')
  lienzo.width = 64 * escala
  lienzo.height = 84 * escala
  const ctx = lienzo.getContext('2d')
  if (!ctx) return null
  ctx.scale(escala, escala)
  const cx = 32
  // 11/11: centrado en su punto, como los retratos (que ya no llevan punta): alto - DESPLAZAMIENTO_PIES_PX.
  const cy = 84 - DESPLAZAMIENTO_PIES_PX
  ctx.beginPath()
  ctx.arc(cx, cy, 22, 0, Math.PI * 2)
  ctx.fillStyle = '#ffffff'
  ctx.shadowColor = 'rgba(0,0,0,.45)'
  ctx.shadowBlur = 5
  ctx.shadowOffsetY = 2
  ctx.fill()
  ctx.shadowColor = 'transparent'
  ctx.beginPath()
  ctx.arc(cx, cy, 19, 0, Math.PI * 2)
  ctx.fillStyle = '#1f302b'
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  ctx.font = '900 20px system-ui, -apple-system, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(String(Math.min(cuantos, 99)), cx, cy + 1)
  return ctx.getImageData(0, 0, lienzo.width, lienzo.height)
}

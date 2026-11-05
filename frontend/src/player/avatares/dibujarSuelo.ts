/**
 * El suelo de cada jugador en el mapa (aro del color del equipo y flecha de rumbo), tumbado
 * sobre el terreno. Va aparte del retrato (`retratoDeMapa.ts`) y del avatar 3D.
 */

/**
 * Cono de rumbo (5/11): del color del jugador, nace en el aro y se funde hacia delante sin borde duro. Se pinta en
 * capas cada vez más estrechas y casi transparentes (sin `ctx.filter`, que Safari no tiene). Encima del aro va un
 * labio claro en el canto delantero que dice «por aquí» aunque el cono se pierda sobre el satélite.
 */
function dibujarConoDeRumbo(ctx: CanvasRenderingContext2D, c: number, color: string, largoPx: number) {
  ctx.save()
  ctx.translate(c, c)
  const capas = 7
  for (let k = 0; k < capas; k += 1) {
    const abertura = 0.6 - k * 0.075
    const fundido = ctx.createRadialGradient(0, 0, 17, 0, 0, largoPx - k * 1.5)
    fundido.addColorStop(0, color + '8c')
    fundido.addColorStop(0.5, color + '40')
    fundido.addColorStop(1, color + '00')
    ctx.fillStyle = fundido
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.arc(0, 0, largoPx - k * 1.5, -Math.PI / 2 - abertura, -Math.PI / 2 + abertura)
    ctx.closePath()
    ctx.fill()
  }
  ctx.restore()
}

function lienzoNuevo(ancho: number, alto: number, escala: number): { lienzo: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
  if (typeof document === 'undefined') return null
  const lienzo = document.createElement('canvas')
  lienzo.width = ancho * escala
  lienzo.height = alto * escala
  const ctx = lienzo.getContext('2d')
  if (!ctx) return null
  ctx.scale(escala, escala)
  return { lienzo, ctx }
}

/** Lado del lienzo del suelo, en px lógicos: cabe el aro, la sombra y la flecha de rumbo. */
export const LADO_SUELO_JUGADOR_PX = 96

/**
 * El suelo de un jugador, TUMBADO en el mapa: sombra blanda, aro del color
 * del equipo y, si `conRumbo`, una flecha hacia el norte de la imagen (el
 * mapa la gira con el rumbo). Es simétrico salvo la flecha, así que sirve
 * igual sin ella. Mismo lenguaje que el suelo de los nodos: sombra, aro de
 * color que se difumina hacia fuera y brillo en el canto.
 */
export function dibujarSueloDeJugador(color: string, conRumbo: boolean): ImageData | null {
  const escala = 3
  const nuevo = lienzoNuevo(LADO_SUELO_JUGADOR_PX, LADO_SUELO_JUGADOR_PX, escala)
  if (!nuevo) return null
  const { ctx, lienzo } = nuevo
  const c = LADO_SUELO_JUGADOR_PX / 2
  // El cono va debajo del aro: nace de él.
  if (conRumbo) dibujarConoDeRumbo(ctx, c, color, 47)

  // Sombra del jugador (suave: un centro oscuro se leía como un «halo»).
  const sombra = ctx.createRadialGradient(c, c, 4, c, c, 22)
  sombra.addColorStop(0, 'rgba(0,0,0,.28)')
  sombra.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = sombra
  ctx.beginPath()
  ctx.arc(c, c, 22, 0, Math.PI * 2)
  ctx.fill()

  // Aro del color del equipo: canto blanco fino por fuera, cuerpo de color, difuminado.
  const aro = ctx.createRadialGradient(c, c, 12, c, c, 23)
  aro.addColorStop(0, color + '00')
  aro.addColorStop(0.45, color + 'dd')
  aro.addColorStop(0.8, color + 'ff')
  aro.addColorStop(1, color + '00')
  ctx.fillStyle = aro
  ctx.beginPath()
  ctx.arc(c, c, 23, 0, Math.PI * 2)
  ctx.fill()
  ctx.lineWidth = 1.6
  ctx.strokeStyle = 'rgba(255,255,255,.92)'
  ctx.beginPath()
  ctx.arc(c, c, 18.6, 0, Math.PI * 2)
  ctx.stroke()

  if (conRumbo) {
    // Labio por encima del aro (el cono ya está debajo).
    ctx.save()
    ctx.translate(c, c)
    const labio = ctx.createLinearGradient(-12, 0, 12, 0)
    labio.addColorStop(0, 'rgba(255,255,255,0)')
    labio.addColorStop(0.5, 'rgba(255,255,255,.95)')
    labio.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.strokeStyle = labio
    ctx.lineWidth = 2.4
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.arc(0, 0, 21.5, -Math.PI / 2 - 0.55, -Math.PI / 2 + 0.55)
    ctx.stroke()
    ctx.restore()
  }
  return ctx.getImageData(0, 0, lienzo.width, lienzo.height)
}

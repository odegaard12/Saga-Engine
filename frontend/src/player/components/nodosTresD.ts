import * as THREE from 'three'
import * as maplibregl from 'maplibre-gl'

/**
 * Los nodos como objetos 3D de verdad dentro del mapa.
 *
 * Es una capa personalizada de MapLibre que dibuja con three.js sobre el
 * mismo lienzo WebGL: recibe la matriz de proyección del mapa en cada
 * fotograma, así que los modelos viven en metros sobre el terreno y se
 * inclinan, se tapan y se escalan con el relieve como cualquier otra cosa
 * del mapa. Nada de calcomanías.
 *
 * El diseño acordado: monolito blanco, sobrio; la BASE y la tapa con la
 * forma del tipo de nodo (redonda checkpoint, cuadrada QR, triangular
 * minijuego); el COLOR es el estado (verde hecho, azul en juego, rojo
 * pendiente) en una franja de luz vertical, la tapa y un disco en el suelo;
 * el número grande siempre de frente e icono pequeño del tipo debajo. La
 * animación es mínima: la luz respira; el nodo en juego lleva un anillo
 * fino girando y un pulso suave en el suelo.
 *
 * En cuesta: el zócalo se hunde 30 cm en el terreno y es alto, así que en
 * una ladera "muerde" el suelo por el lado de arriba en vez de quedar
 * flotando por el de abajo.
 */

export type TipoDeNodo = 'checkpoint' | 'qr' | 'minijuego'
export type EstadoDeNodo = 'hecho' | 'actual' | 'pendiente'

export type NodoTresD = {
  id: string
  lat: number
  lon: number
  numero: number
  tipo: TipoDeNodo
  estado: EstadoDeNodo
}

const COLOR: Record<EstadoDeNodo, number> = { hecho: 0x22c55e, actual: 0x3b82f6, pendiente: 0xef4444 }

function lienzo(pintar: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')
  if (g) pintar(g)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

function texturaNumero(numero: number, hex: string): THREE.CanvasTexture {
  return lienzo((g) => {
    g.fillStyle = '#ffffff'
    g.beginPath()
    g.roundRect(28, 48, 200, 160, 40)
    g.fill()
    g.lineWidth = 14
    g.strokeStyle = hex
    g.stroke()
    g.font = `900 ${numero >= 10 ? 104 : 124}px system-ui, -apple-system, sans-serif`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillStyle = '#0b1220'
    g.fillText(String(numero), 128, 132)
  })
}

function texturaIcono(tipo: TipoDeNodo): THREE.CanvasTexture {
  return lienzo((g) => {
    g.fillStyle = '#ffffff'
    g.beginPath()
    g.arc(128, 128, 112, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = '#0b1220'
    g.strokeStyle = '#0b1220'
    g.lineWidth = 18
    g.lineJoin = 'round'
    g.lineCap = 'round'
    if (tipo === 'checkpoint') {
      g.beginPath()
      g.moveTo(92, 66)
      g.lineTo(92, 196)
      g.stroke()
      g.beginPath()
      g.moveTo(92, 68)
      g.lineTo(178, 68)
      g.lineTo(158, 100)
      g.lineTo(178, 132)
      g.lineTo(92, 132)
      g.closePath()
      g.fill()
    } else if (tipo === 'qr') {
      const q = (x: number, y: number, s: number) => g.fillRect(x, y, s, s)
      q(64, 64, 48)
      q(144, 64, 48)
      q(64, 144, 48)
      g.fillStyle = '#ffffff'
      q(78, 78, 20)
      q(158, 78, 20)
      q(78, 158, 20)
      g.fillStyle = '#0b1220'
      q(148, 148, 16)
      q(176, 176, 16)
      q(148, 176, 12)
      q(176, 148, 12)
    } else {
      g.beginPath()
      g.roundRect(52, 102, 152, 72, 36)
      g.fill()
      g.fillStyle = '#ffffff'
      g.fillRect(76, 130, 38, 12)
      g.fillRect(89, 117, 12, 38)
      g.beginPath()
      g.arc(158, 130, 8, 0, Math.PI * 2)
      g.fill()
      g.beginPath()
      g.arc(182, 148, 8, 0, Math.PI * 2)
      g.fill()
    }
  })
}

/** Base y tapa con la forma del tipo: redonda, cuadrada o triangular. */
function formaDelTipo(tipo: TipoDeNodo, radio: number, alto: number): THREE.BufferGeometry {
  if (tipo === 'qr') return new THREE.BoxGeometry(radio * 1.8, alto, radio * 1.8)
  if (tipo === 'minijuego') return new THREE.CylinderGeometry(radio * 1.15, radio * 1.15, alto, 3)
  return new THREE.CylinderGeometry(radio, radio, alto, 48)
}

type Pieza = {
  grupo: THREE.Group
  nodo: NodoTresD
  franjas: THREE.Mesh[]
  tapa: THREE.Mesh
  anillo: THREE.Mesh | null
  pulso: THREE.Mesh | null
  carteles: THREE.Mesh[]
  altura: number
  elevacion: number
  elevacionEn: number
}

export type CapaNodosTresD = {
  capa: maplibregl.CustomLayerInterface
  setNodos: (nodos: NodoTresD[]) => void
  setVisible: (visible: boolean) => void
  estadisticas: () => { piezas: number; visible: boolean; anadida: boolean }
}

export function crearCapaNodosTresD(id: string): CapaNodosTresD {
  let mapa: maplibregl.Map | null = null
  let renderer: THREE.WebGLRenderer | null = null
  const escena = new THREE.Scene()
  const camara = new THREE.Camera()
  const piezas: Pieza[] = []
  let pendientes: NodoTresD[] | null = null
  let visible = true
  let anadida = false
  let repintadoProgramado = false
  const reloj = new THREE.Clock()

  const cuerpoMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.6, metalness: 0.05 })
  const zocaloMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.7, metalness: 0.05 })

  function limpiar() {
    for (const p of piezas) {
      escena.remove(p.grupo)
      p.grupo.traverse((o) => {
        const m = o as THREE.Mesh
        if (m.geometry) m.geometry.dispose()
        const mat = m.material as THREE.Material | THREE.Material[] | undefined
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose())
        else if (mat && mat !== cuerpoMat && mat !== zocaloMat) mat.dispose()
      })
    }
    piezas.length = 0
  }

  function construir(nodo: NodoTresD): Pieza {
    const color = COLOR[nodo.estado]
    const hex = '#' + color.toString(16).padStart(6, '0')
    const g = new THREE.Group()
    g.matrixAutoUpdate = false
    const H = nodo.estado === 'actual' ? 4.6 : 4.0
    const luz = (k: number) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: k, roughness: 0.3 })

    // Zócalo hundido: muerde la ladera en vez de flotar.
    const zocalo = new THREE.Mesh(formaDelTipo(nodo.tipo, 0.95, 0.9), zocaloMat)
    zocalo.position.y = 0.15
    g.add(zocalo)
    const disco = new THREE.Mesh(new THREE.RingGeometry(1.05, 1.3, 64), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, depthWrite: false }))
    disco.rotation.x = -Math.PI / 2
    disco.position.y = 0.62
    g.add(disco)

    // Cuerpo con la forma del tipo, blanco mate.
    const cuerpo = new THREE.Mesh(formaDelTipo(nodo.tipo, 0.55, H), cuerpoMat)
    cuerpo.position.y = 0.6 + H / 2
    g.add(cuerpo)

    // Franja de luz en cuatro caras.
    const franjas: THREE.Mesh[] = []
    for (let i = 0; i < 4; i += 1) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(0.14, H - 1.0, 0.03), luz(1.1))
      const a = (i / 4) * Math.PI * 2
      f.position.set(Math.sin(a) * 0.56, 0.6 + H / 2 - 0.1, Math.cos(a) * 0.56)
      f.rotation.y = a
      g.add(f)
      franjas.push(f)
    }
    const tapa = new THREE.Mesh(formaDelTipo(nodo.tipo, 0.58, 0.16), luz(1.4))
    tapa.position.y = 0.6 + H + 0.08
    g.add(tapa)

    // Cartel con el número y, debajo, el icono. Se orientan a la cámara en cada fotograma.
    const carteles: THREE.Mesh[] = []
    const numero = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.9), new THREE.MeshBasicMaterial({ map: texturaNumero(nodo.numero, hex), transparent: true, depthWrite: false }))
    numero.position.y = 0.6 + H + 1.6
    numero.renderOrder = 10
    g.add(numero)
    carteles.push(numero)
    const icono = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7), new THREE.MeshBasicMaterial({ map: texturaIcono(nodo.tipo), transparent: true, depthWrite: false }))
    icono.position.y = 0.6 + H + 0.62
    icono.renderOrder = 10
    g.add(icono)
    carteles.push(icono)

    let anillo: THREE.Mesh | null = null
    let pulso: THREE.Mesh | null = null
    if (nodo.estado === 'actual') {
      anillo = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.035, 10, 96), luz(1.2))
      anillo.position.y = 0.6 + H - 0.4
      anillo.rotation.x = Math.PI / 2 + 0.2
      g.add(anillo)
      pulso = new THREE.Mesh(new THREE.RingGeometry(1.0, 1.1, 64), new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false }))
      pulso.rotation.x = -Math.PI / 2
      pulso.position.y = 0.64
      g.add(pulso)
    }
    escena.add(g)
    return { grupo: g, nodo, franjas, tapa, anillo, pulso, carteles, altura: H, elevacion: 0, elevacionEn: 0 }
  }

  function aplicarNodos(nodos: NodoTresD[]) {
    limpiar()
    for (const n of nodos) piezas.push(construir(n))
    mapa?.triggerRepaint()
  }

  const capa: maplibregl.CustomLayerInterface = {
    id,
    type: 'custom',
    renderingMode: '3d',
    onAdd(m, gl) {
      mapa = m
      anadida = true
      renderer = new THREE.WebGLRenderer({ canvas: m.getCanvas(), context: gl, antialias: true })
      renderer.autoClear = false
      escena.add(new THREE.HemisphereLight(0xdbeafe, 0x3b5a3a, 1.1))
      const sol = new THREE.DirectionalLight(0xfff3d6, 1.4)
      sol.position.set(0.5, 1, 0.7)
      escena.add(sol)
      if (pendientes) {
        aplicarNodos(pendientes)
        pendientes = null
      }
    },
    onRemove() {
      limpiar()
      renderer?.dispose()
      renderer = null
      anadida = false
      mapa = null
    },
    render(_gl, matriz) {
      if (!renderer || !mapa || !visible || piezas.length === 0) return
      const t = reloj.getElapsedTime()
      const rumbo = (mapa.getBearing() * Math.PI) / 180
      const inclinacion = (mapa.getPitch() * Math.PI) / 180
      const conTerreno = Boolean(mapa.getTerrain())
      const ahora = performance.now()

      for (const p of piezas) {
        // Elevación del terreno bajo el nodo, refrescada cada medio segundo:
        // las teselas de elevación llegan cuando llegan.
        if (conTerreno && ahora - p.elevacionEn > 500) {
          const e = mapa.queryTerrainElevation({ lng: p.nodo.lon, lat: p.nodo.lat })
          if (typeof e === 'number' && Number.isFinite(e)) p.elevacion = e
          p.elevacionEn = ahora
        }
        const mc = maplibregl.MercatorCoordinate.fromLngLat([p.nodo.lon, p.nodo.lat], conTerreno ? p.elevacion - 0.3 : 0)
        const s = mc.meterInMercatorCoordinateUnits()
        p.grupo.matrix
          .makeTranslation(mc.x, mc.y, mc.z)
          .multiply(new THREE.Matrix4().makeScale(s, -s, s))
          .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2))

        // Carteles siempre de frente: giran con el rumbo y se tumban con la inclinación.
        for (const c of p.carteles) c.rotation.set(-(Math.PI / 2 - inclinacion), -rumbo, 0, 'YXZ')

        const v = p.nodo.estado === 'pendiente' ? 0.35 : 1
        const respira = (p.nodo.estado === 'actual' ? 1.2 : 0.8) + 0.35 * Math.sin(t * 1.6 * v)
        for (const f of p.franjas) (f.material as THREE.MeshStandardMaterial).emissiveIntensity = respira
        ;(p.tapa.material as THREE.MeshStandardMaterial).emissiveIntensity = respira + 0.2
        if (p.anillo) p.anillo.rotation.z = t * 0.6
        if (p.pulso) {
          const f = (t * 0.45) % 1
          p.pulso.scale.setScalar(1 + f * 1.4)
          ;(p.pulso.material as THREE.MeshBasicMaterial).opacity = 0.5 * (1 - f)
        }
      }

      camara.projectionMatrix.fromArray(matriz as unknown as number[])
      renderer.resetState()
      renderer.render(escena, camara)

      // La animación necesita fotogramas: se pide el siguiente a ~20 por
      // segundo, sólo con la pestaña visible. Es lo que gasta batería, y
      // por eso no va a 60.
      if (!repintadoProgramado && document.visibilityState === 'visible') {
        repintadoProgramado = true
        window.setTimeout(() => {
          repintadoProgramado = false
          mapa?.triggerRepaint()
        }, 50)
      }
    },
  }

  return {
    capa,
    setNodos(nodos) {
      if (!anadida) {
        pendientes = nodos
        return
      }
      aplicarNodos(nodos)
    },
    setVisible(v) {
      visible = v
      mapa?.triggerRepaint()
    },
    estadisticas: () => ({ piezas: piezas.length, visible, anadida }),
  }
}

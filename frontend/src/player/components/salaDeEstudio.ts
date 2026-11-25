import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

/**
 * La luz de estudio (RoomEnvironment) igual que con three.js r160, donde se afinaron la tienda, los retratos y la bola.
 *
 * En r160 la sala se creaba sin renderer y su foco del techo valía 5: casi apagado, la luz salía de los paneles de
 * los lados. Las versiones nuevas lo ponen siempre a 900 y bajan la sala 3,5 m: la piel salía un 12 % más clara y
 * alumbrada desde arriba. Aquí se vuelven a poner los dos valores de entonces.
 */
export function salaDeEstudio(): RoomEnvironment {
  const sala = new RoomEnvironment()
  sala.position.y = 0
  sala.traverse((o) => {
    if ((o as THREE.PointLight).isPointLight) (o as THREE.PointLight).intensity = 5
  })
  return sala
}

/**
 * Desde r163, con `scene.environment` three.js ya no mira el `envMapIntensity` de cada material: todos van a 1
 * (o a `scene.environmentIntensity`). El nuestro no es 1 en la piel y la ropa (0,42), el pelo (0,5), las córneas (3)
 * ni la bola (sin esto, otro 10 % más de luz en la piel y la cara plana): esos materiales llevan el entorno como
 * `envMap` propio, que sí respeta su intensidad. Los que van a 1 (complementos, peana) siguen con el de la escena. Llamarlo al meter el objeto en una escena con entorno.
 */
export function entornoPorMaterial(raiz: THREE.Object3D, entorno: THREE.Texture | null): void {
  raiz.traverse((o) => {
    for (const m of ([] as THREE.Material[]).concat((o as THREE.Mesh).material ?? [])) {
      const s = m as THREE.MeshStandardMaterial
      if (s.isMeshStandardMaterial && s.envMapIntensity !== 1) s.envMap = entorno
    }
  })
}
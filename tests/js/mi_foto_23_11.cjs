// 23/11: la copia de SU foto en este móvil (src/shared/miFoto.ts) y cómo la elige la bienvenida (Bienvenida.tsx).
// Vuelca un JSON para tests/test_arranque_y_mi_foto_23_11.py.
const { crearCargador } = require('./cargarTs.cjs')

const guardado = new Map()
const localStorage = {
  getItem: (k) => (guardado.has(k) ? guardado.get(k) : null),
  setItem: (k, v) => guardado.set(k, String(v)),
  removeItem: (k) => guardado.delete(k),
}
const window = {
  location: { pathname: '/player/Ana', search: '?user=Ana', href: 'http://x/player/Ana?user=Ana', origin: 'http://x' },
  localStorage,
  history: { state: null, replaceState() {} },
  addEventListener() {},
  removeEventListener() {},
}
const cargar = crearCargador({ window, localStorage, URLSearchParams, Math, Date, JSON, console, Promise, Blob, setTimeout, clearTimeout })
const M = cargar('src/shared/miFoto.ts')
const B = cargar('src/player/components/Bienvenida.tsx')
const P = cargar('src/shared/PuertaDeMision.tsx')
const J = cargar('src/shared/jugadorRecordado.ts')

const JPG = 'data:image/jpeg;base64,/9j/4AAQSkZJRg=='
const SERVIDOR = '/api/player-avatar/Ana?v=abc123'
const SERVIDOR2 = '/api/player-avatar/Ana?v=otra999'
const blob = (tipo, tam) => ({ size: tam, type: tipo })
const falsa = (tipo, tam) => async () => ({ ok: true, blob: async () => blob(tipo, tam) })

;(async () => {
  const r = {}
  // 1) qué cuenta como foto de perfil
  r.valida = {
    servidor: M.esFotoDePerfil(SERVIDOR),
    jpeg: M.esFotoDePerfil(JPG),
    svg: M.esFotoDePerfil('data:image/svg+xml;base64,PHN2Zy8+'),
    cara: M.esFotoDePerfil('/assets/avatares/cara-mx2.webp'),
    externa: M.esFotoDePerfil('https://otro.sitio/x.png'),
    dobleBarra: M.esFotoDePerfil('/api/player-avatar//x'),
    vacia: M.esFotoDePerfil(''),
  }
  // 2) sin copia: la del servidor; con copia: la copia (instantánea)
  r.sinCopia = M.elegirFoto(null, SERVIDOR)
  r.nada = M.elegirFoto(null, null)
  r.copiaDelServidor = M.elegirFoto({ u: SERVIDOR, d: JPG }, SERVIDOR)
  r.copiaVieja = M.elegirFoto({ u: SERVIDOR, d: JPG }, SERVIDOR2) // el servidor cambió: sigue la copia hasta refrescarla
  r.copiaPropiaSinServidor = M.elegirFoto({ u: '', d: JPG }, null)
  r.copiaPropiaYServidorConFoto = M.elegirFoto({ u: '', d: JPG }, SERVIDOR) // el servidor ya tiene foto: gana
  // 3) recordar: baja, comprueba tipo y tamaño, guarda
  r.guardaServidor = await M.recordarMiFoto('Ana', SERVIDOR, { buscar: falsa('image/jpeg', 9000), leer: async () => JPG })
  r.copia = M.leerMiFoto('Ana')
  r.fetchRepetido = await M.recordarMiFoto('Ana', SERVIDOR, { buscar: async () => { throw new Error('no debería pedir') } })
  r.rechazaGrande = await M.recordarMiFoto('Luis', SERVIDOR, { buscar: falsa('image/jpeg', 900000), leer: async () => JPG })
  r.rechazaSvg = await M.recordarMiFoto('Luis', SERVIDOR, { buscar: falsa('image/svg+xml', 900), leer: async () => JPG })
  r.rechazaNoOk = await M.recordarMiFoto('Luis', SERVIDOR, { buscar: async () => ({ ok: false, blob: async () => blob('image/jpeg', 9) }), leer: async () => JPG })
  r.sinRed = await M.recordarMiFoto('Luis', SERVIDOR, { buscar: async () => { throw new Error('offline') } })
  r.incrustada = await M.recordarMiFoto('Rosa', JPG)
  r.copiaRosa = M.leerMiFoto('Rosa')
  r.copiaLuis = M.leerMiFoto('Luis')
  r.basura = (() => { guardado.set('saga_mi_foto:Eva', '{"u":"","d":"javascript:alert(1)"}'); return M.leerMiFoto('Eva') })()
  // 4) la bienvenida: copia local primero, aunque la configuración guardada no traiga ficha ni foto
  localStorage.setItem('saga_offline_public_config_v1', JSON.stringify({ config: { player_profiles: [{ id: 'Otra', avatar_ref: SERVIDOR2 }] } }))
  r.bienvenidaConCopia = B.fotoDelJugador(null)
  guardado.delete('saga_mi_foto:Ana')
  r.bienvenidaSinNada = B.fotoDelJugador(null)
  r.bienvenidaConPartida = B.fotoDelJugador(SERVIDOR2) // la foto de la partida cuando llega
  M.guardarMiFoto('Ana', { u: '', d: JPG }) // «Poner mi foto»
  r.bienvenidaPropia = B.fotoDelJugador(null)
  // 5) la puerta de la misión abre ya con la misión guardada y sin clave que pedir; pide con clave puesta y sin desbloquear
  r.puerta = {
    sinCopia: P.estadoInicialDeLaPuerta(null),
    sinClave: P.estadoInicialDeLaPuerta({ mission_pass_required: false }),
    claveYaPuesta: P.estadoInicialDeLaPuerta({ mission_pass_required: true, mission_unlocked: true }),
    claveSinPoner: P.estadoInicialDeLaPuerta({ mission_pass_required: true, mission_unlocked: false }),
  }
  // 6) la sesión que sale desde index.html: se gasta una vez y sólo si es del jugador recordado
  window.__sagaSesionUser = 'Ana'
  window.__sagaSesion = Promise.resolve('valida')
  r.sesionDeOtro = J.sesionAdelantada('Luis') === null
  const previa = J.sesionAdelantada('Ana')
  r.sesionAdelantada = previa ? await previa : null
  r.sesionGastada = J.sesionAdelantada('Ana') === null
  window.__sagaSesionUser = 'Ana'
  window.__sagaSesion = new Promise(() => {}) // red colgada: a los 30 ms, «sin-red» (la bienvenida sigue con lo guardado)
  r.sesionColgada = await J.comprobarSesionDelJugador('Ana', 30)
  console.log(JSON.stringify(r))
})()

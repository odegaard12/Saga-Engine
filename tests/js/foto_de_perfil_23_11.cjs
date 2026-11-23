// 23/11: qué cara sale en la bienvenida y la pantalla de carga (Bienvenida.tsx). Vuelca un JSON para
// tests/test_foto_y_jugadores_quietos_23_11.py.
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
const cargar = crearCargador({ window, localStorage, URLSearchParams, Math, Date, JSON, console })
const B = cargar('src/player/components/Bienvenida.tsx')

const FOTO = '/api/player-avatar/Ana?v=abc123'
// La copia guardada de la configuración (la de la portada): Ana con su foto Y su personaje 3D elegido.
localStorage.setItem(
  'saga_offline_public_config_v1',
  JSON.stringify({
    config: {
      player_profiles: [
        { id: 'Ana', display_name: 'Ana', avatar_url: '', avatar_ref: FOTO, character: 'mx2', character_chosen: true, avatar: { character: 'mx2' } },
      ],
    },
  })
)
const deLaCopia = B.fotoDelJugador()
localStorage.setItem('saga_offline_public_config_v1', JSON.stringify({ config: { player_profiles: [{ id: 'Ana', avatar_ref: '', character: 'mx2' }] } }))
const sinFoto = B.fotoDelJugador()

console.log(
  JSON.stringify({
    FOTO,
    deLaCopia,
    sinFoto,
    ref: B.fotoDePerfil({ avatar_ref: FOTO, avatar: { character: 'mx2' } }),
    incrustada: B.fotoDePerfil({ avatar_url: 'data:image/jpeg;base64,AAAA' }),
    // La cara del personaje (o cualquier otra imagen que no sea SU foto) nunca cuenta como foto de perfil.
    caraDelPersonaje: B.fotoDePerfil({ avatar_url: '/assets/avatares/cara-mx2.webp' }),
    externa: B.fotoDePerfil({ avatar_url: 'https://otro.sitio/x.png' }),
    nada: B.fotoDePerfil(null),
    svg: B.fotoDePerfil({ avatar_url: 'data:image/svg+xml;base64,PHN2Zy8+' }),
  })
)

// Ejecuta en Node la lógica pura de los personajes del mapa (sin React ni navegador)
// y vuelca un JSON para tests/test_personajes_y_movimiento.py.
const fs = require('fs')
const path = require('path')
const vm = require('vm')
const RAIZ = path.resolve(__dirname, '..', '..')
const AV = path.join(RAIZ, 'frontend', 'src', 'player', 'avatares')
const ts = require(path.join(RAIZ, 'frontend', 'node_modules', 'typescript'))

const cache = {}
function cargar(nombre) {
  const js = ts.transpileModule(fs.readFileSync(path.join(AV, nombre + '.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  const modulo = { exports: {} }
  const requerir = (n) => cache[n.replace('./', '')]
  vm.runInNewContext(js, { module: modulo, exports: modulo.exports, require: requerir, Math, Number, String, Array, Set, Map, Boolean, Object, JSON })
  cache[nombre] = modulo.exports
  return modulo.exports
}

const P = cargar('personajes')
const AC = cargar('avatarConfig')
const D = cargar('movimientoSuave')
const C = cargar('celebracion')
const R = cargar('rutaAndada')
const out = {}

out.lista = [...P.PERSONAJES]

// Deslizador
{
  const d = new D.Deslizador()
  d.poner({ lat: 42.0, lon: -8.0 }, 0)
  d.poner({ lat: 42.0, lon: -7.9998 }, 1000)
  const dur = d.duracionMs()
  const mitad = d.posicion(1000 + dur / 2)
  const fin = d.posicion(1000 + dur)
  out.desliz = {
    mitadEntre: mitad.lon > -8.0 && mitad.lon < -7.9998,
    finExacto: fin.lon === -7.9998,
    moviendoAl: d.enMovimiento(1100),
    quietoDespues: d.enMovimiento(1000 + dur + 1),
    rumbo: d.rumbo(1100),
  }
  const s = new D.Deslizador()
  s.poner({ lat: 42.0, lon: -8.0 }, 0)
  s.poner({ lat: 42.1, lon: -8.0 }, 10) // >150 m: salto, sin deslizar
  out.desliz.saltoSinDeslizar = s.posicion(10).lat === 42.1
  const r = new D.Deslizador()
  r.poner({ lat: 42.0, lon: -8.0 }, 0)
  r.poner({ lat: 42.0, lon: -8.0000001 }, 10) // ruido
  out.desliz.ruidoSinRumbo = r.rumbo(20)
}

// Celebración
{
  const e = { previo: 2, actual: 3, totalNodos: 6, reducido: false, siguienteEsMapaMudo: false, mapaListo: true }
  out.celeb = {
    normal: C.decidirCelebracion(e),
    primeraLectura: C.decidirCelebracion({ ...e, previo: null }),
    salto: C.decidirCelebracion({ ...e, actual: 5 }),
    mapaNoListo: C.decidirCelebracion({ ...e, mapaListo: false }),
    mapaMudo: C.decidirCelebracion({ ...e, siguienteEsMapaMudo: true }),
    reducido: C.decidirCelebracion({ ...e, reducido: true }),
    ultimo: C.decidirCelebracion({ ...e, previo: 5, actual: 6 }),
    maxMs: C.DURACION_MAXIMA_MS,
    totalMs: C.DURACION_FESTEJO_MS + C.DURACION_VUELO_MS,
  }
  const c = new C.Celebracion()
  c.iniciar(C.decidirCelebracion(e), 0)
  const fases = [0, 999, 1000, 2000, 2299, 2300, 3000].map((t) => c.avanzar(t).fase)
  out.celeb.fases = fases
  const c2 = new C.Celebracion()
  c2.iniciar(C.decidirCelebracion({ ...e, siguienteEsMapaMudo: true }), 0)
  out.celeb.mudoFases = [500, 1000].map((t) => c2.avanzar(t).fase)
  const c3 = new C.Celebracion()
  c3.iniciar(C.decidirCelebracion(e), 0)
  out.celeb.cancela = [c3.cancelar(), c3.fase, c3.cancelar()]
  out.celeb.reducidaMq = [
    C.prefiereMenosMovimiento(() => ({ matches: true })),
    C.prefiereMenosMovimiento(() => ({ matches: false })),
    C.prefiereMenosMovimiento(undefined),
  ]
}

// Ruta andada
{
  const track = [0, 1, 2, 3].map((i) => ({ lat: 42.0, lon: -8.0 + i * 0.001 })) // ~83 m por tramo
  const corte = R.cortarTrazado(track, 100)
  out.ruta = {
    puntos: [corte.andado.length, corte.resto.length],
    unidos: corte.andado[corte.andado.length - 1].lon === corte.resto[0].lon,
    cero: R.cortarTrazado(track, 0).andado.length,
    todo: R.cortarTrazado(track, 1e6).resto.length,
    lejos: R.proyectarEnTrazado(track, { lat: 42.01, lon: -8.0 }),
  }
}
// Avatar como configuración, unicidad y decisión de cuándo enseñar el selector.
{
  const ocupadas = AC.clavesOcupadas([{ avatar: { character: 'can' } }, { avatar: 'raposo' }, { avatar: { character: 'dragon' } }])
  out.avatar = {
    claveSimple: AC.claveDeAvatar({ character: 'can' }),
    claveIgualFormatoViejo: AC.claveDeAvatar('can') === AC.claveDeAvatar({ character: 'can' }),
    clavePartesOrden: AC.claveDeAvatar({ character: 'can', parts: { pelo: '3', piel: 2 } }) === AC.claveDeAvatar({ character: 'can', parts: { piel: 2, pelo: '3' } }),
    partesCambianLaClave: AC.claveDeAvatar({ character: 'can', parts: { pelo: '3' } }) !== AC.claveDeAvatar({ character: 'can' }),
    invalido: AC.claveDeAvatar({ character: 'dragon' }),
    ocupadas: [...ocupadas].sort(),
    estado: AC.leerEstadoDePersonaje({ character_chosen: true, avatar: { character: 'can' }, taken: [{ hash: 'h', avatar: { character: 'vikinga' } }, { avatar: 7 }] }),
    estadoRaro: AC.leerEstadoDePersonaje('no'),
    debeMostrar: {
      yaLocal: AC.debeMostrarseLaEleccion({ local: 'can', servidor: 'sin-elegir' }),
      yaServidor: AC.debeMostrarseLaEleccion({ local: null, servidor: 'elegido' }),
      sinElegir: AC.debeMostrarseLaEleccion({ local: null, servidor: 'sin-elegir' }),
      sinRed: AC.debeMostrarseLaEleccion({ local: null, servidor: 'sin-respuesta' }),
    },
  }
}
process.stdout.write(JSON.stringify(out))

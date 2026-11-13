// 13/11: lógica pura de la entrada al panel (adminErrors.ts, adminSessionClock.ts, pinesDelPanel.ts).
// Mismo método que admin_frontend.cjs: se transpila al vuelo con el `typescript` de frontend/node_modules.
// Uso: node tests/js/admin_acceso_13_11.cjs   (imprime un JSON por stdout)
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const RAIZ = path.resolve(__dirname, '..', '..')
const FRONT = path.join(RAIZ, 'frontend')
const ts = require(path.join(FRONT, 'node_modules', 'typescript'))
const cache = new Map()

const contexto = vm.createContext({ console })

function resolver(desde, spec) {
  const base = path.resolve(path.dirname(desde), spec)
  for (const c of [base, base + '.ts', base + '.tsx']) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c
  }
  throw new Error('no resuelve ' + spec)
}

function cargar(fichero) {
  if (cache.has(fichero)) return cache.get(fichero).exports
  const mod = { exports: {} }
  cache.set(fichero, mod)
  const js = ts.transpileModule(fs.readFileSync(fichero, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: 'ES2020', esModuleInterop: true },
  }).outputText
  const req = (s) => (s.startsWith('.') ? cargar(resolver(fichero, s)) : {})
  new vm.Script('(function (module, exports, require) {' + js + '\n})', { filename: fichero }).runInContext(contexto)(
    mod,
    mod.exports,
    req
  )
  return mod.exports
}

const lib = (n) => cargar(path.join(FRONT, 'src/admin/lib', n))
const E = lib('adminErrors.ts')
const R = lib('adminSessionClock.ts')
const P = lib('pinesDelPanel.ts')

const http = (status, detail, body) => new E.AdminHttpError(status, detail, body === undefined ? { detail } : body)
const plano = (v) => JSON.parse(JSON.stringify(v === undefined ? null : v))
const out = {}

// --- ¿Sesión caducada? ---
out.caducada = {
  s403_forbidden: E.isSessionExpired(403, 'forbidden'),
  s403_mala_clave: E.isSessionExpired(403, 'bad password'),
  s403_cambiar_clave: E.isSessionExpired(403, 'password change required'),
  s403_origen: E.isSessionExpired(403, 'cross-site request blocked (cross_origin)'),
  s401_clave_de_mision: E.isSessionExpired(401, 'mission key required'),
  s401_login: E.isSessionExpired(401, 'invalid admin password'),
  s500: E.isSessionExpired(500, ''),
}

// --- Mensajes ---
const m = (err, ctx) => E.describeAdminError(err, ctx)
out.mensajes = {
  login_quedan_4: m(http(401, 'invalid admin password', { detail: 'invalid admin password', remaining_attempts: 4, retry_in: 0 }), 'login'),
  login_queda_1: m(http(401, 'invalid admin password', { detail: 'invalid admin password', remaining_attempts: 1, retry_in: 0 }), 'login'),
  login_bloqueado: m(http(401, 'invalid admin password', { detail: 'invalid admin password', remaining_attempts: 0, retry_in: 600 }), 'login'),
  login_sin_cuerpo: m(http(401, 'invalid admin password'), 'login'),
  bloqueo_429: m(http(429, 'too many failed attempts; retry in 120s'), 'login'),
  ritmo_429: m(http(429, 'rate limit exceeded'), 'accion'),
  origen_403: m(http(403, 'cross-site request blocked (cross_origin)'), 'accion'),
  sesion_403: m(http(403, 'forbidden'), 'accion'),
  clave_mision_401: m(http(401, 'mission key required'), 'cargar'),
  cloudflare_502: m(http(502, ''), 'cargar'),
  cloudflare_504: m(http(504, '', null), 'guardar'),
  fallo_500: m(http(500, 'boom'), 'accion'),
}

// --- Segundos de bloqueo ---
out.bloqueo = {
  de_429: E.lockoutSeconds(http(429, 'too many failed attempts; retry in 120s')),
  de_ritmo: E.lockoutSeconds(http(429, 'rate limit exceeded')),
  de_401_con_bloqueo: E.lockoutSeconds(http(401, 'invalid admin password', { retry_in: 30 })),
  de_401_sin_bloqueo: E.lockoutSeconds(http(401, 'invalid admin password', { retry_in: 0 })),
  de_otro: E.lockoutSeconds(http(500, 'x')),
}

// --- Reloj de la sesión: cuándo avisar ---
const sw = (e, a, ahora) => plano(R.sessionWarning({ expiresAt: e, absoluteAt: a }, ahora))
out.aviso = {
  lejos: sw(10_000, 50_000, 9_000),
  a_cuatro_min: sw(10_000, 50_000, 9_760),
  inactividad_a_un_min: sw(10_000, 50_000, 9_940),
  tope_a_dos_min: sw(10_000, 10_000, 9_880),
  caducada: sw(10_000, 50_000, 10_001),
  sin_reloj: sw(0, 0, 9_000),
}

// Las cabeceras del servidor ponen el reloj.
R.resetSessionClock()
R.noteSessionHeaders({ get: (n) => ({ 'x-admin-session-expires': '12345', 'x-admin-session-absolute': '99999' })[n] ?? null })
out.reloj_con_cabeceras = plano(R.getSessionClock())
R.noteSessionHeaders({ get: () => null })
out.reloj_sin_cabeceras_no_cambia = plano(R.getSessionClock())
let avisos = 0
const dejar = R.onSessionClock(() => (avisos += 1))
R.noteSessionClock(20000, 0)
dejar()
R.noteSessionClock(30000, 0)
out.oyentes = { avisos, absoluto_se_conserva: R.getSessionClock().absoluteAt }

// --- Lo que se dejó fuera al guardar jugadores ---
out.descartados = {
  nada: P.avisoDescartados(undefined),
  vacio: P.avisoDescartados({}),
  de_mas: P.avisoDescartados({ perfiles_de_mas: 3 }),
  todo: P.avisoDescartados({
    perfiles_de_mas: 1,
    fotos_demasiado_grandes: ['A', 'B'],
    ids_repetidos: ['ana'],
    ids_parecidos: ['Luis', 'luis'],
  }),
}

console.log(JSON.stringify(out))

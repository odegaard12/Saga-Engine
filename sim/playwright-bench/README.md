# Banco de pruebas con navegadores de verdad (Playwright)

El banco del panel de administración (`backend/app/runtime/simulation_bench.py`,
pestaña "Banco de pruebas 🧪") simula jugadores con `httpx` — peticiones HTTP
directas contra la app, sin abrir ningún navegador. Es rápido y prueba bien el
servidor, pero no dibuja React, no ejecuta el Service Worker, no sabe si dos
pantallas se ven entre sí. No sirve para la pregunta "¿ve un jugador al otro si
al otro se le corta la cobertura justo al llegar?".

Esto es la otra mitad: **N navegadores de verdad** (Chromium vía Playwright),
cada uno con su perfil de móvil (iPhone/Android) y su propia condición de red
—incluido un corte real, offline de verdad, por CDP—, jugando la misión real
igual que la jugaría alguien. Se pueden correr varios a la vez, cada uno viendo
solo lo que vería su pantalla — que es justo lo que el banco httpx no puede
comprobar.

## Cómo se autentica

No hay login por formulario. `POST /api/admin/simulation/browser-session/start`
(protegido con la sesión de admin, igual que el resto del panel) registra N
`SIM_XX` como perfiles conocidos y devuelve un token de sesión de jugador ya
firmado para cada uno — el mismo mecanismo que usa el banco httpx
(`create_player_session_token`), solo que aquí el token se mete como cookie
`saga_player_session` en un `BrowserContext` real
(`context.addCookies(...)`) en vez de en un cliente HTTP. `.../stop` deshace el
registro al terminar — los escenarios lo llaman siempre en un `finally`,
aunque el escenario falle a mitad.

## Instalación

```bash
cd sim/playwright-bench
npm install
npx playwright install chromium   # ~300 MB, una vez
```

## Uso

```bash
export SAGA_BASE_URL=http://127.0.0.1:8791   # o la Pi, con cuidado (ver abajo)
export SAGA_ADMIN_PASS=tu_contraseña_de_admin
export HEADLESS=0                             # opcional: ver el navegador de verdad
node run.mjs team-relay-cobertura
```

Las capturas de cada paso quedan en `out/` (con nombre `SIM_XX-NN-etapa.png`,
ignoradas por git — son evidencia de una corrida, no algo que versionar).

## Escenarios

- **`team-relay-cobertura`**: dos jugadores convergen en el primer nodo
  `team_relay` de la misión activa. Uno mantiene cobertura buena todo el
  rato; al otro se le corta -offline de verdad- 15 s justo al llegar. Se lee
  "Compañeros aquí: N / M" en CADA pantalla por separado -lo que ve el
  jugador, no lo que sabe el servidor- en tres momentos: al llegar, durante
  el corte, y tras recuperar cobertura. Si no hay ningún nodo `team_relay`
  en la misión activa, falla con un mensaje claro en vez de simular nada.
- **`solo-screenshot`**: un jugador, una captura. No comprueba nada, es para
  verificar algo puntual (colores, un icono, un layout) sin montar un
  escenario completo. Variables: `NOMBRE_SALIDA`, `ESPERA_MS`.
- **`diagnose-tiles`**: lee, cada 15 s, el texto real del DOM Y las
  peticiones de red reales -no una captura- mientras carga un jugador. Se
  construyó para comprobar la pantalla de precarga del mapa (ver más abajo)
  en vez de adivinar desde una imagen.

## La pantalla de precarga del mapa (corregido 03-set-2026)

Una nota anterior aquí decía que un servidor recién sembrado se quedaba
parado porque no tenía teselas reales que servir. **Era falso** -medido a
ojo, esperando solo 60 s-. Con `diagnose-tiles.mjs` se comprobó de verdad:
`/map-tiles/{z}/{x}/{y}.png` es un proxy en vivo a ArcGIS World Imagery
(`backend/app/routers/public.py`), funciona perfectamente (0 fallos en 300+
peticiones seguidas), y las teselas se descargan de verdad a buen ritmo.

El bug real es otro: el porcentaje que ve el jugador no refleja ese
progreso -llegó a marcar "3.9%" y luego volvió a "0%" mientras las
peticiones seguían subiendo sin parar-. Ver `docs/plan-de-mejora.md` §1.1
para el detalle; no arreglado todavía.

## Por qué Chromium para los dos perfiles, incluido "iPhone"

El throttling de red de verdad (`Network.emulateNetworkConditions` por CDP,
lo único que da un corte offline real, no solo lento) solo existe en
Chromium. Playwright también trae WebKit -Safari de verdad-, más fiel para
un iPhone, pero sin ese control de red. Para lo que importa ahora -cómo se
comporta bajo mala cobertura o un corte- Chromium con el viewport/UA de
iPhone (`devices['iPhone 14']` de Playwright) es el compromiso correcto.
Un modo "fidelidad de Safari" con WebKit, sin throttling, queda anotado como
mejora futura para bugs específicos de motor.

## Sobre la Raspberry Pi

Nada aquí se despliega en la Pi -es una herramienta de desarrollo, no un
servicio-. Se puede apuntar `SAGA_BASE_URL` a `https://sagagia.es` o a la IP
de la Pi para probar contra el servidor real, pero con cuidado: usa el mismo
prefijo `SIM_` que el banco httpx y el mismo guardián -no corre si hay
jugadores de verdad con la ruta empezada, salvo que se fuerce-, así que en
principio es seguro, pero un escenario que se quede colgado (Ctrl+C a medio
correr) puede dejar SIM_XX registrados: `POST
/api/admin/simulation/browser-session/stop` + el botón "Limpiar rastro" del
panel lo arregla.

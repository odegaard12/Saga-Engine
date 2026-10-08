# SAGA Engine — misiones de campo con GPS

<div align="center">

![SAGA Engine](frontend/public/saga-brand-final.svg)

**Un motor de misiones de campo geolocalizadas que se juega con el móvil, también sin cobertura.**
Nodos en el mapa, pegatinas QR físicas, minijuegos con los sensores del teléfono, mochila,
equipos y clasificación.

[![Version](https://img.shields.io/badge/version-5.52.0-34d399?style=flat-square)](CHANGELOG.md)
[![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)
[![Python](https://img.shields.io/badge/python-3.13-3776AB?style=flat-square&logo=python)](https://python.org)
[![React](https://img.shields.io/badge/react-18-61DAFB?style=flat-square&logo=react)](https://react.dev)
[![MapLibre](https://img.shields.io/badge/maplibre-6-396CB2?style=flat-square)](https://maplibre.org)
[![Docker](https://img.shields.io/badge/docker-ready-2496ED?style=flat-square&logo=docker)](Dockerfile)

</div>

---

## Qué es

SAGA convierte una ruta real en un tablero de juego. Quien organiza diseña la misión en un panel
web (nodos con coordenadas, radio, minijuego, objetos, historia) y los jugadores la recorren con el
móvil: una aplicación web instalable (PWA) que se baja **todo** lo necesario antes de salir y se
puede jugar entera en modo avión. Lo que pasa sin cobertura se guarda en una cola y se sube solo al
volver la red.

Pensado para gymkhanas, rutas guiadas, escape rooms al aire libre y actividades de grupo en el monte.

## Cómo se juega

1. **Entrar.** Cada jugador abre `/player/<su-nombre>` (o elige su ficha en `/`). Si la misión tiene
   contraseña (`MISSION_PASS`), se pide una vez.
2. **Pantalla de carga.** Antes de jugar se comprueba y se baja, con una barra por parte, lo que el
   móvil necesita sin cobertura: la **aplicación** (todos sus paquetes, los modelos 3D de los avatares
   y las fotos de perfil del grupo), la **misión** (nodos completos, fotos del mosaico, fotos de campo)
   y el **mapa** (teselas de imagen y relieve de la zona y la red de caminos). Si nada cambió, se entra
   en un segundo. Mientras se juega no se baja nada de fondo.
3. **Permisos.** Ubicación, movimiento (brújula y laberinto) y cámara (pegatinas QR), en un panel que
   explica para qué es cada uno. Se puede seguir sin ellos.
4. **Ruta.** El mapa 3D marca el siguiente nodo y la guía por caminos. Al entrar en su radio se abre el
   reto: llegar, escanear la pegatina, un minijuego o una pregunta.
5. **Respaldo.** Todo nodo acepta un código de emergencia (con penalización de tiempo) para que nadie
   se quede bloqueado si falla el GPS, la cámara o un sensor.
6. **Final.** Pantalla de misión completada y clasificación del grupo; sólo cuenta el tiempo dentro de
   cada nodo, no el camino entre ellos.

### Minijuegos

Hay **familias** (el motor de cada tipo de juego, en `frontend/src/player/minigames/families/`) y
**juegos** (preajustes de una familia que se eligen en el panel). El registro común de servidor y
cliente es [`shared/game_registry.json`](shared/game_registry.json).

| Juego | Qué pide | Sensores |
|---|---|---|
| Punto de control | Llegar al sitio | GPS |
| Mapa mudo | Encontrar el punto con una pista y un círculo difuso | GPS |
| Cuenta las señales | Contar algo del lugar (pregunta distinta por jugador) | GPS |
| Objeto QR / Llave QR / Pista QR / Bonus oculto | Escanear una pegatina física | Cámara |
| Matriz de circuitos | Reparar una ruta de energía memorizando el patrón | — |
| Simón dice | Repetir una secuencia | — |
| Mosaico del lugar | Recomponer una foto del sitio y responder qué se ve | — |
| Laberinto de equilibrio | Guiar una bola inclinando el móvil | Acelerómetro |
| Cargar antena / Pulso de hierro | Agitar o mantener el pulso | Acelerómetro |
| Caza de rumbo / Rumbo doble | Apuntar con la brújula a uno o dos rumbos | Brújula |
| Caza-Señales | Reflejos: tocar las chispas buenas | — |
| Desafío de audio | Soplar o hacer ruido | Micrófono |
| Trampa de palabras | Rondas contrarreloj con opciones casi idénticas | — |
| Relevo de equipo | Varios jugadores a la vez | GPS |

Cada juego tiene topes en el panel para no guardar una configuración injugable, y los que usan un
sensor ofrecen un modo táctil con penalización si el sensor falta o se deniega. Para añadir uno nuevo,
ver [`docs/como-anadir-un-minijuego.md`](docs/como-anadir-un-minijuego.md).

### Más piezas del juego

- **Mochila y mesa de trabajo:** objetos que se ganan, recetas que los combinan y nodos que piden un
  objeto para abrirse.
- **Fotos de campo:** el jugador hace fotos geolocalizadas que el grupo ve en el mapa; cada uno puede
  borrar las suyas, y el panel puede purgarlas todas.
- **Avatares 3D:** cada jugador elige personaje, ropa, objetos y gestos, y el grupo se ve en el mapa.
- **Idiomas:** interfaz en gallego, castellano e inglés.
- **Panel de administración** (`/admin-react`): constructor de misión sobre mapa, editores de cada
  minijuego, jugadores y equipos, tarjetas QR imprimibles, estado de preparación offline, registro de
  la partida, tiempos y revisión antes de dar premios.

---

## Arquitectura

```
.
├── main.py                  # Aplicación FastAPI (rutas aún no movidas y pegamento)
├── backend/app/
│   ├── routers/             # admin, game (avance, latido), public (config, teselas,
│   │                        #   red de caminos, sw), field_proofs, assets, shell
│   ├── runtime/             # Motor: nodos, minijuegos, misión proyectada por jugador,
│   │                        #   antitrampas, tiempos, teselas, red de caminos…
│   ├── storage/             # SQLite (por defecto) y JSON heredado
│   └── security/            # Sesiones, IP del cliente detrás de proxy
├── shared/game_registry.json
├── frontend/                # React + TypeScript + Vite
│   ├── public/sw.js         # Service worker
│   └── src/
│       ├── login/           # Elección de jugador
│       ├── player/          # Jugador: mapa, HUD, hojas, minijuegos, offline, avatares
│       ├── admin/           # Panel
│       └── shared/          # API, tipos, identidad
├── scripts/                 # Guardas del repo, avatares, banco de simulación
├── sim/playwright-bench/    # Banco con navegador real (opcional)
└── tests/                   # pytest; los tests de JS (tests/js) se lanzan desde pytest
```

**Cliente.** React 18, TypeScript, Vite y zustand. El mapa del jugador es **MapLibre GL** en 3D con
relieve; los avatares y los nodos 3D son **three.js**. El lector de pegatinas es jsQR dentro de un Web
Worker. El panel usa Leaflet.

**Servidor.** FastAPI con SQLite (`SAGA_STORAGE_BACKEND=sqlite`, por defecto). El servidor es quien
decide: valida cada avance, proyecta la misión para cada jugador (sin respuestas en claro: van con
hash y sal), lleva los tiempos y anota sospechas para revisarlas. Las teselas del mapa y el relieve
pasan por un proxy propio con caché en disco (mismo origen, para que el service worker pueda
guardarlas); la red de caminos se construye en el panel a partir de un extracto de OpenStreetMap.

**Offline.** El build escribe `player-precache.json` con todos los paquetes que puede necesitar el
jugador (y nada del panel). La pantalla de carga baja esa lista, la misión y el mapa a Cache Storage e
IndexedDB, y comprueba el resultado; el service worker (`frontend/public/sw.js`) sirve después todo eso
sin red. Los avances, fotos y posiciones hechos sin cobertura van a una cola que se sube en orden al
volver la red (y con Background Sync en Chromium aunque la app esté cerrada). Una versión nueva se
detecta, se baja en la pantalla de carga y se aplica cuando no hay ningún reto abierto.

**Avatares 3D con activos privados.** Los modelos y animaciones de personajes **no están en este
repositorio ni en la imagen Docker**: su licencia no permite redistribuirlos. Viven fuera
(`assets_privados/`, ignorado por git), se preparan con `scripts/hornear_avatares_mixamo.py` y
`frontend/scripts/preparar-avatares.mjs`, y el servidor los sirve desde la carpeta que indique
`SAGA_AVATAR_DIR` (o un volumen montado en `/app/avatares`). En el repo sólo está el manifiesto con sus
nombres. Sin ellos la aplicación funciona igual: cada jugador sale con su retrato redondo.

---

## Arrancar en local

Requisitos: Python 3.13 y Node.js 20 o superior.

```bash
pip install -r requirements.txt -r requirements-dev.txt
cp .env.example .env          # referencia de variables (el servidor lee el entorno)

# Servidor (sirve el build de frontend/dist y la API)
ADMIN_PASS=una-clave SAGA_DATA_DIR=./data uvicorn main:app --host 127.0.0.1 --port 8097

# Frontend en desarrollo, con proxy a ese servidor
cd frontend
npm ci
npm run dev                   # http://localhost:5173  (SAGA_DEV_BACKEND_URL cambia el destino)
npm run build                 # tsc -b + vite build → frontend/dist
```

Con el servidor en marcha: el panel está en `/admin-react` y el jugador en `/player/<nombre>`. Para
probar sin moverse, el modo prueba del jugador (Herramientas → Modo prueba GPS) deja colocar la
posición tocando el mapa.

## Tests

```bash
python -m pytest -q                       # rápido: en paralelo y sin las marcadas `slow`
python -m pytest -q -m ""                 # completo, como en la integración continua
python -m pytest -q -n0 tests/test_x.py   # uno solo, sin paralelo

cd frontend
npx tsc -b                                # tipos
npx eslint src                            # lint (0 errores)
npm audit                                 # dependencias

python scripts/check_repo_privacy.py      # que no se cuele nada privado en el repo público
```

Los tests de la lógica del móvil (`tests/js/*.cjs`) ejecutan los módulos TypeScript tal cual en un
navegador simulado; necesitan Node y `frontend/node_modules`, y si faltan se saltan.
`sim/playwright-bench` es un banco opcional con navegadores de verdad (ver su README).

---

## Despliegue

Una sola imagen Docker (Python 3.13 con el frontend ya compilado dentro). Funciona en un servidor
Linux cualquiera, también arm64 (Raspberry Pi 4 o superior).

```bash
docker build -t saga_engine:X.Y.Z .
docker run -d --name saga_engine_app --restart unless-stopped \
  -p 8096:5000 \
  --env-file .env \
  -v /ruta/a/datos:/app/data \
  -v /ruta/a/avatares:/app/avatares:ro \
  saga_engine:X.Y.Z
```

- Los datos (misión, partida, fotos, cachés de teselas) viven en el volumen de `/app/data`.
- La línea de avatares es opcional (ver «Avatares 3D con activos privados»).
- Detrás de un proxy o túnel: `TRUST_PROXY_HEADERS=1` y `TRUSTED_PROXY_IPS`/`TRUSTED_PROXY_CIDRS`; si
  no, los bloqueos por intentos fallidos cuentan la IP del proxy.
- El service worker exige HTTPS (o `localhost`) para el modo sin cobertura.

### Variables de entorno

| Variable | Para qué | Por defecto |
|---|---|---|
| `SECRET_KEY` | Firma de las sesiones de jugador y panel (recomendada) | una generada y guardada en la carpeta de datos |
| `ADMIN_PASS` | Contraseña inicial del panel; después se cambia desde el panel | — |
| `ALLOW_DEFAULT_ADMIN` | `1` permite el respaldo de desarrollo sin `ADMIN_PASS` | `0` |
| `MISSION_PASS` | Contraseña de misión compartida por el grupo; vacía = sin puerta | vacía |
| `SAGA_AVATARS_REQUIRE_SESSION` | `1` exige sesión para ver las fotos de perfil aunque no haya `MISSION_PASS` | `0` |
| `SAGA_DATA_DIR` | Carpeta de datos | `./data` |
| `SAGA_STORAGE_BACKEND` | `sqlite` o `json` (heredado) | `sqlite` |
| `SAGA_SQLITE_DB` | Ruta de la base SQLite | `<datos>/saga.sqlite3` |
| `SAGA_AVATAR_DIR` | Carpeta de los activos de avatares | la primera que exista: `<app>/avatares`, `<datos>/avatares`, `assets_privados/avatares` |
| `TRUST_PROXY_HEADERS` | `1` si hay proxy o túnel delante | `0` |
| `TRUSTED_PROXY_IPS` / `TRUSTED_PROXY_CIDRS` | Proxies de confianza | vacías |
| `SAGA_CORS_ALLOW_ORIGINS` | Orígenes CORS permitidos | vacía |
| `SAGA_ENABLE_API_DOCS` | `1` publica `/docs` de FastAPI | `0` |

Sin `MISSION_PASS` ni `SAGA_AVATARS_REQUIRE_SESSION=1`, la lista de jugadores y sus fotos de perfil son
públicas (la pantalla de entrada las enseña antes de que nadie tenga sesión). En una misión con menores
o datos reales conviene poner una de las dos.

---

## Licencias de terceros

El código de SAGA es MIT ([LICENSE](LICENSE)). Usa, entre otras, estas piezas de terceros:

- **Librerías:** React y react-dom (MIT), MapLibre GL JS (BSD-3-Clause), three.js (MIT), Leaflet
  (BSD-2-Clause), jsQR (Apache-2.0), qrcode.react (ISC), JSZip (MIT o GPLv3, a elección),
  meshoptimizer (MIT), zustand (MIT), TanStack Query (MIT); FastAPI, Starlette, Pydantic y Uvicorn (MIT
  / BSD-3-Clause), httpx (BSD-3-Clause), Pillow (licencia HPND/MIT-CMU), osmium (BSD-2-Clause).
- **Datos de mapa:** ortofoto PNOA © IGN / Xunta y relieve MDT05/MDT25 © IGN (CC BY 4.0), edificios ©
  Dirección General del Catastro (INSPIRE, uso libre citando la fuente); de respaldo, imagen aérea de Esri
  World Imagery (sujeta a sus condiciones de uso) y relieve de los *Terrain Tiles* de AWS Open Data (Mapzen;
  incluye fuentes como SRTM y otras); red de caminos y mapas del panel a partir de © colaboradores de
  OpenStreetMap (ODbL).
- **Personajes 3D:** activos de terceros con licencia propia; **no se incluyen** ni se redistribuyen
  (ver «Avatares 3D con activos privados»).

---

## Más documentación

- [CHANGELOG.md](CHANGELOG.md): qué cambia en cada versión y por qué.
- [SECURITY.md](SECURITY.md): cómo informar de un fallo de seguridad.
- [`docs/`](docs/): arquitectura, minijuegos, operación y seguridad.

<div align="center">

Hecho para misiones de campo reales, con o sin cobertura.

</div>

## Créditos del mapa

Ortofoto PNOA © IGN / Xunta (CC BY 4.0); relieve MDT05 © IGN (CC BY 4.0); edificios © Dirección General del Catastro;
imágenes © Esri; relieve: Terrain Tiles (Mapzen, AWS Open Data). Estos créditos también salen, discretos, al pie de
la pantalla de carga de la aplicación (es/gl/en); el mapa no lleva botón de atribución.

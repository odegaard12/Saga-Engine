# Security Policy

## Reporting a Vulnerability

If you discover a security issue affecting this project, please do not publish full exploit details immediately.

Please report it privately to the maintainer first so the issue can be reviewed and fixed before public disclosure.

Recommended report content:

- affected version / commit
- clear description of the issue
- reproduction steps
- expected impact
- suggested fix if available

## Scope

The most security-sensitive areas of this project are:

- `/admin` authentication and password-reset flows (see `docs/security/admin-auth.md`: lockouts per device and per IP, sliding session, `ADMIN_RESET`)
- public API payload exposure
- runtime node normalization / validation
- deployment and environment configuration


## What the server enforces (and what it does not)

Qué comprueba el servidor por su cuenta y qué queda en manos del móvil del jugador. Conviene saberlo antes de dar un
premio por una partida.

Se comprueba siempre en el servidor:

- La clave de misión, cuando hay una puesta (mínimo 10 caracteres): sin su cookie, toda `/api/*` responde 401 y las
  teselas del mapa (`/map-tiles`, `/dem-tiles`, `GET /api/teselas/lote/...`) no dicen dónde está la ruta (la misma
  tesela vacía en todas partes, o 401).
- La sesión de cada jugador (firmada con una clave aleatoria del servidor, independiente de la contraseña del panel) y,
  si están puestos, los PIN.
- La sesión del panel en cada ruta de `/api/admin`, con bloqueo por intentos (ver `docs/security/admin-auth.md`).
- El orden de los nodos, los códigos de cada nodo, el horario de la misión, el ritmo de peticiones y el tamaño de los
  cuerpos.
- El tipo real de cada imagen subida, y que se guarda sin metadatos (EXIF/GPS).

NO se exige por defecto:

- **Que el jugador esté físicamente en el nodo.** La proximidad la calcula el servidor con las posiciones que manda el
  móvil y, por defecto, sólo ANOTA la sospecha «lejos del nodo» para que la revise el organizador: el avance se acepta.
  Es deliberado, para no dejar a nadie atascado en el monte con un GPS malo. Para que el servidor RECHACE esos avances
  hay que encender `require_server_proximity` (apagado por defecto): en el panel, Ajustes → «Rechazar avances lejos
  del nodo (con GPS real)», o `"require_server_proximity": true` en `config.json`. Aun encendido sólo se rechaza cuando
  hay al menos una muestra de GPS con precisión fiable (≤ 100 m) y todas quedan fuera; el modo prueba y el rescate sin
  GPS no se bloquean nunca (ver `backend/app/runtime/proximidad.py`).
- La posición la declara el móvil: un GPS simulado en el propio teléfono no se puede distinguir desde el servidor. El
  resto del antitrampas (saltos imposibles, tiempos, salidas de la app) anota sospechas, no bloquea.
- Los minijuegos se juegan en el móvil: el servidor revisa la evidencia que este manda (respuestas, rondas, GPS, QR)
  contra la configuración del nodo y anota lo que no cuadra, pero no ve la partida.

## Reporting guidance

No incluyas secretos, contraseñas, tokens, datos reales de misión, coordenadas privadas ni datos personales en issues públicos. Para reportes sensibles, contacta al mantenedor por un canal privado antes de publicar detalles técnicos.

## Public repository guard checklist

Before opening or merging a public PR, verify that it does not include:

- real admin passwords, API tokens, cookies or secrets
- `.env` files or local override files
- real live mission data, private coordinates or private backups
- `admin_auth.json`, `gamestate.json` or `positions.json`
- local IP topology beyond generic development examples
- personal emails, phone numbers or private participant data
- generated local backup folders such as `_backups/`

Public examples should stay generic. Real runtime data should live outside the repository, preferably through `SAGA_DATA_DIR`.


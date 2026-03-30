# 🧭 SAGA Engine

**SAGA Engine** is a self-hosted engine for building **geolocated games**, **real-world interactive routes**, and **node-based experiences**.

It is designed for organizers who want full control over:

- player flow
- node progression
- admin-managed content
- organizer fallback recovery with answer / rune
- self-hosted deployment

---

## ✨ Current status

SAGA is already usable as a real engine for:

- outdoor routes
- ARG-style experiences
- tourism / exploration flows
- puzzle checkpoints
- organizer-managed recovery flows

The project keeps a **simple public editable schema** while internally evolving toward a **cleaner runtime node model** with stronger validation and safer player payloads.

---

## 🚀 What SAGA does

A SAGA experience is built around **nodes**.

A node can represent:

- 📍 a real-world GPS point
- 🧩 a challenge location
- 🔐 a puzzle checkpoint
- 📖 a narrative stop
- 🛠️ a manual recovery / organizer override point

Players move through nodes in order.  
At each node, the engine can combine:

- map location
- activation radius
- mini-game
- narrative / instructions
- organizer fallback answer / rune
- per-node entry rules
- per-node GPS / hint / locked messages

---

## ✅ Current capabilities

| Area | Status |
|---|---|
| Player selection flow | ✅ Implemented |
| Player game screen with map | ✅ Implemented |
| Sequential node progression | ✅ Implemented |
| GPS-based access | ✅ Implemented |
| Fallback progression via answer / rune | ✅ Implemented |
| Mini-game progression | ✅ Implemented |
| Persistent admin authentication | ✅ Implemented |
| Forced admin password change flow | ✅ Implemented |
| Admin UI language selection (`es` / `en`) | ✅ Implemented |
| Runtime node normalization / validation | ✅ Implemented |
| Sanitized player payloads | ✅ Implemented |

---

## 🧱 Main routes

| Route | Purpose |
|---|---|
| `/` | Player selection |
| `/player/{PLAYER_NAME}` | Player game UI |
| `/admin` | Admin panel |
| `/api/config` | Public config payload |
| `/api/game/{user}` | Sanitized player game payload |
| `/api/admin/stages` | Admin stage data |
| `/api/admin/save-config` | Save global config |
| `/api/admin/save` | Save stages |

---

## 👤 Player experience

The player UI currently includes:

- 🗺️ interactive map
- 🎯 active node
- 📏 distance to target
- 🔤 answer / rune input
- 🧪 debug mode
- 🕹️ mini-game modal
- 📡 GPS warning UI
- 🏷️ persistent small GPS badge
- 💡 per-node hint support
- ⚠️ per-node GPS unavailable messaging

---

## 🛠️ Admin panel

The admin panel currently manages:

| Global config | Nodes |
|---|---|
| site title | node list |
| admin texts | node coordinates |
| admin UI language | node radius |
| story and prologue text | node type |
| players | node content |
| map center and zoom | node config |
|  | fallback answer / rune |
|  | node entry mode |
|  | node proximity / debug / manual fallback flags |
|  | node hint / GPS unavailable / locked messages |

> The admin still edits a **simple public stage schema**.  
> The backend internally normalizes that schema into a richer runtime model.

---

## 🔄 Gameplay flow

### Normal progression

1. Player enters the game
2. Current state is loaded
3. Active node is resolved
4. Map and markers are rendered
5. GPS / entry conditions are evaluated
6. Player enters the node
7. Mini-game or interaction is completed
8. Progress is saved
9. Next node becomes active

### Organizer fallback progression

Fallback progression is an **official engine feature**.

Useful when:

- browser geolocation is blocked
- GPS fails in the field
- the player cannot physically unlock the node
- a mini-game becomes unusable
- the organizer needs to manually recover a team

Current progression backend accepts success through:

- `OK` mini-game success token
- `answer`
- `rune`

---

## 📡 GPS / secure context notes

Real GPS depends on browser secure-context rules.

### Recommended

- HTTPS deployment
- reverse proxy / tunnel / secure domain
- real phone/browser testing over HTTPS

### Local development note

Plain HTTP over LAN IP may block geolocation even if the map itself works.

Typical symptom:

- map loads
- node markers load
- player screen opens
- browser never grants geolocation
- distance never updates

For that reason SAGA supports:

- visible GPS warning UI
- persistent small GPS badge
- DEBUG mode for local testing
- fallback progression using answer / rune

---

## 🧪 Debug mode

DEBUG is intended for:

- local UI testing
- route flow testing without real GPS
- node access simulation
- mini-game testing
- organizer recovery checks

With the current runtime node model, a node can explicitly allow or deny debug bypass behavior.

---

## 🔐 Admin authentication

Admin authentication is persistent.

It is **no longer** only a raw environment-variable comparison on every request.

### Current behavior

- admin auth is stored in `data/admin_auth.json`
- bootstrap password can be initialized with `ADMIN_PASS`
- insecure / temporary passwords can trigger forced password change
- admin can be blocked from the panel until password is changed
- terminal reset is supported with `ADMIN_RESET=1`

### Important

Do **not** commit:

- `.env`
- `data/admin_auth.json`

---

## 🔑 Forced password change flow

If the current admin password is temporary or weak, the admin UI can require a password change before access is granted.

Typical flow:

1. bootstrap or reset from terminal
2. login with temporary password
3. UI shows password-change screen
4. admin cannot continue until a stronger password is saved

This is important for recovery workflows where terminal reset is allowed but the final deployed system should not remain exposed.

---

## 🐳 Docker bootstrap / reset

### Normal bootstrap

```bash
docker rm -f saga_engine_app
docker run -d \
  --name saga_engine_app \
  -p 8096:5000 \
  -e ADMIN_PASS='YOUR_PASSWORD' \
  -v ~/saga_engine:/app \
  --restart unless-stopped \
  saga_engine:latest
```

### Forced reset

```bash
docker rm -f saga_engine_app
docker run -d \
  --name saga_engine_app \
  -p 8096:5000 \
  -e ADMIN_PASS='TEMPORARY_PASSWORD' \
  -e ADMIN_RESET='1' \
  -v ~/saga_engine:/app \
  --restart unless-stopped \
  saga_engine:latest
```

### Local development fallback only

```env
ALLOW_DEFAULT_ADMIN=1
```

Use this **only** for local development, never for real deployments.

---

## ⚙️ Environment

Typical `.env` values:

```env
ADMIN_PASS=your_password_here
ALLOW_DEFAULT_ADMIN=0
ADMIN_RESET=0
```

### Notes

- `ADMIN_PASS` is required for normal use
- `ALLOW_DEFAULT_ADMIN=1` is development only
- `ADMIN_RESET=1` is for deliberate password recovery / reset
- do not commit `.env`

---

## 🎮 Current mini-games / interaction types

Currently supported:

| Type |
|---|
| `digital_tuner` |
| `circuit_hack` |
| `cryptex` |
| `radio_azimuth` |
| `gyro_storm` |
| `simon_says` |
| `switchboard` |
| `compass_blow` |

Frontend mini-game logic mainly lives in:

- `static/minigames_final.js`

Player game flow logic also lives in:

- `templates/game.html`

---

## 🧩 Data model

### Global config

Stored in:

- `config.json`

Typical fields:

| Field | Purpose |
|---|---|
| `site_name` | Public site title |
| `admin_title` | Admin login / header title |
| `admin_subtitle` | Admin subtitle |
| `story_title` | Login subtitle |
| `story_text` | Login story text |
| `map_center` | Default map center |
| `map_zoom` | Default map zoom |
| `players` | Available player profiles |
| `ui_lang` | Admin UI language (`es` / `en`) |
| `data_dir` | Data folder |
| `prologue_title` | Prologue title |
| `prologue_subtitle` | Prologue subtitle |
| `prologue_body` | Prologue body |

---

### Public stage schema (compatible / editable today)

Stored in:

- `data/stages.json`

Current editable schema still supports simple node objects like:

```json
{
  "id": 0,
  "title": "NODE TITLE",
  "lat": 42.0000,
  "lon": -8.0000,
  "radius": 50,
  "type": "circuit_hack",
  "content": "NODE TEXT",
  "config": {},
  "answer": "",
  "rune": ""
}
```

---

### Optional legacy-compatible fields already supported by runtime

These fields can also be added today and are already interpreted by the runtime:

```json
{
  "hint": "Fallback hint shown inside the node",
  "gps_unavailable_message": "Custom message when GPS is unavailable",
  "locked_message": "Custom message for locked / distance state",
  "require_proximity": true,
  "allow_debug_bypass": true,
  "allow_manual_fallback_without_gps": true,
  "entry_mode": "gps"
}
```

Supported `entry_mode` values:

| Value | Meaning |
|---|---|
| `gps` | Node is expected to use GPS / distance rules |
| `free` | Node can be entered without proximity requirement |

---

## 📝 Current note

The admin panel now includes **basic visual editing** for advanced entry/message fields such as:

- `entry_mode`
- `require_proximity`
- `allow_debug_bypass`
- `allow_manual_fallback_without_gps`
- `hint`
- `gps_unavailable_message`
- `locked_message`

The public schema remains compatible and simple, while the backend runtime continues to normalize nodes internally into the richer runtime model.

---

## 🧠 Runtime node model (internal)

Internally, the backend normalizes public stage nodes into a richer runtime structure.

Conceptually, the engine works with sections like:

- `presentation`
- `location`
- `entry`
- `interaction`
- `success`
- `messages`
- `debug`

This internal runtime model allows:

- safer evolution without breaking existing stage files
- explicit entry rules
- explicit message handling
- cleaner future admin tooling
- stage validation before saving

---

## 🧪 Runtime behavior currently included

- stage normalization from public JSON
- stage validation before `/api/admin/save`
- per-node entry rule interpretation
- per-node message interpretation
- sanitized player payload projection

---

## 🛡️ Sanitized player payload

Players no longer consume raw admin stage data.

Current player flow uses:

- `GET /api/game/{user}`

The player payload includes only what the player needs:

- level / finished state
- map-visible stage info
- current active node runtime info
- current node entry rules
- current node messages

It does **not** expose fallback secrets such as:

- `answer`
- `rune`

This is a major improvement over directly shipping raw stage definitions to the player client.

---

## ✅ Stage validation

When saving stages through admin, the backend validates node data before writing it.

Validation currently checks things such as:

- title is present
- node type is supported
- config is an object
- entry mode is valid
- GPS nodes with proximity rules have valid lat/lon/radius
- success condition structure is valid

This reduces accidental broken saves and prepares the project for richer admin tooling.

---

## 🗂️ Current project structure

```text
main.py                      FastAPI backend
config.json                  Global configuration
.env.example                 Example environment values
Dockerfile                   Container build
data/
  stages.json                Node definitions
  gamestate.json             Player progression
  positions.json             Optional player positions
  admin_auth.json            Persistent admin auth (local only; do not commit)
templates/
  login.html                 Player selection
  game.html                  Player UI
  admin.html                 Admin panel
static/
  minigames_final.js         Frontend mini-game logic
```

---

## ▶️ Local run (Python)

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install fastapi uvicorn jinja2
export $(grep -v '^#' .env | xargs)
python -m uvicorn main:app --host 0.0.0.0 --port 8097
```

---

## 🐳 Docker run

Example bind-mount deployment:

```bash
docker run -d \
  --name saga_engine_app \
  -p 8096:5000 \
  -e ADMIN_PASS='your_password_here' \
  -v ~/saga_engine:/app \
  --restart unless-stopped \
  saga_engine:latest
```

If building locally first:

```bash
docker build -t saga_engine .
```

---

## 🌐 Remote access

For real player use, **HTTPS is strongly recommended**.

You can expose SAGA using:

- reverse proxy
- tunnel
- VPN
- secure domain
- other secure remote access methods

Always protect `/admin`.

---

## 🔒 Security notes

Before publishing or sharing a deployment:

- do not commit `.env`
- do not commit `data/admin_auth.json`
- do not expose `/admin` without protection
- do not rely on default or temporary passwords
- do not publish private player data
- use demo content in public repositories if needed

For real deployments:

- always set `ADMIN_PASS`
- keep `ALLOW_DEFAULT_ADMIN=0`
- use `ADMIN_RESET=1` only intentionally
- rotate temporary credentials immediately
- verify HTTPS for real player tests

---

## 🧭 Use cases

SAGA can be used for:

- outdoor games
- ARG experiences
- geolocated routes
- tourism experiences
- puzzle routes
- educational activities
- team challenges
- organizer-managed recovery flows

---

## 🔮 Current development direction

The engine is already usable, but active development is focused on:

- richer node logic
- better admin tools
- more mini-games / interaction types
- cleaner runtime / schema evolution
- improved player UX

Current architecture direction is:

- keep public stage schema compatible
- evolve runtime node model internally
- expose safer player payloads
- move toward cleaner admin editing of richer node rules

---

## 📄 License

**MIT recommended.**

If you want the repository to be fully clear for public reuse, add a `LICENSE` file.

---

## 🙌 About

Self-hosted engine for geolocated games and real-world interactive routes.

# 🧭 SAGA Engine

**SAGA Engine** is a self-hosted engine for **geolocated games**, **real-world routes**, and **node-based interactive experiences**.

It is designed for organizers who want full control over:

- player flow
- node progression
- admin-managed content
- official fallback recovery via `answer` / `rune`
- self-hosted deployment

---

## ✨ Current Status

SAGA is currently usable for real route-based and checkpoint-based experiences.

| Area | Status |
|---|---|
| Player selection flow | ✅ Implemented |
| Player map / game screen | ✅ Implemented |
| Sequential node progression | ✅ Implemented |
| GPS-based access | ✅ Implemented |
| Fallback progression via `answer` / `rune` | ✅ Implemented |
| Mini-game progression | ✅ Implemented |
| Persistent admin authentication | ✅ Implemented |
| Forced admin password change flow | ✅ Implemented |
| Admin login lockout / temporary rate limit | ✅ Implemented |
| Sanitized player payloads | ✅ Implemented |
| Runtime node normalization / validation | ✅ Implemented |
| Player profiles / team-ready sessions | ✅ Implemented |
| Mission Control | ✅ Implemented |
| Admin profile recovery actions | ✅ Implemented |
| Compact admin node list | ✅ Implemented |
| Improved Node editor reachability | ✅ Implemented |
| Player theme selector (`classic` / `glass`) | ✅ Implemented |
| Visible English-first UI | ✅ Implemented |
| External live data directory via `SAGA_DATA_DIR` | ✅ Implemented |

---

## 🌍 Visible UI Status

Current visible UI is **English-first**.

> Notes:
>
> - visible player/admin copy is currently **English-only**
> - `ui_lang` still exists internally for compatibility
> - the admin UI currently exposes **English only**
> - available player themes:
>   - `classic`
>   - `glass`

---

## 🚀 What SAGA Does

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
- organizer fallback `answer` / `rune`
- per-node entry rules
- per-node GPS / hint / locked messages

---

## 🧱 Main Routes

| Route | Purpose |
|---|---|
| `/` | Player selection |
| `/player/{PLAYER_NAME}` | Player game UI |
| `/admin` | Admin panel |
| `/api/config` | Public config payload |
| `/api/game/{user}` | Sanitized player payload |
| `/api/admin/login` | Admin login |
| `/api/admin/change-password` | Admin password change flow |
| `/api/admin/stages` | Admin stage data |
| `/api/admin/save-config` | Save global config |
| `/api/admin/save` | Save stages |
| `/api/admin/mission-status` | Mission Control live status |
| `/api/admin/profile-action` | Admin profile recovery actions |

---

## 👤 Player Experience

The current player UI includes:

- 🗺️ map
- 🎯 active node
- 📏 distance to target
- 🔤 `answer` / `rune` input
- 🧪 debug mode
- 🕹️ mini-game modal
- 📡 GPS warning UI
- 🏷️ persistent small GPS badge
- 💡 per-node hint support
- ⚠️ per-node GPS unavailable messaging
- 🎨 `classic` / `glass` player theme

---

## 🛠️ Admin Panel

The admin panel currently includes:

### Global config
- site title
- admin title / subtitle
- login subtitle
- story text
- prologue title / subtitle / body
- map center / zoom
- players
- player theme

### Mission Control
- compact per-profile live status
- live / stale / offline visibility
- current level / stage visibility
- GPS / last seen / position visibility
- organizer recovery actions:
  - reset profile
  - level -1
  - level +1
  - mark finished

### Nodes
- compact node list
- node coordinates
- node radius
- node type
- node content
- node config
- fallback `answer` / `rune`
- entry mode / flags
- hint / GPS unavailable / locked messages
- quick reordering
- improved node editor usability
- reachable save / delete actions

### Admin auth / safety
- persistent admin auth file
- forced password change flow
- temporary login lockout on repeated failures

---

## 🎮 Supported Mini-Games

| Type | Status |
|---|---|
| `digital_tuner` | ✅ |
| `circuit_hack` | ✅ |
| `cryptex` | ✅ |
| `radio_azimuth` | ✅ |
| `gyro_storm` | ✅ |
| `simon_says` | ✅ |
| `switchboard` | ✅ |
| `compass_blow` | ✅ |

---

## 🧠 Runtime Model

The public editable schema remains simple, while the backend internally normalizes nodes into a richer runtime structure with sections such as:

- `presentation`
- `location`
- `entry`
- `interaction`
- `success`
- `messages`
- `debug`

### ✅ This allows

- safer schema evolution
- per-node entry rules
- per-node messages
- runtime validation before save
- safer player payload projection

---

## 🛡️ Sanitized Player Payload

Players do **not** consume raw admin stage data directly.

Current player flow uses:

- `GET /api/game/{user}`

The player payload includes only what the player needs, such as:

- current user / display name
- session mode / profile context
- level / finished state
- map-visible stage info
- current active node runtime info
- current node entry rules
- current node messages

It does **not** expose fallback secrets such as:

- `answer`
- `rune`

---

## 🧪 Stage Validation

When saving stages through admin, the backend validates node data before writing it.

Validation currently checks things such as:

- title is present
- node type is supported
- config is an object
- entry mode is valid
- GPS nodes with proximity rules have valid lat/lon/radius
- success condition structure is valid

---

## 🧩 Data Model

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
| `players` | Available player profiles or simple player entries |
| `ui_lang` | Internal compatibility field |
| `player_theme` | Player UI theme (`classic` / `glass`) |
| `prologue_title` | Prologue title |
| `prologue_subtitle` | Prologue subtitle |
| `prologue_body` | Prologue body |

> `players` can still be kept simple, but the runtime also supports richer profile / team-ready normalization internally.

### Public stage schema

Default/demo stage schema lives in:

- `data/stages.json`

Production live stage data can instead live in the external directory selected through `SAGA_DATA_DIR`.

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

Optional legacy-compatible fields already supported by runtime:

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

### Supported `entry_mode` values

| Value | Meaning |
|---|---|
| `gps` | Node is expected to use GPS / distance rules |
| `free` | Node can be entered without proximity requirement |

---

## 🐳 Deployment

### Recommended production model

Current production uses:

- repo bind mount for app code
- external live data directory via `SAGA_DATA_DIR`

| Item | Value |
|---|---|
| Repo | `~/saga_engine` |
| Live data dir | `~/saga_engine_data` |
| Container | `saga_engine_app` |
| Port | `8096 -> 5000` |

### Production deployment example

```bash
docker build -t saga_engine:latest ~/saga_engine

docker rm -f saga_engine_app || true

docker run -d \
  --name saga_engine_app \
  -p 8096:5000 \
  -e ADMIN_PASS='YOUR_PASSWORD' \
  -e SAGA_DATA_DIR=/app_data \
  -v ~/saga_engine:/app \
  -v ~/saga_engine_data:/app_data \
  --restart unless-stopped \
  saga_engine:latest
```

### Smoke check

```bash
curl -sS -o /tmp/saga_root.html  -w "GET / => HTTP %{http_code}\n" http://127.0.0.1:8096/
curl -sS -o /tmp/saga_admin.html -w "GET /admin => HTTP %{http_code}\n" http://127.0.0.1:8096/admin
curl -sS -o /tmp/saga_cfg.json   -w "GET /api/config => HTTP %{http_code}\n" http://127.0.0.1:8096/api/config
docker logs --since=2m saga_engine_app 2>&1 | tail -n 40
```

---

## ▶️ Local Development

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install fastapi uvicorn jinja2
python -m uvicorn main:app --host 0.0.0.0 --port 8097
```

---

## 📁 Project Structure

| Path | Purpose |
|---|---|
| `main.py` | FastAPI backend |
| `templates/login.html` | Player selection |
| `templates/game.html` | Player UI |
| `templates/admin.html` | Admin panel |
| `static/minigames_final.js` | Frontend mini-game logic |
| `data/` | Demo / default data files kept in-repo |

---

## 🔒 Security Notes

Before public or shared deployments:

- do not commit `.env`
- do not commit live runtime data
- do not expose `/admin` without protection
- do not rely on temporary passwords
- prefer HTTPS for real player usage

Live runtime data should stay outside the repo-mounted code directory.

Typical live files include:

- `stages.json`
- `gamestate.json`
- `positions.json`
- `admin_auth.json`

---

## 🧭 Use Cases

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

## 🔮 Development Direction

Current direction:

- keep public stage schema compatible
- evolve runtime node model internally
- expose safer player payloads
- improve admin editing of richer node rules
- improve player UX
- reduce deploy friction
- keep live runtime data separated from code

---

## 📄 License

MIT recommended.

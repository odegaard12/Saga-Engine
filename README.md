# SAGA Engine

**Self-hosted engine for real-world, geolocated games and interactive routes.**

![release](https://img.shields.io/badge/release-v0.0.1-0ea5e9)
![license](https://img.shields.io/badge/license-MIT-22c55e)
![backend](https://img.shields.io/badge/backend-FastAPI-111827)
![frontend](https://img.shields.io/badge/frontend-React%20%2B%20Vite-111827)
![offline](https://img.shields.io/badge/design-offline--first-f97316)

SAGA Engine lets you create missions where players move through real places, open map nodes, scan QR/NFC props, collect items, solve challenges and progress through a route managed from **Mission Control**.

Current public release: **v0.0.1**.

---

## What can you build?

| Game idea | Example |
|---|---|
| Treasure hunt | Follow a route and collect QR objects. |
| Urban escape | Unlock clues across real locations. |
| Family gymkhana | Outdoor challenges with map nodes. |
| Orientation route | GPS, compass and clue navigation. |
| Education/tourism trail | Guided interactive stops. |
| Team field mission | Move, scan, collect and sync progress. |

---

## How it works

```text
Admin creates mission
        ↓
Adds route nodes
        ↓
Chooses game preset
        ↓
Generates QR / physical props
        ↓
Players open the player app
        ↓
Move / scan / solve / collect
        ↓
Progress is saved
        ↓
Admin monitors and adjusts players
```

---

## Main concepts

| Concept | Meaning |
|---|---|
| **Mission** | The whole game route or experience. |
| **Node** | A step on the route, usually linked to a map position. |
| **Game family** | Reusable runtime, such as GPS signal hunt or compass bearing. |
| **Preset** | A configured game option shown in the editor. |
| **Requirement** | Something needed before a node can be completed. |
| **Inventory item** | QR/NFC/object collected by the player. |
| **Progress** | Player state, current node, finished status and offline queue. |

---

## Player app

Current player foundations:

- map-first route view;
- GPS/radius based nodes;
- QR inventory collection;
- player/team identity markers;
- local/offline-first foundations;
- mission pack/preload foundation;
- field photo pins;
- route progress flow.

Player loop:

```text
Move -> Find -> Scan -> Collect -> Solve -> Continue
```

---

## Mission Control admin

Mission Control is the main authoring and control interface.

| Area | Current capability |
|---|---|
| Mission editing | Map-first route editing and node ordering. |
| Game authoring | Game catalog with runtime/offline status. |
| QR props | QR card builder for objects, keys, clues and bonus cards. |
| Players | Profile management and progress controls. |
| Live control | Reset, move back, move forward or finish a player run. |
| Families | Overview of gameplay families. |

The old classic admin has been retired. `/admin` redirects to `/admin-react`.

---

## Current game families

```text
signal_hunt
bearing_hunt
circuit_matrix
```

Authoring direction:

```text
Family -> Preset/Game -> Completion method -> Requirement -> Reward
```

---

## Offline-first direction

SAGA is designed for field conditions where mobile coverage may be unreliable.

Current foundations:

- local player progress;
- QR inventory cards;
- physical event queue foundations;
- mission pack/preload foundations;
- sync-oriented backend events;
- runtime data separated from repository code.

---

## Storage

Runtime state is kept outside the public repository.

JSON remains supported for simple/self-hosted setups. SQLite can be enabled for production-style runtime storage:

```bash
SAGA_STORAGE_BACKEND=sqlite
SAGA_SQLITE_DB=/absolute/path/to/saga.sqlite3
```

---

## Deployment

Production should run from a locally built Docker image with runtime data mounted separately.

Useful docs:

- `docs/operations/clean-docker-production-deploy.md`
- `docs/operations/sqlite-runtime-only.md`
- `docs/operations/docker-runtime.md`

---

## Privacy and security

Do not commit:

- real `.env` files;
- secrets or tokens;
- private keys;
- logs;
- backups;
- local databases;
- runtime player state;
- private operational paths or IPs;
- live player data.

Run guards:

```bash
python scripts/check_audit_guards.py --base origin/main
```

---

## Development validation

```bash
python scripts/check_audit_guards.py --base origin/main
cd frontend && npm run build
ADMIN_PASS='pytest_admin_password' PYTHONPATH=. ./.venv/bin/python -m pytest -q
```

---

## Repository status

This repository was reset at **v0.0.1** as the first public baseline.

`main` intentionally starts from one public release commit. Earlier private/internal iteration history is not part of the public baseline.

---

## Roadmap

Near-term:

- improve visual game authoring in Mission Control;
- simplify the admin node editor;
- make game presets easier to understand and edit;
- add more reusable offline-ready game presets;
- harden QR route completion with explicit, predictable flow;
- improve PWA/offline polish;
- continue backend modularization.

---

## License

MIT.

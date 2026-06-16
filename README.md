# SAGA Engine

**Self-hosted engine for real-world, geolocated games and interactive routes.**

![release](https://img.shields.io/badge/release-v0.4.0-0ea5e9)
![license](https://img.shields.io/badge/license-MIT-22c55e)
![backend](https://img.shields.io/badge/backend-FastAPI-111827)
![frontend](https://img.shields.io/badge/frontend-React%20%2B%20Vite-111827)
![offline](https://img.shields.io/badge/design-offline--first-f97316)

SAGA Engine lets you create missions where players move through real places, open map nodes, scan QR/NFC props, collect items, solve challenges and progress through a route managed from **Mission Control**.

Current public release: **v0.4.0**.

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
| **Game family** | Reusable runtime that can support one or more playable game presets. |
| **Game preset** | A playable configuration selected and edited in Mission Control. |
| **Requirement** | Something needed before a node can be completed. |
| **Inventory item** | QR/NFC/object collected by the player. |
| **Progress** | Player state, current node, finished status and offline queue. |

---

## Player app

Current player foundations:

- map-first route view;
- GPS/radius-based node access;
- QR inventory collection;
- player and team identity markers;
- local and offline-first progress;
- mission pack and preload foundations;
- field photo pins;
- route progression and node completion;
- Circuit Matrix visual-memory puzzle;
- Sequence Code physical-clue puzzle;
- Place Mosaic image-reconstruction puzzle;
- fixed or per-game random circuit patterns;
- offline QR objects, keys, clues and bonus cards.

Player loop:

```text
Move -> Find -> Observe -> Scan -> Collect -> Solve -> Continue
```

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

## Runtime families and game presets

SAGA separates reusable runtime families from the playable presets
configured in Mission Control.

### Runtime families

| Runtime family | Current use |
|---|---|
| `circuit_matrix` | Hosts Circuit Matrix, Sequence Code and Place Mosaic. |
| `signal_hunt` | Experimental GPS runtime pending field validation. |
| `bearing_hunt` | Experimental direction runtime pending redesign and validation. |

### Production game presets

```text
Circuit Matrix
Sequence Code
Place Mosaic
```

Authoring model:

```text
Runtime family -> Game preset -> Configuration -> Requirement -> Reward
```

---

## Production-ready gameplay

### Circuit Matrix

The first complete reusable puzzle runtime:

- visual memory route;
- fixed or per-game random patterns;
- visual pattern authoring in Mission Control;
- configurable board, preview speed and allowed errors;
- strict validation against jumps, duplicates and invalid cells;
- offline completion and later synchronization.

### Sequence Code

The second production-ready reusable game:

- configurable words, numbers or symbols;
- visual authoring and ordering in Mission Control;
- shuffled choices for every play session;
- configurable attempts and optional hints;
- physical-story and triptych gameplay model;
- strict persistence verification after saving;
- validated transition to the following mission node;
- offline play and later synchronization.

### Place Mosaic

The third production-ready reusable game:

- photograph upload and optimization in Mission Control;
- 2×2, 3×3 and 4×4 puzzles;
- configurable initial photograph preview;
- shuffled pieces for every play session;
- immediate two-tap piece exchange;
- correctly positioned piece and movement feedback;
- explicit completed-image confirmation;
- optional real-world observation question;
- normal offline completion and route advancement.

Photographs and mission configuration remain in external runtime data
and are not committed to the public repository.

### Physical QR nodes

Mission Control can create and export QR cards for:

- collectible objects;
- keys used as later requirements;
- clue cards;
- optional bonus rewards.

QR inventory works locally and is compatible with offline player progress.

## Current support level

| Capability | Status |
|---|---|
| Circuit Matrix | Production-ready |
| Sequence Code | Production-ready |
| Place Mosaic | Production-ready |
| QR objects, keys, clues and bonuses | Production-ready |
| Guided Mission Control editor | Production-ready |
| Offline progress and event synchronization | Production-ready foundation |
| GPS Signal Hunt | Experimental; field validation pending |
| Bearing Hunt | Experimental; redesign and validation pending |
| Motion Challenge | Parked experimental prototype |
| Team games | Planned |

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

The repository began with **v0.0.1** as its public foundation.

**v0.4.0** provides three production-ready reusable games—Circuit
Matrix, Sequence Code and Place Mosaic—together with physical QR nodes,
guided authoring and validated offline progression.

The public Git history starts at the v0.0.1 baseline. Earlier private
or internal iteration history is intentionally not included.

## Roadmap

Near-term:

- continue simplifying Mission Control and the node editor;
- improve reusable game templates and real mission examples;
- validate, redesign or replace experimental GPS and bearing games;
- add more distinctive offline-ready game presets;
- harden QR route completion with an explicit and predictable flow;
- improve PWA installation, caching and offline recovery;
- reduce frontend bundle size through code splitting;
- continue backend and frontend modularization.

## License

MIT.

# SQLite Storage Foundation

SAGA currently uses JSON files for runtime state. The JSON backend is now safer than before because writes are locked, atomic and covered by tests, but high-churn multiplayer features need transactional storage.

SQLite is the recommended next storage layer because it fits SAGA's deployment model:

- works well on Raspberry Pi
- uses one local file
- requires no separate database server
- supports transactions
- supports WAL mode
- is enough for small/medium self-hosted games

## Current status

The first SQLite foundation is available as a module, but it is not the active production backend yet.

Current active backend:

- JSON files

SQLite foundation tables:

- events
- game_state
- positions
- schema_meta

## Why not migrate everything at once

SAGA should avoid risky storage migrations while the engine is evolving quickly.

The intended path is:

1. Keep JSON active.
2. Add SQLite schema and tests.
3. Add storage adapter interfaces.
4. Migrate event log first.
5. Migrate game state.
6. Migrate positions.
7. Later evaluate stages/config/admin auth.

## Events table

The events table is for:

- offline sync
- QR/NFC scans
- team-ready actions
- inventory changes
- admin actions
- future reconciliation

## Game state table

The game_state table stores player progress:

- user
- level
- updated_at

## Positions table

The positions table stores live player presence:

- user
- last_seen
- gps_status
- lat
- lon
- source
- debug_enabled
- updated_at

## Safety

SQLite does not change the privacy boundary.

Do not store:

- admin passwords
- raw tokens
- private logs
- backups
- unnecessary private paths
- sensitive free text

## First optional adapter

The first optional SQLite adapter is the event store.

Default:

    SAGA_STORAGE_BACKEND=json

Optional event storage through SQLite:

    SAGA_STORAGE_BACKEND=sqlite
    SAGA_SQLITE_DB=/path/to/saga.sqlite3

When enabled, event append/list/mark operations use SQLite. Other runtime state can remain JSON until migrated separately.

This staged approach lets SAGA move high-churn data first while keeping the deployment safe and reversible.

## Second optional adapter

The second optional SQLite adapter is the game state store.

Default:

    SAGA_STORAGE_BACKEND=json

Optional game state storage through SQLite:

    SAGA_STORAGE_BACKEND=sqlite
    SAGA_SQLITE_DB=/path/to/saga.sqlite3

When enabled, player progress operations can use SQLite through the adapter layer. JSON remains the default storage backend.

## Third optional adapter

The third optional SQLite adapter is the live positions store.

Default:

- `SAGA_STORAGE_BACKEND=json`

Optional live positions storage through SQLite:

- `SAGA_STORAGE_BACKEND=sqlite`
- `SAGA_SQLITE_DB=/path/to/saga.sqlite3`

When enabled, live presence load/save/upsert/remove operations can use SQLite through the adapter layer.

JSON remains the default storage backend. Existing deployments do not change unless SQLite is explicitly enabled.

## Heartbeat write path

The public `/api/heartbeat` route now writes live presence through the positions adapter.

Default behavior remains JSON-backed. When `SAGA_STORAGE_BACKEND=sqlite` is enabled, heartbeat updates use the SQLite positions upsert path instead of rewriting the full live positions document.

This keeps live presence migration opt-in while reducing write amplification for the high-churn heartbeat path.

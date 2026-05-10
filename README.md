# SAGA Engine

SAGA Engine is a modern engine for real-world, geolocated games.

It is designed for interactive missions, outdoor routes, GPS nodes, team play, physical props, QR/NFC interactions, offline-first gameplay and admin-driven Mission Control.

The current public repository is focused on a safe, auditable foundation before expanding gameplay features.

## Current status

SAGA Engine currently includes:

- FastAPI backend.
- React/Vite/TypeScript frontend.
- Leaflet-based map UI.
- React admin CMS / Mission Control.
- Player game flow.
- Family-based minigame architecture.
- JSON storage as the default runtime backend.
- Optional SQLite storage adapters.
- Offline event sync foundation.
- Downloadable mission pack foundation.
- Protected repository/privacy guards.
- Security documentation and audit closeout roadmap.

The classic admin UI has been retired. `/admin` redirects to `/admin-react`, and the React admin is the primary CMS/Mission Control interface.

## Gameplay families

Current minigame families:

- `signal_hunt`
- `bearing_hunt`
- `circuit_matrix`

The target architecture is not a collection of isolated minigames. SAGA Engine is moving toward:

- families
- presets
- variants
- schemas
- physical interactions
- inventory
- team/asymmetric missions

## Admin CMS

The React admin is the main CMS.

Its direction is map-first Mission Control:

- visible real map
- node list and map selection
- GPS/radius/status inspection
- player/team overview
- mission status
- event review
- future physical interaction/inventory editing

The old classic admin is no longer the intended editing surface.

## Storage model

Default storage remains JSON.

Optional SQLite storage is available for runtime data when explicitly enabled:

```bash
SAGA_STORAGE_BACKEND=sqlite
SAGA_SQLITE_DB=/absolute/path/to/saga.sqlite3
```

SQLite is currently supported through adapters for:

- event log
- player game state/progress
- live positions/presence

JSON remains the default because this avoids breaking existing self-hosted deployments.

## SQLite migration dry-run

Before enabling SQLite on a real deployment, run a dry-run against copied data:

```bash
python scripts/sqlite_migration_dry_run.py --data-dir data
```

The dry-run:

- reads `gamestate.json`
- reads `positions.json`
- reads `events.json`
- writes to a temporary SQLite database by default
- compares JSON input counts with SQLite output counts
- does not modify JSON files
- does not enable SQLite for the running app

See:

```text
docs/operations/sqlite-migration-dry-run.md
```

## Security model

Important current security defaults:

- Admin uses an HttpOnly session cookie.
- Legacy admin password-in-payload authorization is disabled by default.
- Legacy payload auth can only be enabled explicitly with:

```bash
SAGA_ALLOW_LEGACY_ADMIN_PASSWORD_PAYLOAD=1
```

- Invalid admin login returns a clean `401`.
- Trusted proxy headers are ignored by default.
- Proxy headers are only trusted when explicitly enabled and the direct client is trusted.
- `data/stages.json` is protected by CI.
- Repository privacy guard blocks common accidental leaks.

Security docs:

```text
docs/security/admin-auth.md
docs/security/client-ip.md
docs/security/privacy-guard.md
docs/security/protected-files.md
docs/security/audit-closeout-roadmap.md
```

## Repository privacy rules

This is a public repository.

Do not commit:

- real `.env` files
- secrets or tokens
- private keys
- logs
- backups
- local databases
- runtime state
- private IPs/paths unless absolutely required and sanitized
- live player data
- CUPS or unrelated personal data

The repository includes automated guards for common accidental leaks.

Run locally:

```bash
python scripts/check_audit_guards.py --base origin/main
```

## Protected stage content

`data/stages.json` contains production mission/stage content and is protected.

Do not modify it in audit, storage, security, CI, documentation or backend refactor PRs.

Intentional stage-content PRs must be explicit and use:

```bash
SAGA_ALLOW_PROTECTED_STAGES_CHANGE=1
```

## Development validation

Typical validation commands:

```bash
python scripts/check_audit_guards.py --base origin/main
ADMIN_PASS='contract_test_admin_password' ./.venv/bin/python scripts/contract_check.py
cd frontend && npm run build
ADMIN_PASS='pytest_admin_password' PYTHONPATH=. ./.venv/bin/python -m pytest -q
```

## Current audit closeout state

The major audit blockers have been addressed:

- formal MIT license
- classic admin retired
- React admin as primary CMS
- real frontend build validation
- backend smoke tests and contract checks
- HttpOnly admin session cookie
- legacy password payload disabled by default
- invalid admin login hardening
- trusted proxy opt-in
- JSON storage helpers and transaction helper
- optional SQLite adapters
- route-level SQLite tests
- heartbeat through positions adapter
- player progress routes through game state adapter
- SQLite migration dry-run
- protected `data/stages.json`
- repository privacy guard
- extracted client IP security helpers
- extracted admin auth helpers

Remaining cleanup before major gameplay features:

- continue splitting `main.py` into route modules
- remove confirmed obsolete/legacy artifacts
- optionally test SQLite activation on copied runtime data before enabling it on a real deployment

## Roadmap

Near-term foundation:

1. Keep JSON as default storage.
2. Test SQLite dry-run with copied data.
3. Prepare optional SQLite activation on a non-critical environment.
4. Continue reducing `main.py`.
5. Clean obsolete legacy artifacts.

Gameplay roadmap after foundation cleanup:

1. Offline/local-first player core foundation added.
2. Team presence cache and stale/offline map markers wired into the player map.
3. QR/NFC/manual physical event queue foundation added; manual code fallback and Tools sync panel wired.
4. Inventory and physical interaction rules.
5. Team/cooperative/asymmetric missions.
6. PWA/offline polish.

## License

MIT.

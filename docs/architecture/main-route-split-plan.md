# Main route split plan

`main.py` has already been reduced by extracting storage, client IP and admin auth helpers.

The next maintainability step is splitting FastAPI route groups into route modules.

## Goals

- Keep route behavior unchanged.
- Avoid touching `data/stages.json`.
- Keep JSON as default storage.
- Keep SQLite opt-in.
- Keep audit/privacy guards active.
- Move in small/medium route-group PRs.

## Proposed route modules

Suggested target modules:

- `backend/app/routes/health.py`
- `backend/app/routes/player.py`
- `backend/app/routes/admin.py`
- `backend/app/routes/events.py`
- `backend/app/routes/config.py`

## Recommended order

1. Move health/status routes first.
2. Move public player read routes.
3. Move event sync/admin event routes.
4. Move admin config/stage routes.
5. Move admin Mission Control/profile recovery routes.

## Compatibility approach

During migration, keep existing route paths unchanged.

Avoid broad rewrites. Prefer importing shared helpers from existing runtime/storage/security modules.

## Validation

Every route split PR should run:

- `python scripts/check_audit_guards.py --base origin/main`
- contract check
- full pytest
- frontend build
- protected stages check

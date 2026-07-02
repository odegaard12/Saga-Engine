# SAGA Engine v2.0.1 — Security Hardening & Release Alignment

SAGA Engine v2.0.1 focuses on repository hardening, safer runtime defaults, and release consistency across the backend, frontend, Docker image, and deployment tooling.

## Security hardening
- Disabled `/docs`, `/redoc`, and OpenAPI by default in production-style runs.
- Removed `mapbox_token` from the public `/api/config` response.
- Added signed player-session cookies for `/api/advance` and `/api/events/sync`.
- Added basic rate limiting for `/api/advance` and `/api/events/sync`.
- Changed `/api/admin/react-overview` to return HTTP 403 on auth failures.
- Required an active admin session for `/api/admin/change-password`.
- Added explicit CORS middleware plus browser security headers.
- Persisted admin sessions in runtime storage so they survive process restarts.

## Container and deploy safety
- Docker now runs as a non-root user.
- Docker copies only runtime files instead of the whole repository tree.
- The safe deploy script now uses `$HOME`-relative defaults, validates image names, and removes hardcoded LAN/server paths from user-facing output.
- Vite development host settings now come from environment variables instead of a hardcoded production domain.

## Repository hygiene
- Added Python dependency coverage to Dependabot.
- Removed unsafe GitHub token scraping patterns from release helper scripts.
- Aligned repo, frontend, and docs version metadata to `2.0.1`.
- Removed the dead return in the service-worker alias route.

## Notes
- Existing baseline backend failures in `tests/test_sqlite_migration_dry_run.py` remain pre-existing and are unrelated to this release hardening pass.

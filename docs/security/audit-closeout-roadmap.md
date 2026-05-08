# Audit closeout roadmap

This document tracks the remaining security/audit work before returning focus to gameplay, PWA/offline, QR/NFC, inventory and team mechanics.

## Closed or mostly closed

- Formal MIT license.
- Classic admin retired; React admin is the primary CMS/Mission Control.
- Real frontend build validation in CI.
- Backend smoke tests and contract checks.
- HttpOnly admin session cookie flow.
- Legacy admin password payload disabled by default.
- Invalid admin login now returns a clean `401`.
- Trusted proxy handling is opt-in.
- JSON storage helpers and transaction helper.
- Event log repository and optional SQLite event adapter.
- Game state repository and optional SQLite game state adapter.
- Live positions repository and optional SQLite positions adapter.
- Heartbeat writes routed through the positions adapter.
- Player progress routes routed through the game state adapter.
- `data/stages.json` protected by CI.
- Repository privacy guard added.

## Remaining before gameplay work resumes

Recommended remaining audit PRs:

1. Start splitting `main.py` into route modules after security helpers are isolated.

## Rule for stage content

Do not modify `data/stages.json` in audit, storage, security, CI or backend refactor PRs.

Stage content changes must be explicit mission/content PRs and must use:

`SAGA_ALLOW_PROTECTED_STAGES_CHANGE=1`

## Closed in client IP / event SQLite audit PR

- Trusted proxy/client IP helpers extracted to `backend/app/security/client_ip.py`.
- Route-level SQLite tests added for player event sync, admin event listing and admin event marking.

## Closed in SQLite migration dry-run PR

- Added a non-destructive SQLite migration dry-run script.
- Added pytest coverage for JSON-to-SQLite dry-run behavior.
- Documented backup, activation and rollback checklist for optional SQLite storage.

## Closed in admin auth extraction PR

- Admin password hashing, persistence helpers, session cookie helpers, legacy payload gate and login lockout helpers were extracted to `backend/app/security/admin_auth.py`.
- `main.py` keeps compatibility wrappers for existing route code and tests.

## Closed in README refresh PR

- Main README updated to reflect the current engine status.
- Storage model documented as JSON default with optional SQLite adapters.
- Security posture, repository guards and protected stage policy documented from the public entry point.
- Cleanup checklist added before major gameplay work resumes.
